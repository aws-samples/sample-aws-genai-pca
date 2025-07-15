# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import os
import summarizeticket as summt
import boto3
import pcaconfiguration as cf
from decimal import Decimal
from boto3.dynamodb.conditions import Key

import time

print("Loading Summarization Fn...")
s3_client = boto3.client("s3")
input_bucket = os.environ["INPUT_BUCKET"]
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_ticket_by_job_id(ticket_id, job_id):
    print(ticket_id, job_id)
    response = None
    ticket_details = {
        "commentsLog": [],
        "phoneCalls": []
    }
    try:

        ticket_log = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('interaction#'),
            ProjectionExpression="ticketId, PK, content, initiator, initiatorId, #ts",
            ExpressionAttributeNames={
                "#ts": "timestamp"
            }
        )
        phone_calls = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('call#'),
            ProjectionExpression="PK, SK, callId, initiator, initiatorId, #ts, interimResultsFile",
            ExpressionAttributeNames={
                "#ts": "timestamp"
            }
        )

        if "Items" in ticket_log:
            ticket_details['commentsLog'] = ticket_log["Items"]

        if "Items" in phone_calls:
            ticket_details['phoneCalls'] = phone_calls["Items"]

        print(ticket_details)
        return ticket_details
    except Exception as e:
        print(e)
    return response

def handler(event, context):
    # Get the object from the event and show its content type
    print(event)
    
    ticket_id = event[1]["event"]["ticket_id"]
    job_id = event[1]["event"]["job_id"]
    ticket_creation_time = event[0][0]["Input"]["payload"]["ticket_creation_time"]
    
    cf.loadConfiguration()
    
    cf.appConfig[cf.CONF_S3BUCKET_OUTPUT] = input_bucket
    cf.appConfig[cf.CONF_S3BUCKET_INPUT] = input_bucket

    try:
        ticket_details = get_ticket_by_job_id(ticket_id, job_id)
        response = summt.summarize(input_bucket, ticket_details)
        print(response)
        if "ExecutiveSummary" in response:
            metadata_response = metadata_table.update_item(
                Key={"PK": job_id, "SK":f'header#{str(ticket_creation_time)}'},                
                UpdateExpression=f"SET lastModifiedAt=:lastModifiedAt, executiveSummary =:executiveSummary, overallSummary=:overallSummary,sentimentChange=:sentimentChange, sentimentScore=:sentimentScore, #st=:status",
                ExpressionAttributeNames={
                    "#st": "status",
                },
                ExpressionAttributeValues={            
                    ":executiveSummary": response["ExecutiveSummary"],
                    ":overallSummary": response["OverallSummary"],
                    ":sentimentScore": response["Sentiment"],
                    ":sentimentChange": response["SentimentChange"], 
                    ":status": "PROCESSED",                     
                    ":lastModifiedAt": int(time.time())          
                },
            )
            print (metadata_response)
        return {"event": event, "status": "SUCCEEDED"}
    except Exception as e:
        print(e)
        print(
            "Error while processing the event. Please check the logs for more details."
        )
        raise e
