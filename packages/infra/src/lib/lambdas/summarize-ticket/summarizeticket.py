# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os
import json
import fetchtranscript as fts
import bedrockutil
import traceback


SUMMARIZE_TYPE = os.getenv('SUMMARY_TYPE', 'BEDROCK')

def get_prompt_templates():
    prompt_templates = [{"OverallSummary": "\n\nHuman: Answer the questions below, defined in <question></question> based on the conversation between customer care agent and customer defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.\n\n<question>What is the overall summary of the conversation?</question>\n\n<transcript>\n{transcript}\n</transcript>\n\nAssistant:"},
             {"ExecutiveSummary": "\n\nHuman: Answer the questions below, defined in <question></question> based on the conversation between customer care agent and customer defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.\n\n<question>What is the executibe summary of the conversation and provide actions for the executive?</question>\n\n<transcript>\n{transcript}\n</transcript>\n\nAssistant:"},
             {"SentimentChange": "\n\nHuman: Answer the questions below, defined in <question></question> based on the conversation between customer care agent and customer defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.\n\n<question>A sentiment change score on a scale of -5 (negative change) to 5 (positive change), indicating how the customer's sentiment shifted from the beginning to the end of the interaction.To analyze the sentiment, consider the customer's language, tone, and emotional expressions throughout the conversation. Pay attention to positive or negative words, phrases, and sentiments expressed by the customer.</question>\n\n<transcript>\n{transcript}\n</transcript>\n\nAssistant:"},
             {"Sentiment": "\n\nHuman: Answer the questions below, defined in <question></question> based on the conversation between customer care agent and customer defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.\n\n<question>An overall sentiment score for the customer on a scale of -1 (negative) to 1 (positive), with 0 being neutral.To analyze the sentiment, consider the customer's language, tone, and emotional expressions throughout the conversation. Pay attention to positive or negative words, phrases, and sentiments expressed by the customer.</question>\n\n<transcript>\n{transcript}\n</transcript>\n\nAssistant:"}]

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

            full_trancript = "\n Ticket Comments log \n \n" + comments_combined+"\n"                
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