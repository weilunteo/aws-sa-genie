import { DynamoDBStreamHandler } from 'aws-lambda';
import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk';

const dynamodb = new DynamoDB.DocumentClient();
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const API_ENDPOINT = process.env.API_ENDPOINT!;

export const handler: DynamoDBStreamHandler = async (event) => {
  // Create API Gateway management API client
  const endpoint = API_ENDPOINT.replace(/^(wss?|https?):\/\//, '');
  const apigwManagementApi = new ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: endpoint
  });

  for (const record of event.Records) {
    // We only care about new images (INSERTS and MODIFIES)
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
      continue;
    }

    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    // Parse the DynamoDB Stream record
    const appId = DynamoDB.Converter.output(newImage.appId);
    const message = DynamoDB.Converter.output(newImage.message);

    try {
      // Query connections for this appId
      const connections = await dynamodb.query({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'byAppId',
        KeyConditionExpression: 'appId = :appId',
        ExpressionAttributeValues: {
          ':appId': appId
        }
      }).promise();

      // Send message to all connected clients for this appId
      const postToConnection = async (connectionId: string) => {
        try {
          await apigwManagementApi.postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({
              message: message
            })
          }).promise();
        } catch (error: any) {
          if (error.statusCode === 410) {
            // Connection is stale, remove it
            await dynamodb.delete({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId }
            }).promise();
          } else {
            throw error;
          }
        }
      };

      // Send to all connections in parallel
      if (connections.Items) {
        await Promise.all(
          connections.Items.map(connection => 
            postToConnection(connection.connectionId)
          )
        );
      }
    } catch (error) {
      console.error('Error processing stream record:', error);
      // Continue processing other records even if one fails
      continue;
    }
  }
};
