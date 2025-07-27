import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';

const dynamodb = new DynamoDB.DocumentClient();
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const TTL_DURATION = 2 * 60 * 60; // 2 hours in seconds

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const appId = event.queryStringParameters?.appId;

  if (!appId) {
    return {
      statusCode: 400,
      body: 'appId is required in query parameters'
    };
  }

  try {
    // Store the connection with a TTL
    await dynamodb.put({
      TableName: CONNECTIONS_TABLE,
      Item: {
        connectionId,
        appId,
        ttl: Math.floor(Date.now() / 1000) + TTL_DURATION
      }
    }).promise();

    return {
      statusCode: 200,
      body: 'Connected'
    };
  } catch (error) {
    console.error('Error storing connection:', error);
    return {
      statusCode: 500,
      body: 'Failed to connect'
    };
  }
};
