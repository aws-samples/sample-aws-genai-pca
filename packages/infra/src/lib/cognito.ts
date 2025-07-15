// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { RemovalPolicy, Duration, Stack, CfnOutput } from 'aws-cdk-lib';

import {
  AccountRecovery,
  UserPool,
  Mfa,
  IUserPool,
  UserPoolClient,
  IUserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export class CognitoConstruct extends Construct {
  public readonly userPool: IUserPool;
  public readonly userPoolClient: IUserPoolClient;
  public readonly userPoolRegion: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const userPool = new UserPool(this, 'UserPool', {
      removalPolicy: RemovalPolicy.DESTROY,
      selfSignUpEnabled: true,
      signInAliases: {
        username: false,
        phone: false,
        email: true,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      userInvitation: {
        emailSubject:
          'Your AWS GenAI Post Call Analytics Demo web app temporary password',
        emailBody:
          'Your AWS GenAI Post Call Analytics Demo web app username is {username} and temporary password is {####}',
      },
      userVerification: {
        emailSubject:
          'Verify your new AWS GenAI Post Call Analytics Demo web app account',
        emailBody:
          'The verification code to your new AWS GenAI Post Call Analytics Demo web app account is {####}',
      },
    });
    NagSuppressions.addResourceSuppressions(userPool, [{
      id: 'AwsSolutions-IAM5',
      reason: 'this is a managed role created by cdk',
    }], true);
    NagSuppressions.addResourceSuppressions(userPool, [{
      id: 'AwsSolutions-COG3',
      reason: 'this is a sample, does not need enhanced security',
    }], true);
    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: userPool,
      generateSecret: false,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      authFlows: {
        userSrp: true,
        custom: true,
      },
      refreshTokenValidity: Duration.hours(8),
    });

    this.userPool = userPool;
    this.userPoolClient = userPoolClient;
    this.userPoolRegion = Stack.of(this).region;

    new CfnOutput(this, 'cognitoUserPool', {
      value: this.userPool.userPoolId,
    });

    new CfnOutput(this, 'cognitoUserPoolClient', {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
