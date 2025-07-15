# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import os
import time
import pandas as pd
import urllib.parse
import zipfile
from datetime import datetime
import re
import boto3

print("Loading S3 Trigger Function...")
time_regex = r"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})"
fieldmap = "%Y %m %d %H %M %S"
TMP_DIR = "/tmp/"

s3_client = boto3.client("s3")
step_function_client = boto3.client("stepfunctions")
TICKETS_WORKFLOW_ARN = os.environ['TICKETS_WORKFLOW_ARN']

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
def convert_excel_to_csv(excel_file_path, csv_file_path):
    """
    Converts an Excel file to a CSV file

    :param excel_file_path: Path to the Excel file
    :param csv_file_path: Path to the CSV file
    """
    df = pd.read_excel(excel_file_path, sheet_name=0)
    df.to_csv(csv_file_path, index=False)
        
def handle_zip_file(zip_file_path, job_id, bucket, file_prefix):
    """
    Handles a zip file that has been dropped into the S3 bucket

    :param bucket: S3 bucket holding the JSON file
    :param key: Location of the JSON file in the S3 bucket
    :return: Flag indicating if this file is an Amazon Transcribe file
    """
    audio_file_keys = []
    csv_file_key = None
    # Unzip the file
    with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
        # zip_file_name_without_ext = zip_file_path.split('/')[-1].split('.')[0]
        uncompressed_file_path = os.path.join(TMP_DIR, job_id)
        zip_ref.extractall(uncompressed_file_path)
        
        # Loop through all the files in the folder
        for dirpath, dirnames, filenames in os.walk(uncompressed_file_path):
            # Check if any OS sub-directories were found
            dirnames[:] = [d for d in dirnames if not d.startswith('.') and not d.startswith('_')]
            filenames[:] = [f for f in filenames if f.lower().endswith('.mp3') or 
                            f.lower().endswith('.wav') or f.lower().endswith('.csv') or 
                            f.lower().endswith('.xls') or f.lower().endswith('.xlsx')]
            if len(dirnames) > 0:
                print(f'Found sub-directories: {dirnames}')
                continue
            for filename in filenames:
                print(f'Processing file: {filename}')
                file_path = os.path.join(uncompressed_file_path, dirpath, filename)
                file_extension = os.path.splitext(filename)[1].lower()
                if (file_extension == '.mp3' or file_extension == '.wav'):
                    # upload file to s3
                    print(f'Uploading audio file: {filename}')
                    audio_file_key = f'{file_prefix}/{job_id}/{filename}'
                    s3_client.upload_file(file_path,bucket, audio_file_key)

                    audio_file_keys.append({
                        "path": audio_file_key,
                        "name": filename,
                        "callId" : os.path.splitext(filename)[0],
                        "callTime": get_call_time(filename)
                    })
                    print(f'Uploaded audio file: {filename}')
                elif (file_extension == '.xls' or file_extension == '.xlsx') and csv_file_key is None:
                    # convert excel to csv file
                    print(f'Converting excel file: {filename}')
                    csv_file_path = f'{os.path.splitext(file_path)[0]}.csv'
                    csv_file_name = os.path.basename(csv_file_path)
                    convert_excel_to_csv(file_path, csv_file_path)
                    print(f'Uploading csv file: {csv_file_name}')
                    csv_file_key = f'{file_prefix}/{job_id}/{csv_file_name}'
                    s3_client.upload_file(csv_file_path, bucket, csv_file_key)
                    print(f'Uploaded csv file: {csv_file_name}')
                elif (file_extension == '.csv') and csv_file_key is None:
                    # upload file to s3
                    print(f'Uploading csv file: {filename}')
                    csv_file_key = f'{file_prefix}/{job_id}/{filename}'
                    s3_client.upload_file(file_path, bucket, csv_file_key)
                    print(f'Uploaded csv file: {filename}')
            break
    return audio_file_keys, csv_file_key

def start_workflow(bucket, key, ticket_id, job_id, audio_files, ticket_notes):
    #job_id = key_filename.replace('-', '').replace('.', '').replace('_', '')
    response = step_function_client.start_execution(
        stateMachineArn=TICKETS_WORKFLOW_ARN,
        name=job_id,
        input=json.dumps({"bucket": bucket, "key": key, "ticket_id": ticket_id, "job_id": job_id, "audio_files": audio_files, "ticket_notes": ticket_notes}),
    )
    return {
        "executionArn": response["executionArn"],
        "started": response["startDate"].isoformat(),
        "object": key,
    }



def handler(event, context):
    print(event)
    # Get the object from the event and show its content type
    bucket = event["Records"][0]["s3"]["bucket"]["name"]
    key = urllib.parse.unquote_plus(
        event["Records"][0]["s3"]["object"]["key"], encoding="utf-8"
    )
    # Check if there's actually a file and that this wasn't just a folder creation event
    zip_file_name = key.split("/")[-1]
    if not zip_file_name:
        # Just a folder, no object - silently quit
        return {
                "object": key,
                "status": f"Folder creation event at \'{key}\', no object to process"
            }
    else:
        try:
            ticket_id = zip_file_name.split(".")[0] # Get file name without extension
            file_extension = os.path.splitext(zip_file_name)[1].lower()
            job_id = f'{ticket_id}-{int(time.time())}'.replace(' ', '_')

            if file_extension == '.zip': # Handle zip file
                local_zip_file_path = os.path.join(TMP_DIR, zip_file_name)
                s3_client.download_file(bucket, key, local_zip_file_path)
                audio_file_keys, ticket_notes = handle_zip_file(local_zip_file_path, job_id, bucket, 'uncompressed')
                print(f"audio_file_keys: {audio_file_keys}")
            elif file_extension == '.mp3' or file_extension == '.wav': # Handle single audio file
                s3_client.copy(
                    CopySource={
                        "Bucket": bucket,
                        "Key": key,
                    },
                    Bucket=bucket,
                    Key=f'uncompressed/{job_id}/{zip_file_name}',
                )
                audio_file_keys = [{
                    "path": f'uncompressed/{job_id}/{zip_file_name}',
                    "name": zip_file_name,
                    "callId" : os.path.splitext(zip_file_name)[0],
                    "callTime": get_call_time(zip_file_name)
                }]
                ticket_notes = None
            # if "Item" not in object_from_table:
            workflow_resp = start_workflow(bucket, key, ticket_id, job_id, audio_file_keys, ticket_notes)
            
            return workflow_resp
            
        except Exception as e:
            print(e)
            print(
                "Error while getting object {}{} and trigger CI workflow.".format(
                    key, bucket
                )
            )
            raise e
