// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack } from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';

export function supressIAM5ByPath(stack: Stack, path: string) {
  NagSuppressions.addResourceSuppressionsByPath(stack, path, [
    {
      id: 'AwsSolutions-IAM5',
      reason: 'This is postfix *, it does not provide * permissions to entire resource Ex. s3:PutObject*, s3:GetObject*, bucketarn/*',
    },
  ]);
}

export function supressIAM4ByPath(stack: Stack, path: string) {
  NagSuppressions.addResourceSuppressionsByPath(stack, path, [
    {
      id: 'AwsSolutions-IAM4',
      reason: 'This is the basic lambda execution role to provide access to create clodwatch logs',
    },
  ]);
}