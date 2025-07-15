# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import os
import processturnbyturn as ptt
import extractjobheader as ejh
import summarize as summ
import boto3
import pcaconfiguration as cf
import time
from decimal import Decimal

print("Loading Summarization Fn...")
s3_client = boto3.client("s3")
input_bucket = os.environ["INPUT_BUCKET"]
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)


def handler(event, context):
    print(event)
    path = event['item']['Value']['path']
    index = event['item']['Index']
    callId = event['item']['Value']['callId']
    ticket_id = event['payload']['ticket_id']
    job_id = event['payload']['job_id']
    
    path = path.replace("uncompressed/", "")
    cf.loadConfiguration()
    
    cf.appConfig[cf.CONF_S3BUCKET_OUTPUT] = input_bucket
    cf.appConfig[cf.CONF_S3BUCKET_INPUT] = input_bucket
    
    process_event = {
        "ticket_id": ticket_id,
        "job_id": job_id,
        "bucket": input_bucket,
        "key": event['item']['Value']['path'],
        "inputType": "audio",
        "jobName": event['transcribeResults']['pcaResult']['pcatranscribe']['CallAnalyticsJob']['CallAnalyticsJobName'],
        "apiMode": "analytics",
        "transcribeStatus": event['transcribeResults']['pcaResult']['pcatranscribe']['CallAnalyticsJob']['CallAnalyticsJobStatus'],
        "transcriptUri": event['transcribeResults']['pcaResult']['pcatranscribe']['CallAnalyticsJob']['Transcript']['TranscriptFileUri'],
        "channelDefinitions": event['transcribeResults']['pcaResult']['pcatranscribe']['CallAnalyticsJob']['ChannelDefinitions'],        
    }
    
   

    ejh_event = ejh.lambda_handler(process_event)
    process_event['interimResultsFile'] = ejh_event['interimResultsFile']
    print(process_event)
    ptt.lambda_handler(process_event)

    sevent, languageCode, duration, sentiment_trends, qa_report, summary  = summ.lambda_handler(process_event)
    
    sentiment_trends = json.loads(json.dumps(sentiment_trends), parse_float=Decimal)

    print(sentiment_trends)

    response = metadata_table.update_item(        
        Key={"PK": job_id, "SK": f"call#{callId}"},
        UpdateExpression=f"SET interimResultsFile =:interimResultsFile, lastModifiedAt=:lastModifiedAt, languageCode =:languageCode, #du =:duration, sentimentChange =:sentimentChange, sentimentScore =:sentimentScore, qaReport = :qaReport, summary = :summary ",
        ExpressionAttributeNames={
            "#du": "duration",
        },
        ExpressionAttributeValues={            
            ":interimResultsFile": process_event['interimResultsFile'],
            ":languageCode": languageCode,
            ":duration": Decimal(str(duration)),
            ":sentimentScore": sentiment_trends["SentimentScore"],
            ":sentimentChange": sentiment_trends["SentimentChange"],
            ":qaReport": qa_report,
            ":summary" : summary,
            ":lastModifiedAt": int(time.time())
        },
    )
    print(response)

    return {
        "event": {},
        "status": "SUCCEEDED",
    }
