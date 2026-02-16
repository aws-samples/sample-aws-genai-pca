# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os
import json
import fetchtranscript as fts
import bedrockutil
import traceback


SUMMARIZE_TYPE = os.getenv('SUMMARY_TYPE', 'BEDROCK')

def get_prompt_templates():
    prompt_templates = [
        {"OverallSummary": "You are a helpful assistant that always responds in English. Based on the conversation between a customer care agent and customer in the transcript below, provide an overall summary of the conversation. You must always provide a summary based on whatever content is available. Use gender neutral pronouns. Respond only with the summary text, no XML tags.\n\n<transcript>\n{transcript}\n</transcript>"},
        {"ExecutiveSummary": "You are a helpful assistant that always responds in English. Based on the conversation between a customer care agent and customer in the transcript below, provide an executive summary and actions for the executive. You must always provide a summary based on whatever content is available. Use gender neutral pronouns. Respond only with the summary text, no XML tags.\n\n<transcript>\n{transcript}\n</transcript>"},
        {"SentimentChange": "You are a helpful assistant that always responds in English. Based on the conversation between a customer care agent and customer in the transcript below, provide a sentiment change score on a scale of -5 (negative change) to 5 (positive change), indicating how the customer's sentiment shifted from the beginning to the end of the interaction. Consider the customer's language, tone, and emotional expressions. Respond only with the numeric score.\n\n<transcript>\n{transcript}\n</transcript>"},
        {"Sentiment": "You are a helpful assistant that always responds in English. Based on the conversation between a customer care agent and customer in the transcript below, provide an overall sentiment score for the customer on a scale of -1 (negative) to 1 (positive), with 0 being neutral. Consider the customer's language, tone, and emotional expressions. Respond only with the numeric score.\n\n<transcript>\n{transcript}\n</transcript>"},
    ]

    return prompt_templates
    
def generate_bedrock_summary(transcript = None):

    # first check to see if this is one prompt, or many prompts as a json
    templates = get_prompt_templates()
    print(templates)
    result = {}
    for item in templates:
        key = list(item.keys())[0]       
        prompt = item[key]        
        prompt = prompt.replace("{transcript}", transcript)

        parameters = {
            "temperature": 0
        }
        generated_text = bedrockutil.call_bedrock(parameters, prompt)
        result[key] = generated_text
    if len(result.keys()) == 1:
        # This is a single node JSON with value that can be either:
        # A single inference that returns a string value
        # OR
        # A single inference that returns a JSON, enclosed in a string.
        # Refer to https://github.com/aws-samples/amazon-transcribe-post-call-analytics/blob/develop/docs/generative_ai.md#generative-ai-insights
        # for more details.
        try:
            parsed_json = json.loads(result[list(result.keys())[0]])
            print("Nested JSON...")
            return parsed_json
        except:
            print("Not nested JSON...")
            return result
    print(result)            
    return result

    
def summarize(input_bucket, ticket_details):
    comments_log = ticket_details["commentsLog"]
    phoneCalls = ticket_details["phoneCalls"]
    
    # --------- Summarize Here ----------

    full_trancript = "\n"
    if SUMMARIZE_TYPE == 'BEDROCK' or SUMMARIZE_TYPE == 'BEDROCK+TCA':
        try:
            # call_forbidden_words = {}
            # Iterate through the rows in the CSV file to find the comments for the ticket id
            comments_combined = ""
            for index, item in enumerate(comments_log):
                
                # Check if the current row has the desired ticket_id
                comments_combined = comments_combined + "\n\n"
                comments_combined = comments_combined + "<b>" + item['initiator']+ "</b>" +  ":"
                comments_combined = comments_combined + item["content"] + "\n\n"
                
            for index, item in enumerate(phoneCalls):
                if "interimResultsFile" in item:
                    print(item)
                    full_trancript = full_trancript + "Audio Call " + str(index)
                    transcript_str = fts.get_transcript_str(item["interimResultsFile"])
                    # callId = str(index)
                    full_trancript = full_trancript + "\n" + transcript_str + "\n\n" 

            full_trancript = full_trancript + "\n Ticket Comments log \n \n" + comments_combined+"\n"                
            try:                
                summary_response = generate_bedrock_summary(full_trancript)
            except Exception as e:
                print(f"Exception in processing qa report : {e}")
                print(traceback.format_exc())
                print('No json detected in summary.')
                raise(e)
        except Exception as err:
            summary_response = 'An error occurred generating Bedrock summary.'
            raise(err)    
    else:
        summary_response = 'Summarization disabled.'
    
        
    return summary_response