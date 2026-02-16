// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import path from 'path';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket, EventType, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { ApiConstruct } from './apigw';
import { CognitoConstruct } from './cognito';
import { DDBTablesConstruct } from './ddbtables';
import { supressIAM4ByPath, supressIAM5ByPath } from './nag-utils';
import { SiteConstruct } from './site';
import { TicketsWorkflow } from './tickets-workflow';
import { TranscribeWorkflow } from './transcribe-workflow';

export interface PostCallAnalyticsStackProps extends StackProps {
  bedrockModelOrInferenceId: string;
  inferenceProfileRegionArns?: string[];
}

export class PostCallAnalyticsStack extends Stack {
  constructor(scope: Construct, id: string, props: PostCallAnalyticsStackProps) {
    super(scope, id, props);
    const allowedDomains = this.node.tryGetContext('allowedDomains') || '*';
    const s3BucketKey = new Key(this, 's3-bucket-key', {
      enableKeyRotation: true,
    });
    const inputBucket = new Bucket(this, 'input-bucket', {
      encryptionKey: s3BucketKey,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            HttpMethods.PUT,
            HttpMethods.POST,
            HttpMethods.GET,
            HttpMethods.HEAD,
          ],
          allowedOrigins: [allowedDomains],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });
    const ddbTables = new DDBTablesConstruct(this, 'ddbtables');

    const commonLambdaLayer = new PythonLayerVersion(this, 'CommonLayer', {
      entry: path.join(__dirname, './lambdas/common-layer'),
      compatibleRuntimes: [Runtime.PYTHON_3_14],
      description: 'Common Layer',
      layerVersionName: 'common_layer',
    });

    const transcribeWorkflow = new TranscribeWorkflow(this, 'transcribe-workflow', {
      inputBucket,
      metadataTable: ddbTables.metadataTable,
      commonLambdaLayer: commonLambdaLayer,
      bedrockModelId: props.bedrockModelOrInferenceId,
      inferenceProfileRegionArns: props.inferenceProfileRegionArns,
    });
    const ticketsWorkflow = new TicketsWorkflow(this, 'tickets-workflow', {
      transcribeWorkflow: transcribeWorkflow.stateMachine,
      inputBucket,
      metadataTable: ddbTables.metadataTable,
      commonLambdaLayer: commonLambdaLayer,
      bedrockModelId: props.bedrockModelOrInferenceId,
      inferenceProfileRegionArns: props.inferenceProfileRegionArns,
    });


    const inputTriggerFn = new PythonFunction(this, 'input-trigger-fn', {
      entry: path.join(__dirname, './lambdas/s3-input-trigger'),
      index: 'app.py',
      handler: 'handler',
      runtime: Runtime.PYTHON_3_14,
      timeout: Duration.minutes(5),
      environment: {
        TICKETS_WORKFLOW_ARN: ticketsWorkflow.stateMachine.stateMachineArn,
        METADATA_TABLE_NAME: ddbTables.metadataTable.tableName,
      },
    });
    ddbTables.metadataTable.grantReadWriteData(inputTriggerFn);
    inputBucket.addEventNotification(EventType.OBJECT_CREATED,
      new LambdaDestination(inputTriggerFn),
      { prefix: 'input', suffix: '.zip' },
    );
    inputBucket.grantReadWrite(inputTriggerFn);

    const cognitoConstruct = new CognitoConstruct(this, 'cognito');
    const apilayer = new ApiConstruct(this, 'apilayer', {
      userPool: cognitoConstruct.userPool,
      userPoolClient: cognitoConstruct.userPoolClient,
      allowedDomains,
      recordTypeGSIName: ddbTables.recordTypeGSIName,
      metadataTable: ddbTables.metadataTable,
      inputBucket,
      commonLambdaLayer: commonLambdaLayer,
      bedrockModelId: props.bedrockModelOrInferenceId,
      inferenceProfileRegionArns: props.inferenceProfileRegionArns,
    });

    const site = new SiteConstruct(this, 'site', {
      apiUrl: apilayer.apiUrl,
      userPool: cognitoConstruct.userPool,
      userPoolClient: cognitoConstruct.userPoolClient,
    });

    ticketsWorkflow.stateMachine.grantStartExecution(inputTriggerFn);
    new CfnOutput(this, 'distrubtion-domain-name', {
      value: site.distribution.distributionDomainName,
    });

    NagSuppressions.addResourceSuppressionsByPath(this, '/PostCallAnalyticsStack/input-bucket/Resource', [
      {
        id: 'AwsSolutions-S1',
        reason: 'this bucket is used by the website to save the input files, it is not accessible by any external party',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PostCallAnalyticsStack/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'managed resoucre created by cdk for bucket deployment',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'managed resoucre created by cdk for bucket deployment',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PostCallAnalyticsStack/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'managed resoucre created by cdk for bucket deployment',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PostCallAnalyticsStack/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'managed resoucre created by cdk for bucket deployment',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PostCallAnalyticsStack/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'managed resoucre created by cdk for bucket deployment',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PostCallAnalyticsStack/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource', [
      {
        id: 'AwsSolutions-L1',
        reason: 'managed resoucre created by cdk for bucket deployment',
      },
    ]);
    supressIAM5ByPath(this, '/PostCallAnalyticsStack/input-trigger-fn/ServiceRole/DefaultPolicy/Resource');
    supressIAM4ByPath(this, '/PostCallAnalyticsStack/input-trigger-fn/ServiceRole/Resource');
  }
}
