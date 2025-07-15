/*********************************************************************************************************************
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance        *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://aws.amazon.com/asl/                                                                                    *
 *                                                                                                                    *
 *  or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 **********************************************************************************************************************/
import { join } from 'path';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import {
  Distribution,
  SecurityPolicyProtocol,
  CachePolicy,
  ViewerProtocolPolicy,
  GeoRestriction,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  IUserPool,
  IUserPoolClient,
} from 'aws-cdk-lib/aws-cognito';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Source, BucketDeployment } from 'aws-cdk-lib/aws-s3-deployment';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

interface SiteConstructProps {
  apiUrl: string;
  userPool: IUserPool;
  userPoolClient: IUserPoolClient;
  allowCloudFrontRegionList?: string[];
}

export class SiteConstruct extends Construct {
  public readonly siteBucket: Bucket;
  public readonly distribution: Distribution;
  constructor(scope: Construct, id: string, props: SiteConstructProps) {
    super(scope, id);

    this.siteBucket = new Bucket(this, 'websiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
    });
    NagSuppressions.addResourceSuppressions(this.siteBucket, [{
      id: 'AwsPrototyping-S3BucketLoggingEnabled',
      reason: 'Bucket used for publishing the website, doesn\'t require access logging',
    }]);
    let geoRestriction;
    if (props.allowCloudFrontRegionList && props.allowCloudFrontRegionList.length > 0) {
      geoRestriction = GeoRestriction.allowlist(props.allowCloudFrontRegionList.join(','));
    } else {
      geoRestriction = GeoRestriction.allowlist(...['IN', 'US']);
    }
    this.distribution = new Distribution(this, 'CloudfrontDistribution', {
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses: [
        {
          httpStatus: 404,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
        },
        {
          httpStatus: 403,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
        },
      ],
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
      },
      defaultRootObject: 'index.html',
      geoRestriction: geoRestriction,
    });
    const bundle = Source.asset(join(__dirname, '../../../react-web/build'));

    const configData = Source.data('aws-config.js', `
      const awsconfig= {
        aws_project_region: '${Stack.of(this).region}',
        aws_cognito_region: '${Stack.of(this).region}',
        aws_user_pools_id: '${props.userPool.userPoolId}',
        aws_user_pools_web_client_id: '${props.userPoolClient.userPoolClientId}',
        aws_cognito_username_attributes: ['EMAIL'],
        aws_cognito_mfa_configuration: 'OFF',
        aws_cognito_password_protection_settings: {
          passwordPolicyMinLength: 8,
          passwordPolicyCharacters: ['REQUIRES_LOWERCASE', 'REQUIRES_UPPERCASE', 'REQUIRES_NUMBERS', 'REQUIRES_SYMBOLS'],
        },
        aws_cognito_verification_mechanisms: ['EMAIL'],
        aws_cloud_logic_custom: [
          {
            name: 'genai-pca-api',
            endpoint: '${props.apiUrl}',
          }
        ]
      };
      window.aws_config = awsconfig;
    `);
    new BucketDeployment(this, 'DeployBucket', {
      sources: [bundle, configData],
      destinationBucket: this.siteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
    new CfnOutput(this, 'distributionId', {
      value: this.distribution.distributionId,
    });
    new CfnOutput(this, 'staticWebsiteBucket', {
      value: this.siteBucket.bucketName,
    });
    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR3',
        reason: 'this is a sample, does not need access logging enabled',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason: 'this is a sample, does not have a custom domain and SSL cert configured',
      },
    ]);
    NagSuppressions.addResourceSuppressions(this.siteBucket, [
      {
        id: 'AwsSolutions-S1',
        reason: 'this is a sample, does not need access logging enabled',
      },
    ]);
  }
}
