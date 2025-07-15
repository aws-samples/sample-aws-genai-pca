# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from langchain_aws.chat_models.bedrock import ChatBedrock
import os


bedrock_llm = None


def get_bedrock_llm(bedrock_client):
  global bedrock_llm
  if (bedrock_llm is None):
    model_id = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
    bedrock_llm = ChatBedrock(
      model_id=model_id,
      client=bedrock_client,
      model_kwargs={
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        'temperature': 0,
      }
    )

  return bedrock_llm
