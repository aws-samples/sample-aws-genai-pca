// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import path from 'path';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import { Duration, Arn, Stack } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { StateMachine, Parallel, DefinitionBody, IntegrationPattern, JsonPath, Choice, Condition, WaitTime, Wait, Succeed, Fail } from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService, LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { getBedrockResourceArns } from './bedrock-utils';
import { supressIAM4ByPath, supressIAM5ByPath } from './nag-utils';
export interface TranscribeWorkflowProps {
  readonly inputBucket: IBucket;
  readonly metadataTable: Table;
  readonly langchainLambdaLayer: PythonLayerVersion;
  readonly commonLambdaLayer: PythonLayerVersion;
  readonly bedrockModelId: string;
  readonly inferenceProfileRegionArns?: string[];
}
export class TranscribeWorkflow extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: TranscribeWorkflowProps) {
    super(scope, id);
    const transcribeRole = new Role(this, 'transcribe-role', {
      assumedBy: new ServicePrincipal('transcribe.amazonaws.com'),
    });
    transcribeRole.addToPolicy(PolicyStatement.fromJson({
      Action: [
        's3:PutObject*',
        's3:GetObject*',
      ],
      Effect: Effect.ALLOW,
      Resource: [props.inputBucket.bucketArn, `${props.inputBucket.bucketArn}/*`],
    },
    ));
    transcribeRole.addToPolicy(PolicyStatement.fromJson({
      Action: [
        'kms:Decrypt',
      ],
      Effect: Effect.ALLOW,
      Resource: [props.inputBucket.encryptionKey?.keyArn],
    },
    ));
    const parallel = new Parallel(this, 'Transcribe-PCA-Processing', {
      resultPath: '$.transcribeResults',
      resultSelector: {
        'pcaResult.$': '$.[0]',
      },
    });

    const pcaFailure = new Fail(this, 'PCAFailed', {
      cause: 'PCA Transcription failed',
      error: 'FAILED',
    });

    const pcaSuccess = new Succeed(this, 'PCASuccess', {
      comment: 'PCA Transcription Successful',
    });

    const startPcaJob = new CallAwsService(this, 'StartPCAJob', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      service: 'transcribe',
      action: 'startCallAnalyticsJob',
      parameters: {
        CallAnalyticsJobName: JsonPath.hash(JsonPath.format('{}-{}', JsonPath.stringAt('$.payload.job_id'), JsonPath.stringAt('$.item.Value.name')), 'SHA-1'),
        Media: {
          MediaFileUri: JsonPath.format(
            's3://{}/{}',
            JsonPath.stringAt('$.payload.bucket'),
            JsonPath.stringAt('$.item.Value.path')),
        },
        OutputLocation: JsonPath.format(
          's3://{}/output/{}/pca-{}.json',
          JsonPath.stringAt('$.payload.bucket'),
          JsonPath.stringAt('$.payload.job_id'),
          JsonPath.stringAt('$.item.Value.name'),
        ),
        ChannelDefinitions: [
          {
            ChannelId: 0,
            ParticipantRole: 'AGENT',
          },
          {
            ChannelId: 1,
            ParticipantRole: 'CUSTOMER',
          },
        ],
        DataAccessRoleArn: transcribeRole.roleArn,
      },
      iamResources: [Arn.format({
        service: 'transcribe',
        resource: 'analytics',
        resourceName: '*',
      }, Stack.of(this))],
      outputPath: '$',
      resultPath: '$.pcatranscribe',
    });
    const getPcaJob = new CallAwsService(this, 'GetPCAJobStatus', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      service: 'transcribe',
      action: 'getCallAnalyticsJob',
      parameters: {
        CallAnalyticsJobName: JsonPath.stringAt('$.pcatranscribe.CallAnalyticsJob.CallAnalyticsJobName'),
      },
      iamResources: [Arn.format({
        service: 'transcribe',
        resource: 'analytics',
        resourceName: '*',
      }, Stack.of(this))],
      outputPath: '$',
      resultPath: '$.pcatranscribe',
    });
    const waitForPcaJob = new Wait(this, 'WaitForPCAJob', {
      time: WaitTime.duration(Duration.seconds(60)),
    }).next(getPcaJob);
    const isPcaJobCompleted = new Choice(this, 'IsPCADone?').when(
      Condition.stringEquals(
        '$.pcatranscribe.CallAnalyticsJob.CallAnalyticsJobStatus', 'COMPLETED',
      ),
      pcaSuccess,
    ).when(
      Condition.stringEquals(
        '$.pcatranscribe.CallAnalyticsJob.CallAnalyticsJobStatus', 'FAILED',
      ),
      pcaFailure,
    ).otherwise(waitForPcaJob);


    const summarizeAudioFn = new PythonFunction(this, 'summarize-audio', {
      entry: path.join(__dirname, './lambdas/summarize-audio'),
      index: 'app.py',
      handler: 'handler',
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.minutes(15),
      environment: {
        INPUT_BUCKET: props.inputBucket.bucketName,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
      layers: [props.langchainLambdaLayer, props.commonLambdaLayer],
    });

    summarizeAudioFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',

        ],
        resources: getBedrockResourceArns(props.bedrockModelId, props.inferenceProfileRegionArns, Stack.of(this)),
        effect: Effect.ALLOW,
      }),
    );
    summarizeAudioFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'transcribe:GetCallAnalyticsJob',
        ],
        resources: [
          Arn.format({
            service: 'transcribe',
            resource: 'analytics',
            resourceName: '*',
          }, Stack.of(this)),
        ],
        effect: Effect.ALLOW,
      }),
    );
    summarizeAudioFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'comprehend:DetectSentiment',
          'comprehend:DetectEntities',
        ],
        resources: ['*'],
        effect: Effect.ALLOW,
      }),
    );

    props.metadataTable.grantReadWriteData(summarizeAudioFn);
    props.inputBucket.grantReadWrite(summarizeAudioFn);
    props.inputBucket.encryptionKey?.grantEncryptDecrypt(summarizeAudioFn);
    const summarizeAudioStep = new LambdaInvoke(this, 'SummarizeAudio', {
      lambdaFunction: summarizeAudioFn,
      outputPath: '$.Payload',
    });
    const pcaJobChain = startPcaJob.next(waitForPcaJob.next(isPcaJobCompleted));
    parallel.branch(pcaJobChain);
    parallel.next(summarizeAudioStep);
    const transcribeWorkflow = new StateMachine(this, 'tickets-workflow', {
      definitionBody: DefinitionBody.fromChainable(parallel),
    });
    transcribeWorkflow.addToRolePolicy(PolicyStatement.fromJson({
      Effect: Effect.ALLOW,
      Action: [
        'iam:PassRole',
      ],
      Resource: [
        transcribeRole.roleArn,
      ],
    }));
    this.stateMachine = transcribeWorkflow;
    const nagIam5SupressionPaths = [
      '/PostCallAnalyticsStack/transcribe-workflow/transcribe-role/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/transcribe-workflow/summarize-audio/ServiceRole/Resource',
      '/PostCallAnalyticsStack/transcribe-workflow/summarize-audio/ServiceRole/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/transcribe-workflow/tickets-workflow/Role/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/transcribe-workflow/tickets-workflow/Role/DefaultPolicy/Resource',
    ];
    nagIam5SupressionPaths.forEach((resourcePath) => {
      supressIAM5ByPath(Stack.of(this), resourcePath);
    });
    supressIAM4ByPath(Stack.of(this), '/PostCallAnalyticsStack/transcribe-workflow/summarize-audio/ServiceRole/Resource');
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), '/PostCallAnalyticsStack/transcribe-workflow/tickets-workflow/Resource', [
      {
        id: 'AwsSolutions-SF1',
        reason: 'Does not need logging for all events for this sample',
      },
      {
        id: 'AwsSolutions-SF2',
        reason: 'XRay tracking is not required for this sample',
      },
    ]);
  }
};
