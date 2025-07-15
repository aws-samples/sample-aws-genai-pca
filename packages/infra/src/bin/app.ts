// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { BedrockClient, GetInferenceProfileCommand } from '@aws-sdk/client-bedrock';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PostCallAnalyticsStack } from '../lib/pca-stack';
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks());

const stackName = app.node.tryGetContext('stackName');
const stackDesc = 'AWS GenAI Post-Call Analytics Sample (uksb-h91p2w4f5f)';
const bedrockModelOrInferenceId = app.node.tryGetContext('bedrockModelId') || 'anthropic.claude-3-sonnet-20240229-v1:0';
const isInferenceProfile = bedrockModelOrInferenceId.includes('us.') ||
                            bedrockModelOrInferenceId.includes('eu.') ||
                            bedrockModelOrInferenceId.includes('apac.') ||
                            bedrockModelOrInferenceId.includes('ap.');
if (isInferenceProfile) {
  console.log('Using inference profile');
  // get model arns by querying the inference profile
  const client = new BedrockClient({ region: process.env.CDK_DEFAULT_REGION });
  const command = new GetInferenceProfileCommand({
    inferenceProfileIdentifier: bedrockModelOrInferenceId,
  });
  client.send(command).then((response) => {
    if (response && response.models) {
      const modelArns = response.models.map(model => model.modelArn!);
      new PostCallAnalyticsStack(app, 'PostCallAnalyticsStack', {
        stackName,
        description: stackDesc,
        bedrockModelOrInferenceId,
        inferenceProfileRegionArns: modelArns,
        env: devEnv,
      });
      app.synth();
    } else {
      console.log('No model ARN found');
    }
  }).catch((error) => {
    console.log('Error:', error);
  });
} else {
  new PostCallAnalyticsStack(app, 'PostCallAnalyticsStack', {
    stackName,
    description: stackDesc,
    bedrockModelOrInferenceId,
    env: devEnv,
  });
  app.synth();
}