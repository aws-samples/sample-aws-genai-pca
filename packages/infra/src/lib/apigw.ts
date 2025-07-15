// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import path from 'path';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import { WafwebaclToApiGateway } from '@aws-solutions-constructs/aws-wafwebacl-apigateway';
import { Duration, Stack } from 'aws-cdk-lib';
import { RestApi, EndpointType, CognitoUserPoolsAuthorizer, MethodLoggingLevel, MethodOptions, AuthorizationType, LambdaIntegration, JsonSchemaVersion, JsonSchemaType } from 'aws-cdk-lib/aws-apigateway';
import { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';

import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { getBedrockResourceArns } from './bedrock-utils';
import { supressIAM4ByPath, supressIAM5ByPath } from './nag-utils';
export interface ApiConstructProps {
  readonly userPool: IUserPool;
  readonly userPoolClient: IUserPoolClient;
  readonly allowedDomains: string;
  readonly metadataTable: Table;
  readonly recordTypeGSIName: string;
  readonly inputBucket: IBucket;
  readonly commonLambdaLayer: PythonLayerVersion;
  readonly bedrockModelId: string;
  readonly inferenceProfileRegionArns?: string[];
}

export class ApiConstruct extends Construct {
  public readonly apiUrl: string;
  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const apiHandlerFn = new PythonFunction(this, 'apigw-handler', {
      entry: path.join(__dirname, './lambdas/api-handler'),
      index: 'app.py',
      handler: 'handler',
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(20),
      environment: {
        ALLOWED_DOMAINS: props.allowedDomains,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
        INPUT_S3_BUCKET: props.inputBucket.bucketName,
        DDB_RECORD_TYPE_INDEX: props.recordTypeGSIName,
      },
    });
    props.inputBucket.grantReadWrite(apiHandlerFn);
    props.metadataTable.grantReadData(apiHandlerFn);
    const genAiHandlerFn = new PythonFunction(this, 'genai-handler', {
      entry: path.join(__dirname, './lambdas/genai-handler'),
      index: 'app.py',
      handler: 'handler',
      memorySize: 512,
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(30),
      environment: {
        ALLOWED_DOMAINS: props.allowedDomains,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
        INPUT_S3_BUCKET: props.inputBucket.bucketName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
      layers: [props.commonLambdaLayer],
    });
    genAiHandlerFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
        ],
        resources: getBedrockResourceArns(props.bedrockModelId, props.inferenceProfileRegionArns, Stack.of(this)),
        effect: Effect.ALLOW,
      }),
    );
    genAiHandlerFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'iam:PassRole',
        ],
        resources: [
          `arn:aws:iam::${Stack.of(this).account}:role/*AmazonBedrock*`,
        ],
        effect: Effect.ALLOW,
        conditions: {
          StringEquals: { 'iam:PassedToService': 'bedrock.amazonaws.com' },
        },
      }),
    );
    props.metadataTable.grantReadData(genAiHandlerFn);
    props.inputBucket.grantRead(genAiHandlerFn);

    const api = new RestApi(this, 'pca-api-gw', {
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'X-Amz-Security-Token',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['GET', 'PUT', 'OPTIONS', 'POST', 'DELETE'],
        allowOrigins: [props.allowedDomains],
      },
      deployOptions: {
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });
    const genAiModel = api.addModel('gen-ai-model', {
      schema: {
        schema: JsonSchemaVersion.DRAFT4,
        title: 'genAIModel',
        type: JsonSchemaType.OBJECT,
        properties: {
          ticketId: { type: JsonSchemaType.STRING },
          jobId: { type: JsonSchemaType.STRING },
          callId: { type: JsonSchemaType.STRING },
          query: { type: JsonSchemaType.STRING },
        },
        required: ['ticketId', 'jobId', 'callId', 'query'],
      },
    });
    const uploadFileModel = api.addModel('upload-file-model', {
      schema: {
        schema: JsonSchemaVersion.DRAFT4,
        title: 'uploadFileModel',
        type: JsonSchemaType.OBJECT,
        properties: {
          fileNameWithExtension: { type: JsonSchemaType.STRING },
        },
        required: ['fileNameWithExtension'],
      },
    });
    new WafwebaclToApiGateway(this, 'wafwebacl-apigateway', {
      existingApiGatewayInterface: api,
    });
    const validateBodyReqValidator = api.addRequestValidator('validateBodyReqValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });
    const apiProxyLambdaIntegration = new LambdaIntegration(apiHandlerFn, {});
    const genaiProxyLambdaIntegration = new LambdaIntegration(genAiHandlerFn, {});
    const auth = new CognitoUserPoolsAuthorizer(this, 'apiAuthorizer', {
      cognitoUserPools: [props.userPool],
    });
    const methodOptions: MethodOptions = {
      authorizer: auth,
      authorizationType: AuthorizationType.COGNITO,
    };
    const ticketsResource = api.root.addResource('tickets');
    const ticketIdResource = ticketsResource.addResource('{ticketId}');
    const jobIdResource = ticketIdResource.addResource('{jobId}');
    const callIdResource = jobIdResource.addResource('{callId}');
    const genAiResource = api.root.addResource('genai');
    genAiResource.addMethod('POST', genaiProxyLambdaIntegration, {
      ...methodOptions,
      requestModels: {
        'application/json': genAiModel,
      },
      requestValidator: validateBodyReqValidator,
    });
    callIdResource.addMethod('GET', apiProxyLambdaIntegration, {
      ...methodOptions,
      requestValidator: validateBodyReqValidator,
    });
    ticketsResource.addMethod('POST', apiProxyLambdaIntegration, {
      ...methodOptions,
      requestValidator: validateBodyReqValidator,
      requestModels: {
        'application/json': uploadFileModel,
      },
    });
    ticketsResource.addMethod('GET', apiProxyLambdaIntegration, {
      ...methodOptions,
      requestValidator: validateBodyReqValidator,
    });
    jobIdResource.addMethod('GET', apiProxyLambdaIntegration, {
      ...methodOptions,
      requestValidator: validateBodyReqValidator,
    });
    this.apiUrl = api.url;
    const nagIam5SupressionPaths = [
      '/PostCallAnalyticsStack/apilayer/genai-handler/ServiceRole/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/apilayer/apigw-handler/ServiceRole/DefaultPolicy/Resource',
    ];
    nagIam5SupressionPaths.forEach((resourcePath) => {
      supressIAM5ByPath(Stack.of(this), resourcePath);
    });
    const nagIam4SupressionsPaths = [
      '/PostCallAnalyticsStack/apilayer/apigw-handler/ServiceRole/Resource',
      '/PostCallAnalyticsStack/apilayer/pca-api-gw/CloudWatchRole/Resource',
      '/PostCallAnalyticsStack/apilayer/genai-handler/ServiceRole/Resource',
    ];
    nagIam4SupressionsPaths.forEach((resourcePath) => {
      supressIAM4ByPath(Stack.of(this), resourcePath);
    });
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), '/PostCallAnalyticsStack/apilayer/pca-api-gw/DeploymentStage.prod/Resource', [
      {
        id: 'AwsSolutions-APIG1',
        reason: 'this is sample and does not need access logging enabled',
      },
    ]);
  }
}
