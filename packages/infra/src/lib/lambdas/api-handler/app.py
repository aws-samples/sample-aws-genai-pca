# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import boto3
import datetime
import os
from decimal import Decimal
from urllib.parse import urlparse
from botocore.client import Config
from boto3.dynamodb.conditions import Key


AWS_REGION = os.environ["AWS_REGION"]
INPUT_S3_BUCKET = os.environ['INPUT_S3_BUCKET']
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
DDB_RECORD_TYPE_INDEX = os.environ['DDB_RECORD_TYPE_INDEX']
ALLOWED_DOMAINS = os.environ['ALLOWED_DOMAINS']
metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)
s3_client = boto3.client("s3", config=Config(signature_version="s3v4"), region_name=AWS_REGION, 
                            endpoint_url=f'https://s3.{AWS_REGION}.amazonaws.com')
response = {
    'statusCode': 200,
    'headers': {
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Origin': ALLOWED_DOMAINS,
        'Access-Control-Allow-Methods': '*',
        'Content-Type': 'application/json'
    },
    'body': json.dumps({})
}

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)
    
def get_ticket_by_job_id(event):
    ticket_id = event['pathParameters']['ticketId']
    job_id = event['pathParameters']['jobId']
    print(ticket_id, job_id)
    try:
        ticket_header = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('header#'),
            ProjectionExpression = 'ticketId, PK, overallSummary, executiveSummary, #status, sentimentScore, sentimentChange',
            ExpressionAttributeNames={
                "#status": "status"
            }
        )
        ticket_log = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('interaction#'),
            ProjectionExpression="content, PK, SK, initiator, initiatorId, #ts, qaReport",
            ExpressionAttributeNames={
                "#ts": "timestamp"
            }
        )
        phone_calls = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('call#'),
            ProjectionExpression="PK, SK, initiator, initiatorId, #ts, callId, ticketId, #duration, languageCode, sentimentScore, summary, sentimentChange, qaReport.overall_score",
            ExpressionAttributeNames={
                "#ts": "timestamp",
                "#duration": "duration"
            }
        )
        response_body = {}
        if "Items" in ticket_header:
            response_body['header'] = ticket_header['Items'][0] # ony one item should exist
            if "Items" in ticket_log:
                response_body['commentsLog'] = ticket_log['Items']
            if "Items" in phone_calls:
                response_body['phoneCalls'] = phone_calls["Items"]
            response['body'] = json.dumps(response_body, cls=DecimalEncoder)
        else:
            response['statusCode'] = 404
            response['body'] = json.dumps({
                "message": "Ticket not found"
            })
    except Exception as e:
        print(e)
    return response

def get_json_data(call_id, call_results_file):
    json_data = None
    response = s3_client.get_object(Bucket=INPUT_S3_BUCKET, Key=call_results_file)
    json_data = json.loads(response['Body'].read().decode('utf-8'))
    if "ConversationAnalytics" in json_data:
        job_data = json_data["ConversationAnalytics"]["SourceInformation"][0]["TranscribeJobInfo"]
        url = urlparse(job_data["MediaFileUri"])
        bucket_name = url.netloc
        object_name = url.path.lstrip('/')
        presigned_url = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_name,
                                                        },
                                                    ExpiresIn=300)
        job_data["MediaFileUri"] =  presigned_url                                                    
    return json_data      

def get_call_id(event):
    # ticket_id = event['pathParameters']['ticketId']
    job_id = event['pathParameters']['jobId']
    call_id = event['pathParameters']['callId']
    try:

        ticket_details = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with(f'call#{call_id}'),
            # ProjectionExpression="content, PK, SK, initiator, initiatorId, interactionTime",
            ProjectionExpression = 'ticketId, PK, callId, interimResultsFile'
        )
        if "Items" in ticket_details:
            call_data = ticket_details["Items"][0]
            call_data["jsonData"] = get_json_data(call_id, call_data['interimResultsFile'])
            response['body'] = json.dumps(call_data,cls=DecimalEncoder)
        else:
            response['statusCode'] = 404
            response['body'] = json.dumps({
                "message": "Ticket not found"
            })
    except Exception as e:
        print(e)
    return response

def handle_tickets_get(event):
    try:
        ticket_details = metadata_table.query(
            IndexName=DDB_RECORD_TYPE_INDEX,
            KeyConditionExpression = Key('recordType').eq("header"),
            ProjectionExpression= "ticketId, PK, overallSentiment, lastModifiedAt, #status, sentimentScore, sentimentChange",
            ExpressionAttributeNames={
                "#status": "status"
            }
        )
        if "Items" in ticket_details and ticket_details["Count"] > 0:
            response['body'] = json.dumps(ticket_details["Items"], cls=DecimalEncoder)
        else:
            response['body'] = json.dumps([])
    except Exception as e:
        print(e)
    return response

def handle_tickets_post(event):
    json_body = json.loads(event['body'])
    file_name_with_ext = json_body['fileNameWithExtension'].lower().replace('/', '-')
    # Define the expiration time for the presigned URL 
    expires = datetime.datetime.now() + datetime.timedelta(minutes=1)

    # Generate the presigned URL 
    presigned_url = s3_client.generate_presigned_url(
        ClientMethod='put_object',
        Params={
            'Bucket': INPUT_S3_BUCKET,
            'Key': f'input/{file_name_with_ext}'
        },
        ExpiresIn=int((expires - datetime.datetime.now()).total_seconds())
    )
    print(presigned_url)
    response['body'] = json.dumps({"Url": presigned_url})
    return response

def handle_tickets(event):
    http_method = event['httpMethod']
    if http_method == "POST":
        return handle_tickets_post(event)
    if http_method == "GET":
        return handle_tickets_get(event)


def handler(event, context):
    print(event)
    http_path = event['resource']
    if http_path == "/tickets":
        return handle_tickets(event)
    elif http_path == "/tickets/{ticketId}/{jobId}":
        return get_ticket_by_job_id(event)
    elif http_path == "/tickets/{ticketId}/{jobId}/{callId}":
        return get_call_id(event)
    else:
        response['statusCode'] = 500
        response['body'] = json.dumps({"message": "Invalid path"})
    return response