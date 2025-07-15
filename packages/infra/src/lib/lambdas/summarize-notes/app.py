# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import os
import boto3
import time
from boto3.dynamodb.conditions import Key, Attr
import summarizenotes as summn

print("Loading Ticket Notes Summarization Function...")
s3_client = boto3.client("s3")
input_bucket = os.environ["INPUT_BUCKET"]

METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']

metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)

def handler(event, context):
    # Get the object from the event and show its content type
    print(event)
    
    ticket_id = event["ticket_id"]
    job_id = event["job_id"]
    
    try:
        email_list_resp = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('interaction#'),
            FilterExpression = Attr('initiator').eq('agent'),
            ProjectionExpression="content, PK, SK"
        )
        email_list = email_list_resp['Items']
        for email in email_list:
            email_content = email['content']
            qa_report = summn.generate_qa_report(email_content)
            metadata_table.update_item(
                Key = {
                    "PK": email['PK'],
                    "SK": email['SK']
                },
                UpdateExpression = f"SET qaReport = :qaReport, lastModifiedAt=:lastModifiedAt",
                ExpressionAttributeValues={
                    ":qaReport": qa_report,
                    ":lastModifiedAt": int(time.time())
                }
            )
        


        return {"event": event, "status": "SUCCEEDED"}
    except Exception as e:
        print(e)
        print(
            "Error while processing the event. Please check the logs for more details."
        )
        raise e
