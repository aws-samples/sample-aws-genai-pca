# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os
import boto3
import csv
import time
from dateutil.parser import *


INPUT_BUCKET = os.environ["INPUT_BUCKET"]
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
s3_client = boto3.client("s3")
metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)
TMP_DIR = '/tmp'

def save_metadata(PK, SK, payload):
    resp = metadata_table.put_item(Item={
        "PK": PK,
        "SK": SK,
        **payload,
        "lastModifiedAt": int(time.time()),
    })
    print (f"Item inserted successfully with PK:{PK}, SK: {SK}")

def save_ticket_header(ticket_id, job_id, ticketTime, payload):
    save_metadata(job_id, f"header#{ticketTime}", {
        "ticketId": ticket_id,
        "recordType": "header",
        "timestamp": ticketTime,
        **payload
    })

def save_ticket_call(ticket_id, job_id, call_id, interaction_time, payload):
    save_metadata(job_id, f"call#{call_id}", {
        "ticketId": ticket_id,
        "recordType": "call",
        "timestamp": interaction_time,
        **payload
    })

def save_ticket_email(ticket_id, job_id, interaction_time, payload):
    save_metadata(job_id, f"interaction#{interaction_time}", {
        "ticketId": ticket_id,
        "recordType": "interaction",
        "timestamp": interaction_time,
        **payload
    })

def handler(event, context):
    print(event)
    ticket_id = event["ticket_id"]
    job_id = event["job_id"]
    ticket_notes_s3_key = event["ticket_notes"]
    phoneCalls = event["audio_files"]
    phone_calls_dict = {d['callId']: {k: v for k, v in d.items()} for d in phoneCalls}
    ticket_log_download_path = os.path.join(TMP_DIR, os.path.basename(ticket_notes_s3_key))
    s3_client.download_file(INPUT_BUCKET, ticket_notes_s3_key, ticket_log_download_path)
    with open(ticket_log_download_path, 'r', encoding='utf-8-sig') as f:
        ticket_log = csv.DictReader(f)
        ticket_creation_time = int(time.time())
        for log_entry in ticket_log:
            date_object = parse(log_entry['Datetime'])
            interaction_time = int(date_object.timestamp())
            ticket_creation_time = min(interaction_time, ticket_creation_time)
            initiator = 'agent' if 'agent' in log_entry['Role'].lower() else 'user'
            initiator_id = log_entry['Role'].split('-')[1].strip() if initiator == 'agent' else 'user'
            if log_entry['CallID']:
                call_id = os.path.splitext(log_entry['CallID'])[0]
                call_payload = {
                    # "interactionTime": interaction_time,
                    "initiator": initiator,
                    "initiatorId": initiator_id,
                    "ticketId": ticket_id,
                    "callId": call_id,
                    "filePath": phone_calls_dict[call_id]["path"],
                }
                save_ticket_call(ticket_id, job_id, call_id, interaction_time, call_payload)
            email_payload = {
                "ticketId": ticket_id,
                "initiator": initiator,
                "initiatorId": initiator_id,
                "content": log_entry['Interaction'],
            }
            save_ticket_email(ticket_id, job_id, interaction_time, email_payload)
        header_payload = {
            "inputBucket": INPUT_BUCKET,
            "inputKey": event['key'],
            "ticketId": ticket_id,
            "jobId": job_id,
            "ticketNotes": event['ticket_notes'],
            "status": "SUBMITTED"
        }
        save_ticket_header(ticket_id, job_id, ticket_creation_time, header_payload)
        event['ticket_creation_time'] = ticket_creation_time
    return event