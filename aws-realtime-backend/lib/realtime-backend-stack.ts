import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import { S3_PATHS } from './constants';

export class RealtimeBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for audio files and transcriptions
    const bucket = new s3.Bucket(this, 'QABucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // // DynamoDB table for app data with stream enabled !!!
    // const appDataTable = new dynamodb.Table(this, 'AppDataTable', {
    //   partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    //   stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    //   removalPolicy: cdk.RemovalPolicy.DESTROY, // For development only
    // });

    // DynamoDB table for WebSocket connections
    const connectionsTable = new dynamodb.Table(this, 'WebSocketConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development only
    });

    // DynamoDB table for Q&A
    const QATable = new dynamodb.Table(this, 'QATable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSI for appId lookups on WebSocketConnections
    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'byAppId',
      partitionKey: { name: 'appId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // Add GSI for session_id (appId) lookups on QA
    QATable.addGlobalSecondaryIndex({
      indexName: 'bySessionId',
      partitionKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // WebSocket API
    const webSocketApi = new apigatewayv2.CfnApi(this, 'WebSocketApi', {
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action'
    });

    // Create Lambda functions for WebSocket handling
    const connectHandler = new nodejs.NodejsFunction(this, 'ConnectHandler', {
      entry: path.join(__dirname, 'lambda/connect-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName
      }
    });

    const disconnectHandler = new nodejs.NodejsFunction(this, 'DisconnectHandler', {
      entry: path.join(__dirname, 'lambda/disconnect-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName
      }
    });

    // const streamHandler = new nodejs.NodejsFunction(this, 'StreamHandler', { !!!
    //   entry: path.join(__dirname, 'lambda/stream-handler.ts'),
    //   handler: 'handler',
    //   timeout: cdk.Duration.seconds(60),
    //   environment: {
    //     CONNECTIONS_TABLE: connectionsTable.tableName,
    //     API_ENDPOINT: `${webSocketApi.attrApiEndpoint}/prod`
    //   }
    // });

     // Create the Bedrock response handler Lambda
    const bedrockResponseHandler = new nodejs.NodejsFunction(this, 'BedrockResponseHandler', {
      entry: path.join(__dirname, 'lambda/bedrock-response-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
        API_ENDPOINT: `${webSocketApi.attrApiEndpoint}/prod`
      }
    });

    // Create Lambda functions for audio processing pipeline
    const uploadRecordingHandler = new lambda.Function(this, 'UploadRecordingToS3', { // might need to use nodejs.NodejsFunction
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'UploadRecordingToS3Lambda.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/audio-processing')),
      timeout: cdk.Duration.seconds(60),
      environment: {
        S3_BUCKET_NAME: bucket.bucketName,
        S3_FOLDER_PATH: S3_PATHS.RAW_AUDIO
      }
    });

    const processQuestionsHandler = new lambda.Function(this, 'ProcessQuestionsFromS3', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'ProcessQuestionsFromS3.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/audio-processing')),
      timeout: cdk.Duration.seconds(60),
    });

    // Add Transcribe permissions to ProcessQuestionsFromS3 Lambda
    processQuestionsHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['transcribe:StartTranscriptionJob', 'transcribe:GetTranscriptionJob', 'transcribe:TagResource'],
      resources: ['*']  // You may want to restrict this to specific resources
    }));

    const callBedrockHandler = new lambda.Function(this, 'CallBedrock', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'CallBedrock.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/audio-processing')),
      timeout: cdk.Duration.seconds(60),
      environment: {
        DYNAMODB_TABLE: QATable.tableName
      }
    });

    // Add Bedrock and Transcribe permissions to CallBedrock Lambda
    callBedrockHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:ListFoundationModels',
        'bedrock:GetFoundationModel',
        'transcribe:GetTranscriptionJob'
      ],
      resources: ['*']  // You may want to restrict this to specific resources
    }));

    // Grant permissions
    connectionsTable.grantWriteData(connectHandler);
    connectionsTable.grantWriteData(disconnectHandler);
    // connectionsTable.grantReadWriteData(streamHandler); !!!
    connectionsTable.grantReadWriteData(bedrockResponseHandler);
    connectionsTable.grantReadData(uploadRecordingHandler);
    // appDataTable.grantStreamRead(streamHandler); !!!
    
    bucket.grantWrite(uploadRecordingHandler);
    bucket.grantReadWrite(processQuestionsHandler);
    bucket.grantReadWrite(callBedrockHandler);
    
    QATable.grantReadWriteData(callBedrockHandler);
    QATable.grantStreamRead(bedrockResponseHandler);

    // Add S3 triggers
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processQuestionsHandler),
      { prefix: S3_PATHS.RAW_AUDIO }
    );

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(callBedrockHandler),
      { prefix: S3_PATHS.TRANSCRIPTIONS }
    );

    // // Create event source mapping for DynamoDB Stream to Lambda !!!
    // new lambda.EventSourceMapping(this, 'StreamHandlerMapping', {
    //   target: streamHandler,
    //   eventSourceArn: appDataTable.tableStreamArn,
    //   startingPosition: lambda.StartingPosition.LATEST,
    // });

    // Create event source mapping for QATable stream
    new lambda.EventSourceMapping(this, 'BedrockResponseStreamMapping', {
      target: bedrockResponseHandler,
      eventSourceArn: QATable.tableStreamArn,
      startingPosition: lambda.StartingPosition.LATEST,
    });

    // Create IAM role for API Gateway
    const apiGatewayRole = new iam.Role(this, 'ApiGatewayRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      description: 'Role for API Gateway to invoke Lambda functions',
    });

    // Grant the API Gateway role permission to invoke Lambda functions
    apiGatewayRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [
        connectHandler.functionArn,
        disconnectHandler.functionArn,
        uploadRecordingHandler.functionArn
      ]
    }));

    // Create WebSocket API integrations and routes
    const connectIntegration = new apigatewayv2.CfnIntegration(this, 'ConnectIntegration', {
      apiId: webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${connectHandler.functionArn}/invocations`,
      credentialsArn: apiGatewayRole.roleArn
    });

    const disconnectIntegration = new apigatewayv2.CfnIntegration(this, 'DisconnectIntegration', {
      apiId: webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${disconnectHandler.functionArn}/invocations`,
      credentialsArn: apiGatewayRole.roleArn
    });

    // Create REST API for audio upload
    const audioUploadApi = new apigatewayv2.HttpApi(this, 'AudioUploadApi', {
      description: 'API for audio uploads'
    });

    audioUploadApi.addRoutes({
      path: '/audio',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('AudioUploadIntegration', uploadRecordingHandler)
    });

    // Grant API Gateway permission to invoke Lambda functions
    connectHandler.addPermission('APIGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*/$connect`
    });

    disconnectHandler.addPermission('APIGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*/$disconnect`
    });

    const connectRoute = new apigatewayv2.CfnRoute(this, 'ConnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$connect',
      authorizationType: 'NONE',
      target: `integrations/${connectIntegration.ref}`
    });

    const disconnectRoute = new apigatewayv2.CfnRoute(this, 'DisconnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$disconnect',
      authorizationType: 'NONE',
      target: `integrations/${disconnectIntegration.ref}`
    });

    // Create WebSocket stage
    const stage = new apigatewayv2.CfnStage(this, 'ProdStage', {
      apiId: webSocketApi.ref,
      stageName: 'prod',
      autoDeploy: true
    });

    // Grant permissions for API Gateway to invoke Lambda functions
    const apiGatewayExecutePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`]
    });

    // streamHandler.addToRolePolicy(apiGatewayExecutePolicy); !!!
    bedrockResponseHandler.addToRolePolicy(apiGatewayExecutePolicy);
    uploadRecordingHandler.addToRolePolicy(apiGatewayExecutePolicy);

    // Export outputs
    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `${webSocketApi.attrApiEndpoint}/prod`,
      description: 'WebSocket API URL',
    });

    new cdk.CfnOutput(this, 'AudioUploadApiURL', {
      value: audioUploadApi.url!,
      description: 'HTTP API URL',
    });

    // new cdk.CfnOutput(this, 'AppDataTableName', { !!!
    //   value: appDataTable.tableName,
    //   description: 'DynamoDB App Data Table Name',
    // });

    new cdk.CfnOutput(this, 'QATableName', {
      value: QATable.tableName,
      description: 'DynamoDB Q&A Table Name',
    });

    new cdk.CfnOutput(this, 'QABucketNameOutput', {
      value: bucket.bucketName,
      description: 'Name of the S3 bucket',
    });
  }
}
