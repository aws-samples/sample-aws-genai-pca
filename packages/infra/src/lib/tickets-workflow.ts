// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import path from 'path';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import { Duration, Stack } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { StateMachine, Parallel, DefinitionBody, Map, JsonPath, IntegrationPattern } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke, StepFunctionsStartExecution } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { getBedrockResourceArns } from './bedrock-utils';
import { supressIAM5ByPath, supressIAM4ByPath } from './nag-utils';
export interface TicketsWorkflowProps {
  readonly transcribeWorkflow: StateMachine;
  readonly inputBucket: IBucket;
  readonly metadataTable: Table;
  readonly commonLambdaLayer: PythonLayerVersion;
  readonly bedrockModelId: string;
  readonly inferenceProfileRegionArns?: string[];
}

export class TicketsWorkflow extends Construct {
  public readonly stateMachine: StateMachine;
  constructor(scope: Construct, id: string, props: TicketsWorkflowProps) {
    super(scope, id);
    const processTicketFn = new PythonFunction(this, 'process-ticket', {
      entry: path.join(__dirname, './lambdas/process-ticket'),
      index: 'app.py',
      handler: 'handler',
      runtime: Runtime.PYTHON_3_14,
      timeout: Duration.minutes(5),
      environment: {
        INPUT_BUCKET: props.inputBucket.bucketName,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
      },
    });
    props.metadataTable.grantReadWriteData(processTicketFn);
    props.inputBucket.grantRead(processTicketFn);
    props.inputBucket.encryptionKey?.grantEncryptDecrypt(processTicketFn);
    const processTicketStep = new LambdaInvoke(this, 'ProcessTicket', {
      lambdaFunction: processTicketFn,
      outputPath: '$.Payload',
    });
    const summarizeNotesFn = new PythonFunction(this, 'summarize-notes', {
      entry: path.join(__dirname, './lambdas/summarize-notes'),
      index: 'app.py',
      handler: 'handler',
      runtime: Runtime.PYTHON_3_14,
      timeout: Duration.minutes(15),
      environment: {
        INPUT_BUCKET: props.inputBucket.bucketName,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
      layers: [props.commonLambdaLayer],
    });

    summarizeNotesFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Converse',
        ],
        resources: getBedrockResourceArns(props.bedrockModelId, props.inferenceProfileRegionArns, Stack.of(this)),
        effect: Effect.ALLOW,
      }),
    );

    // props.ticketsTable.grantReadWriteData(summarizeNotesFn);
    props.metadataTable.grantReadWriteData(summarizeNotesFn);
    props.inputBucket.grantReadWrite(summarizeNotesFn);
    props.inputBucket.encryptionKey?.grantEncryptDecrypt(summarizeNotesFn);
    const summarizeNotesStep = new LambdaInvoke(this, 'SummarizeTicketNotes', {
      lambdaFunction: summarizeNotesFn,
      outputPath: '$.Payload',
    });
    const summarizeTicketFn = new PythonFunction(this, 'summarize-ticket', {
      entry: path.join(__dirname, './lambdas/summarize-ticket'),
      index: 'app.py',
      handler: 'handler',
      runtime: Runtime.PYTHON_3_14,
      timeout: Duration.minutes(15),
      environment: {
        INPUT_BUCKET: props.inputBucket.bucketName,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
      layers: [props.commonLambdaLayer],
    });

    summarizeTicketFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Converse',
        ],
        resources: getBedrockResourceArns(props.bedrockModelId, props.inferenceProfileRegionArns, Stack.of(this)),
        effect: Effect.ALLOW,
      }),
    );

    // props.ticketsTable.grantReadWriteData(summarizeTicketFn);
    props.metadataTable.grantReadWriteData(summarizeTicketFn);
    props.inputBucket.grantReadWrite(summarizeTicketFn);
    props.inputBucket.encryptionKey?.grantEncryptDecrypt(summarizeTicketFn);
    const summarizeTicketStep = new LambdaInvoke(this, 'OverallTicketSummary', {
      lambdaFunction: summarizeTicketFn,
      outputPath: '$.Payload',
    });
    const audioProcessingMap = new Map(this, 'AudioProcessing', {
      itemsPath: JsonPath.stringAt('$.audio_files'),
      itemSelector: {
        item: JsonPath.stringAt('$$.Map.Item'),
        payload: JsonPath.stringAt('$'),
      },
    });
    audioProcessingMap.itemProcessor(new StepFunctionsStartExecution(this, 'ProcessAudio', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      stateMachine: props.transcribeWorkflow,
      name: JsonPath.hash(JsonPath.format('{}-{}', JsonPath.stringAt('$.payload.job_id'), JsonPath.stringAt('$.item.Value.name')), 'SHA-1'),
    }));
    const parallel = new Parallel(this, 'Process-Text-Audio');
    parallel.branch(audioProcessingMap);
    parallel.branch(summarizeNotesStep);
    parallel.next(summarizeTicketStep);
    const mainChain = processTicketStep.next(parallel);
    const ticketsWorkflow = new StateMachine(this, 'tickets-workflow', {
      definitionBody: DefinitionBody.fromChainable(mainChain),
    });
    props.transcribeWorkflow.grantStartExecution(ticketsWorkflow);
    this.stateMachine = ticketsWorkflow;
    const nagIam5SupressionPaths = [
      '/PostCallAnalyticsStack/transcribe-workflow/summarize-audio/ServiceRole/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/process-ticket/ServiceRole/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/process-ticket/ServiceRole/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/summarize-notes/ServiceRole/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/summarize-ticket/ServiceRole/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/tickets-workflow/Role/DefaultPolicy/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/tickets-workflow/Role/DefaultPolicy/Resource',
    ];
    nagIam5SupressionPaths.forEach((resourcePath) => {
      supressIAM5ByPath(Stack.of(this), resourcePath);
    });
    const nagIam4SupressionsPaths = [
      '/PostCallAnalyticsStack/tickets-workflow/summarize-notes/ServiceRole/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/summarize-ticket/ServiceRole/Resource',
      '/PostCallAnalyticsStack/tickets-workflow/process-ticket/ServiceRole/Resource',
    ];
    nagIam4SupressionsPaths.forEach((resourcePath) => {
      supressIAM4ByPath(Stack.of(this), resourcePath);
    });
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), '/PostCallAnalyticsStack/tickets-workflow/tickets-workflow/Resource', [
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
