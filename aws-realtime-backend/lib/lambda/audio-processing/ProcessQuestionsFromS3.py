import json
import boto3
import uuid
import os
from urllib.parse import unquote_plus


def lambda_handler(event, context):
    """
    AWS Lambda function triggered by S3 events when new audio files are uploaded
    
    This function:
    1. Gets the S3 bucket and key from the event
    2. Starts an Amazon Transcribe job for the audio file
    3. Configures the output to go to a specific S3 location
    """
    print("Processing S3 event:", json.dumps(event))
    
    # Get bucket and key from the S3 event
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = unquote_plus(event['Records'][0]['s3']['object']['key'])
    
    print(f"Processing audio file: s3://{bucket}/{key}")
    
    # Check if the file is an audio file
    audio_extensions = ['.mp3', '.mp4', '.wav', '.flac', '.ogg', '.amr', '.webm']
    if not any(key.lower().endswith(ext) for ext in audio_extensions):
        print(f"File {key} is not a supported audio format. Skipping.")
        return {
            'statusCode': 200,  
            'body': json.dumps({
                'message': f'File {key} is not a supported audio format. Skipping.'
            })
        }
    
    # Initialize AWS clients
    transcribe = boto3.client('transcribe')
    s3 = boto3.client('s3')

    
    try:
        # Use the initial filename as the job name
        job_name = f"{os.path.basename(key)}"
        
        # Get file extension for media format
        _, file_extension = os.path.splitext(key)
        media_format = file_extension[1:].lower()  # Remove the dot and convert to lowercase
        
        # Handle special cases for media format
        if media_format == 'mp4':
            media_format = 'mp4'  # or 'mp3' depending on the audio codec
        elif media_format == 'webm':
            media_format = 'webm'
        
        # Define output key - store in a 'transcriptions' prefix
        output_key = f"transcriptions/{os.path.basename(key)}.json"
        
        # Get appId from source file metadata
        source_metadata = s3.head_object(Bucket=bucket, Key=key)
        app_id = source_metadata.get('Metadata', {}).get('appid')
        
        if not app_id:
            print(f"Warning: No appId found in metadata for {key}")
            app_id = "unknown"
        
        # Start transcription job
        response = transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={
                'MediaFileUri': f"s3://{bucket}/{key}"
            },
            MediaFormat=media_format,
            LanguageCode='en-US',  # You can make this configurable
            OutputBucketName=bucket,
            OutputKey=output_key,
            Settings={
                'ShowSpeakerLabels': True,
                'MaxSpeakerLabels': 10,  # Adjust based on your needs
                'ShowAlternatives': False
            },
            Tags=[
                {
                    'Key': 'appId',
                    'Value': app_id
                }
            ]
        )
        
        print(f"Started transcription job: {job_name}")
        print(f"Output will be saved to: s3://{bucket}/{output_key}")
        
        # Optionally, you could add the file to a "processing" prefix
        # if not key.startswith('processing/'):
        #     processing_key = f"processing/{key}"
        #     s3.copy_object(
        #         Bucket=bucket,
        #         CopySource={'Bucket': bucket, 'Key': key},
        #         Key=processing_key
        #     )
        #     print(f"Copied audio file to: s3://{bucket}/{processing_key}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully started transcription job {job_name} for s3://{bucket}/{key}',
                'job_name': job_name,
                'output_location': f"s3://{bucket}/{output_key}"
            })
        }
        
    except Exception as e:
        print(f"Error starting transcription job: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }
