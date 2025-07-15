// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Arn, Stack } from 'aws-cdk-lib';

export function getBedrockResourceArns(modelId: string, inferenceProfileModelArns: string[]=[], stack: Stack): string[] {
  // Check if it's an inference profile (contains regional patterns)
  if (modelId.includes('us.') || modelId.includes('eu.') || modelId.includes('apac.') || modelId.includes('ap.')) {
    return [Arn.format({
      service: 'bedrock',
      resource: 'inference-profile',
      resourceName: modelId,
    }, stack),
    ...(inferenceProfileModelArns.map(arn => arn.replace(stack.account, '')))];
  } else {
    // It's a foundation model
    return [Arn.format({
      service: 'bedrock',
      resource: 'foundation-model',
      resourceName: modelId,
      account: '',
    }, stack)];
  }
}