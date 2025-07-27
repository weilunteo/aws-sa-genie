import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';

const dynamodb = new DynamoDB.DocumentClient();
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    // Remove the connection
    await dynamodb.delete({
      TableName: CONNECTIONS_TABLE,
      Key: {
        connectionId
      }
    }).promise();

    return {
      statusCode: 200,
      body: 'Disconnected'
    };
  } catch (error) {
    console.error('Error removing connection:', error);
    return {
      statusCode: 500,
      body: 'Failed to disconnect'
    };
  }
};
