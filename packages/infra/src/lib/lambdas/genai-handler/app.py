# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import boto3
import os
from decimal import Decimal

from boto3.dynamodb.conditions import Key

import fetchtranscript as fts
import pcaconfiguration as cf
import bedrockutil

AWS_REGION =  os.environ["AWS_REGION"]
SUMMARIZE_TYPE = os.getenv('SUMMARY_TYPE', 'BEDROCK')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.
MAX_TOKENS = int(os.getenv('MAX_TOKENS','256'))
input_bucket = os.environ['INPUT_S3_BUCKET']
ALLOWED_DOMAINS = os.environ['ALLOWED_DOMAINS']

QUERY_TYPE = os.getenv('QUERY_TYPE', 'BEDROCK')
ANTHROPIC_ENDPOINT_URL = os.getenv('ANTHROPIC_ENDPOINT_URL','')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY','')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.

s3_client = boto3.client('s3')
dynamodb_client = boto3.client('dynamodb')
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
metadata_table = boto3.resource("dynamodb").Table(METADATA_TABLE_NAME)

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


# Useful constants
TMP_DIR = "/tmp"


def get_template_from_dynamodb():
    try:
        prompt_template = """<br><br>Human: You are an AI chatbot. Carefully read the following transcript within <transcript></transcript> tags. Provide a
      short answer to the question at the end. If the answer cannot be determined from the transcript, then reply saying Sorry,
      I don't know. Use gender neutral pronouns. Do not use XML tags in the answer. <br><transcript><br>{transcript}<br></transcript><br>{question}<br><br>Assistant:"""
        prompt_template = prompt_template.replace("<br>", "\n")
    except Exception as e:
        print("Exception", e)
        prompt_template = "Human: Answer the following question in 1 sentence based on the transcript. If the question is not relevant to the transcript, reply with I'm sorry, this is not relevant. \n<question>{question}</question>\n\n<transcript>\n{transcript}</transcript>\n\nAssistant: Based on the transcript: "
    return prompt_template


def generate_bedrock_query(transcript, question):

    # first check to see if this is one prompt, or many prompts as a json
    prompt = get_template_from_dynamodb()

    prompt = prompt.replace("{transcript}", transcript)
    prompt = prompt.replace("{question}", question)
    parameters = {
        "temperature": 0
    }
    generated_text = bedrockutil.call_bedrock(parameters, prompt)

    return generated_text


def get_ticket_by_job_id(ticket_id, job_id):
    print(ticket_id, job_id)
    response = None
    try:
       
        phone_calls = metadata_table.query(
            KeyConditionExpression = Key('PK').eq(job_id) & Key('SK').begins_with('call#'),
            ProjectionExpression="PK, SK, callId, initiator, initiatorId, #ts, interimResultsFile",
            ExpressionAttributeNames={
                "#ts": "timestamp"
            }
        )
        
        if "Items" in phone_calls:
            response = phone_calls["Items"]
        else:
            response = {
                
            }
    except Exception as e:
        print(e)
    return response



def lambda_handler(event):
    """
    Lambda function entrypoint
    """
    
    print(event)
    data = json.loads(event['body'])
    ticket_id = data["ticketId"]
    job_id = data["jobId"]
    query = data["query"]
    call_id = data["callId"]
   

    phoneCalls = get_ticket_by_job_id(ticket_id, job_id);
    transcript_str = ""
    for item in phoneCalls:        
        if call_id == item["callId"]:
            transcript_str = fts.get_transcript_str(item["interimResultsFile"])

    # --------- Summarize Here ----------

    if QUERY_TYPE == 'BEDROCK':
        try:
            query_response = generate_bedrock_query(transcript_str, query)
        except Exception as err:
            query_response = 'An error occurred generating Bedrock query response.'
            print(err)
    else:
        query_response = 'Query response disabled.'

    print("Answer:", query_response)
    response = {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
            "Content-Type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "OPTIONS,GET"
        },
        "body": json.dumps({
            "response":query_response
        })
    }
    return response


def handle_genai_query(event):
    http_method = event['httpMethod']
    if http_method == "POST":
        response = lambda_handler(event)
        return response
    else:
        response['statusCode'] = 500
        response['body'] = json.dumps({"message": "Invalid method"})
        return response

def handler(event, context):
    print(event)
    http_path = event['resource']
    cf.loadConfiguration()
    
    cf.appConfig[cf.CONF_S3BUCKET_OUTPUT] = input_bucket
    cf.appConfig[cf.CONF_S3BUCKET_INPUT] = input_bucket
    if http_path == "/genai":
        return handle_genai_query(event)
    else:
        response['statusCode'] = 500
        response['body'] = json.dumps({"message": "Invalid path"})
    return response