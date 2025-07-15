# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import boto3
import json
import os
from botocore.config import Config

AWS_REGION = os.environ["AWS_REGION"]
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID","anthropic.claude-3-sonnet-20240229-v1:0")

config = Config(
   retries = {
      'max_attempts': 100,
      'mode': 'adaptive'
   }
)
bedrock_client = None

def get_bedrock_client():    
    client = boto3.client(service_name='bedrock-runtime', region_name=AWS_REGION, config=config)
    return client
    
def get_bedrock_request_body(modelId, parameters, prompt):
    # check if the model id starts with us. or eu. ap. or apac. since this indicates that it is a inference profile id
    if modelId.startswith("us.") or modelId.startswith("eu.") or modelId.startswith("ap.") or modelId.startswith("apac."):
        provider = modelId.split(".")[1]
    else: 
        provider = modelId.split(".")[0]
    request_body = None
    user_message =  {"role": "user", "content": prompt}
    messages = [user_message]
    if provider == "anthropic":
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": messages
        } 
        request_body.update(parameters)
    elif provider == "ai21":
        request_body = {
            "prompt": prompt,
            "maxTokens": 4096
        }
        request_body.update(parameters)
    elif provider == "amazon":
        textGenerationConfig = {
            "maxTokenCount": 4096
        }
        textGenerationConfig.update(parameters)
        request_body = {
            "inputText": prompt,
            "textGenerationConfig": textGenerationConfig
        }
    else:
        raise Exception("Unsupported provider: ", provider)
    return request_body

def get_bedrock_generate_text(modelId, response):
    print("generating response with ", modelId)
    if modelId.startswith("us.") or modelId.startswith("eu.") or modelId.startswith("ap.") or modelId.startswith("apac."):
        provider = modelId.split(".")[1]
    else: 
        provider = modelId.split(".")[0]

    generated_text = None
    if provider == "anthropic":
        response_body = json.loads(response.get("body").read().decode())
        #generated_text = response_body 
        # generated_text = response_body.get("completion")
        generated_text = response_body.get("content")[0].get("text")
    elif provider == "ai21":
        response_body = json.loads(response.get("body").read())
        generated_text = response_body.get("completions")[0].get("data").get("text")
    elif provider == "amazon":
        response_body = json.loads(response.get("body").read())
        generated_text = response_body.get("results")[0].get("outputText")
    else:
        raise Exception("Unsupported provider: ", provider)
    # generated_text = generated_text.replace('```','')
    return generated_text

def call_bedrock(parameters, prompt):
    global bedrock_client
    modelId = BEDROCK_MODEL_ID
    body = get_bedrock_request_body(modelId, parameters, prompt)
    print("ModelId", modelId, "-  Body: ", body)
    if (bedrock_client is None):
        bedrock_client = get_bedrock_client()
    response = bedrock_client.invoke_model(body=json.dumps(body), modelId=modelId, accept='application/json', contentType='application/json')
    generated_text = get_bedrock_generate_text(modelId, response)
    return generated_text

def extract_json(input_string):
            start_index = input_string.find('{')
            end_index = input_string.rfind('}')
            json_data = json.loads(input_string[start_index:end_index+1])
            return json_data    
