# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import os
import time
from datetime import datetime
import re
import boto3

print("Loading S3 Trigger Function...")
time_regex = r"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})"
fieldmap = "%Y %m %d %H %M %S"
TMP_DIR = "/tmp/"

s3_client = boto3.client("s3")
step_function_client = boto3.client("stepfunctions")

INTALK_TRANSCRIBE_WORKFLOW_ARN = os.environ['INTALK_TRANSCRIBE_WORKFLOW_ARN']
INPUT_BUCKET_NAME = os.environ['INPUT_BUCKET']
OUTPUT_BUCKET_NAME = os.environ['OUTPUT_BUCKET']

METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)

def get_call_time(file_name):

    match = re.search(time_regex, file_name)
    if match:
        fieldstring = " ".join(match.groups())
        dateT = datetime.strptime(fieldstring, fieldmap)
        return int(dateT.timestamp())
    else:
        return int(time.time())
        




def handler(event, context):
    print(event)
    # Get the object from the event and show its content type
    # bucket = event["Records"][0]["s3"]["bucket"]["name"]
    # key = urllib.parse.unquote_plus(
    #     event["Records"][0]["s3"]["object"]["key"], encoding="utf-8"
    # )
    bucket = "d11-pca-bucket"
    key = "20240515114525_2c1eb173-f980-4d0e-ba4f-04fe4be3d8a4.mp3"
    ticket_id = 123456
    timest = int(time.time())
    step_function_payload = {
          "inputbucket": INPUT_BUCKET_NAME,
          "outputbucket" : OUTPUT_BUCKET_NAME,
          "path": key,
          "name": "20240515114525_2c1eb173-f980-4d0e-ba4f-04fe4be3d8a4.mp3",
          "callId": "20240515114525_2c1eb173-f980-4d0e-ba4f-04fe4be3d8a4",
          "callTime": 1721997074,
          "bucket": bucket,
          "key": key,
          "ticket_id": ticket_id,
          "job_id": f"{ticket_id}-{timest}",
          "audio_files": [
            {
              "path": key,
              "name": "20240515114525_2c1eb173-f980-4d0e-ba4f-04fe4be3d8a4.mp3",
              "callId": "20240515114525_2c1eb173-f980-4d0e-ba4f-04fe4be3d8a4",
              "callTime": 1721997074,
            }
          ],
          "initiator": "agent",
          "initiator_id": "agent",
          "initiator": "agent",
          "ticket_notes": "<Zendesk API Call>"
        }
    #TODO add code to store the header in DB 
        
    response = step_function_client.start_execution(
        stateMachineArn=INTALK_TRANSCRIBE_WORKFLOW_ARN,
        name=step_function_payload['job_id'],
        input=json.dumps(step_function_payload),
    )
    return {
        "executionArn": response["executionArn"],
        "started": response["startDate"].isoformat(),
        "object": key,
    }



    
