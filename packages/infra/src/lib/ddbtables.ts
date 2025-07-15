// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { CfnOutput } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
export class DDBTablesConstruct extends Construct {
  public readonly metadataTable: Table;
  public readonly recordTypeGSIName: string = 'RecordTypeGSI';
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.metadataTable = new Table(this, 'metadata-table', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
    });
    this.metadataTable.addGlobalSecondaryIndex({
      indexName: this.recordTypeGSIName,
      partitionKey: { name: 'recordType', type: AttributeType.STRING },
      sortKey: { name: 'timestamp', type: AttributeType.NUMBER },
    });
    new CfnOutput(this, 'metadata-table-name', { value: this.metadataTable.tableName });
    new CfnOutput(this, 'record-type-gsi-name', { value: this.recordTypeGSIName });
  }
}