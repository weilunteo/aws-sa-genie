import { S3 } from '@aws-sdk/client-s3';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { randomUUID } from 'crypto';

const s3 = new S3();
const ddbClient = new DynamoDB();
const dynamodb = DynamoDBDocument.from(ddbClient);

export const handler = async (event) => {
    console.log('Lambda function invoked with event:', JSON.stringify(event));
    
    try {
        const requestBody = JSON.parse(event.body);
        console.log('Request body parsed successfully');
        
        const base64Data = requestBody.body;
        const appId = requestBody.appId;

        if (!appId) {
            throw new Error('appId is required in the request body');
        }

        // Send "Loading..." message via websocket
        const endpoint = process.env.API_ENDPOINT.replace(/^(wss?|https?):\/\//, '');
        const apigwManagementApi = new ApiGatewayManagementApiClient({
            endpoint: `https://${endpoint}`
        });

        // Get connections for this appId
        const connections = await dynamodb.query({
            TableName: process.env.CONNECTIONS_TABLE,
            IndexName: 'byAppId',
            KeyConditionExpression: 'appId = :appId',
            ExpressionAttributeValues: {
                ':appId': appId
            }
        });

        // Send "Loading..." to all connected clients
        if (connections.Items) {
            await Promise.all(
                connections.Items.map(async (connection) => {
                    try {
                        const command = new PostToConnectionCommand({
                            ConnectionId: connection.connectionId,
                            Data: JSON.stringify({
                                message: "Loading..."
                            })
                        });
                        await apigwManagementApi.send(command);
                    } catch (error) {
                        if (error.statusCode === 410) {
                            // Connection is stale, remove it
                            await dynamodb.delete({
                                TableName: process.env.CONNECTIONS_TABLE,
                                Key: { connectionId: connection.connectionId }
                            });
                        }
                        // Don't throw error, continue with upload even if websocket fails
                        console.error('Error sending websocket message:', error);
                    }
                })
            );
        }
        
        console.log('Audio data length:', base64Data.length);
        console.log('Using appId:', appId);

        const audioBuffer = Buffer.from(base64Data, 'base64');
        console.log('Audio buffer created, size:', audioBuffer.length);
        
        const filename = `${randomUUID()}.mp3`;
        console.log('Generated filename:', filename);
        
        // Get environment variables for bucket name and folder path
        const bucketName = process.env.S3_BUCKET_NAME;
        const folderPath = process.env.S3_FOLDER_PATH;
        const fullPath = `${folderPath}${filename}`;
        
        console.log('Using bucket name:', bucketName);
        console.log('Using folder path:', folderPath);
        console.log('Full S3 path:', fullPath);
        
        if (!bucketName) {
            throw new Error('Bucket name environment variable S3_BUCKET_NAME is not set');
        }

        console.log('Attempting to upload to S3...');
        const result = await s3.putObject({
            Bucket: bucketName,
            Key: fullPath,
            Body: audioBuffer,
            ContentType: 'audio/mp3',
            Metadata: {
                appid: appId // S3 metadata keys are automatically lowercased
            }
        });
        
        console.log('S3 upload successful:', JSON.stringify(result));

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Audio file uploaded successfully',
                filename: fullPath,
                bucket: bucketName
            })
        };

    } catch (error) {
        console.error('Error:', error);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Failed to process audio file',
                details: error.message
            })
        };
    }
};
