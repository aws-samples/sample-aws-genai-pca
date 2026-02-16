# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import boto3
import json
import os
from botocore.config import Config

AWS_REGION = os.environ["AWS_REGION"]
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")

config = Config(
    retries={
        'max_attempts': 100,
        'mode': 'adaptive'
    }
)
bedrock_client = None


def get_bedrock_client():
    global bedrock_client
    if bedrock_client is None:
        bedrock_client = boto3.client(
            service_name='bedrock-runtime',
            region_name=AWS_REGION,
            config=config
        )
    return bedrock_client


def call_bedrock(parameters, prompt):
    """
    Calls Bedrock using the provider-agnostic Converse API.
    Returns the generated text string.
    """
    client = get_bedrock_client()
    inference_config = {"maxTokens": 4096}
    if "temperature" in parameters:
        inference_config["temperature"] = parameters["temperature"]

    response = client.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig=inference_config,
    )
    return response["output"]["message"]["content"][0]["text"]


def extract_json(input_string):
    start_index = input_string.find('{')
    end_index = input_string.rfind('}')
    json_data = json.loads(input_string[start_index:end_index + 1])
    return json_data
