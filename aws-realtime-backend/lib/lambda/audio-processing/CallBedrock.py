import json
import boto3
import uuid
import os
import re
import time
from datetime import datetime

def extract_questions_from_transcript(transcribe_result):
    transcript = transcribe_result['results']['transcripts'][0]['transcript']

    # Split transcript into sentences (based on ., !, ? delimiters)
    raw_sentences = re.findall(r'[^.!?]*[.!?]', transcript)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    # Define question indicator words
    question_words = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose', 'whom', 
                      'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did']
    
    # Number of previous context sentences to include
    context_window = 2

    questions_text = []

    for i, sentence in enumerate(sentences):
        lower_sentence = sentence.lower()

        # Check if the sentence is a question:
        starts_with_question_word = any(lower_sentence.startswith(q_word + ' ') for q_word in question_words)
        
        if '?' in sentence or starts_with_question_word:
            # Include up to N previous sentences as context
            context_start = max(0, i - context_window)
            context = " ".join(sentences[context_start:i])
            
            # Combine context with the current sentence
            question_candidate = f"{context} {sentence}".strip() if context else sentence.strip()

            # Avoid adding duplicate questions
            if question_candidate not in questions_text:
                questions_text.append(question_candidate)

    # If no questions were found, fallback to adding the entire transcript as one "question"
    if not questions_text and transcript.strip():
        fallback = transcript.strip()
        if not fallback.endswith('?'):
            fallback += '?'
        questions_text.append(fallback)

    # Prepare the output format for each question
    questions = [{'text': q} for q in questions_text]

    # Return result dictionary with debug info
    return {
        'questions': questions,
        'timestamp': datetime.now().isoformat(),
        'transcript': transcript,
        'question_candidates': sentences,
        'questions_text': questions_text
    }

def lambda_handler(event, context):
    print("Processing S3 event:", json.dumps(event))
    
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    print(f"Processing file: s3://{bucket}/{key}")
    
    s3 = boto3.client('s3')
    bedrock_runtime = boto3.client('bedrock-runtime')
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])
    
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        transcribe_data = json.loads(response['Body'].read().decode('utf-8'))
        
        transcribe = boto3.client('transcribe')
        job_name = os.path.splitext(os.path.basename(key))[0]
        job_details = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        tags = job_details['TranscriptionJob']['Tags']
        app_id = next((tag['Value'] for tag in tags if tag['Key'] == 'appId'), "unknown")
        
        questions_data = extract_questions_from_transcript(transcribe_data)
        questions_data['appId'] = app_id
        
        transcript = questions_data.get('transcript')
        question_candidates = questions_data.get('question_candidates', [])
        questions_text = questions_data.get('questions_text', [])

        # New system prompt: for bullet points + summary
        system_prompt = """You are a helpful and concise AI assistant.

When answering a question, please follow these guidelines:

1. Focus on the MOST IMPORTANT INFORMATION relevant to the question.
2. Avoid verbose explanations or long paragraphs.
3. Structure the response as follows:
    - Start with a short **Summary** section.
    - Then provide up to **3 titled sections** (### Heading), each with 2-4 concise bullet points.
    - Place less critical information only in the Summary, not in main sections.
4. Use **bullet points** that are short and easy to read (1-2 lines max).
5. Do NOT use table format.
6. Keep the tone professional and informative.

Example format:

### Summary
- Short summary here.

### Section 1 Title
- Bullet 1
- Bullet 2

### Section 2 Title
- Bullet 1
- Bullet 2

### Section 3 Title
- Bullet 1
- Bullet 2

"""

        processed_count = 0
        for question in questions_data.get('questions', []):
            question_id = str(uuid.uuid4())
            question_text = question['text']
            
            print(f"Processing question: {question_text[:50]}...")
            
            item = {
                'id': question_id,
                'question': question_text,
                'timestamp': questions_data.get('timestamp', datetime.now().isoformat()),
                'session_id': app_id,
                'status': 'PROCESSING',
                'created_at': datetime.now().isoformat(),
                's3_source': f"s3://{bucket}/{key}"
            }
            table.put_item(Item=item)
            
            try:
                # time.sleep(3) 
                # Prepare Messages API payload
                response = bedrock_runtime.invoke_model(
                    modelId='anthropic.claude-3-haiku-20240307-v1:0',
                    contentType='application/json',
                    accept='application/json',
                    body=json.dumps({
                        "anthropic_version": "bedrock-2023-05-31",
                        "messages": [
                            {
                                "role": "user",
                                "content": f"{system_prompt}\n\nNow please answer the following question:\n\n{question_text}"
                            }
                        ],
                        "max_tokens": 500,
                        "temperature": 0.7,
                        "top_p": 0.9
                    })
                )
                
                response_body = json.loads(response['body'].read())
                
                # For Messages API the answer is under 'content' field of the 'content' array
                # Depending on actual Bedrock response shape — adjust if needed
                # Here assuming typical response
                answer = response_body['content'][0]['text'] if 'content' in response_body and response_body['content'] else "No answer."

                table.update_item(
                    Key={'id': question_id},
                    UpdateExpression="set answer=:a, #status_attr=:s, updated_at=:u",
                    ExpressionAttributeNames={'#status_attr': 'status'},
                    ExpressionAttributeValues={
                        ':a': answer,
                        ':s': 'COMPLETED',
                        ':u': datetime.now().isoformat()
                    }
                )
                
                processed_count += 1
                print(f"Successfully processed question: {question_text[:50]}...")
                
            except Exception as e:
                table.update_item(
                    Key={'id': question_id},
                    UpdateExpression="set #status_attr=:s, #error_attr=:e, updated_at=:u",
                    ExpressionAttributeNames={
                        '#status_attr': 'status',
                        '#error_attr': 'error'
                    },
                    ExpressionAttributeValues={
                        ':s': 'ERROR',
                        ':e': str(e),
                        ':u': datetime.now().isoformat()
                    }
                )
                print(f"Error processing question: {str(e)}")
        
        if not key.startswith('processed/'):
            processed_key = f"processed/{key}"
            s3.copy_object(
                Bucket=bucket,
                CopySource={'Bucket': bucket, 'Key': key},
                Key=processed_key
            )
            print(f"Moved processed file to: s3://{bucket}/{processed_key}")
            print("Full transcript:", transcript)
            print("Initial question candidates:", question_candidates)
            print("Final extracted questions:", questions_text)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully processed {processed_count} questions from s3://{bucket}/{key}'
            })
        }

    except Exception as e:
        print(f"Error processing file: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }
