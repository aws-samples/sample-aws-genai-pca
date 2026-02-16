# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os
import pcaconfiguration as cf
import pcaresults
import json
import fetchtranscript as fts
import bedrockutil
import langchainutil
import traceback
import xml.etree.ElementTree as ET

from langchain_core.messages import HumanMessage


SUMMARIZE_TYPE = os.getenv('SUMMARY_TYPE', 'BEDROCK')

boto3_bedrock = bedrockutil.get_bedrock_client()
bedrock_llm = langchainutil.get_bedrock_llm(boto3_bedrock)


def get_templates_from_dynamodb():
    templates = []
    try:
        

        prompt_templates = {
             "LLMPromptTemplateId": "LLMPromptSummaryTemplate",
             "1#Summary": "<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is a summary of the transcript?</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "2#Topic": "<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is the topic of the call? For example, iphone issue, billing issue, cancellation. Only reply with the topic, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "3#Product": "<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What product did the customer call about? For example, internet, broadband, mobile phone, mobile plans. Only reply with the product, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "4#Resolved": "<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Did the agent resolve the customer's questions? Only reply with yes or no, nothing more. </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "5#Callback": "<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was this a callback? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "6#Politeness": "<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was the agent polite and professional? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "7#Actions": "<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What actions did the Agent take? </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
             "8#EmailResponse":"<transcript><br>{transcript}<br></transcript><br>Based on the above conversation between the AGENT and the CUSTOMER, write an email response addressing the customer with his / her name.Start by thanking the customer for being a valuable customer of AOne and taking time to talk to one of our agents.Depending on the summary of the ticket and the customer sentiment, write an email with the next steps. Close the email with a thank you note.<br><br>Assistant:"
            }

        for k in sorted(prompt_templates):
            if (k != "LLMPromptTemplateId"):
                prompt = prompt_templates[k].replace("<br>", "\n")
                index = k.find('#')
                k_stripped = k[index+1:]
                templates.append({ k_stripped:prompt })
    except Exception as e:
        print ("Exception:", e)
        raise (e)
    return templates

def generate_bedrock_summary(transcript, api_mode, comments_log = None):

    # first check to see if this is one prompt, or many prompts as a json
    templates = get_templates_from_dynamodb()
    print(templates)
    result = {}
    for item in templates:
        key = list(item.keys())[0]
        if key == 'Summary' and SUMMARIZE_TYPE == 'BEDROCK+TCA' and api_mode == cf.API_ANALYTICS:
            continue
        else:
            prompt = item[key]
            prompt = prompt.replace("{transcript}", transcript)
            if comments_log:
                
                prompt = prompt.replace("{comments_log}", comments_log)

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
            return json.dumps(parsed_json)
        except:
            print("Not nested JSON...")
            return json.dumps(result)
    print(result)            
    return json.dumps(result)


def generate_qa_report(transcript):
    rules = """
        <rules>
            <category name="Greeting" score="50">
                <rule id="1">
                    Did Agent greet the customer, introduce themselves and introduce the company and inform the purpose of the call?
                </rule>
                <rule id="2">
                    Did Agent end the call politely after the User's query is addressed?
                </rule>
                <rule id="3">
                    Did the Agent validate User by asking any of these (DOB, last 4 digits of the ID on the file, last transaction on the card) information?
                </rule>
            </category>
            <category name="Communication" score="50">
                <rule id="4">
                    Was the Agent able to articulate their thoughts clearly and concisely
                </rule>
                <rule id="5">
                    Was the Agent Confident throughout the call while addressing customer Queries
                </rule>
            </category>
            <category name="Forbidden words">
                <rule id="6">
                    Did Agent use any Forbidden words in the conversation?
                </rule>                
            </category>
        </rules>
    """
    forbidden_words = """
        <forbidden words>
            Fraud,
            Free,
            Promotional,
            Discount
        <forbidden words>
    """
    prompt = f"""
        AnyCompany is an enterprise which works in fsi segment.
        
        Here is an call transcript of a conversation between AnyCompany's customer support agent and their customer:
        <calltranscript>
        {transcript}
        </calltranscript>
        Here is a list of forbidden words that you should check if they were used by the agent in the conversation.    
        {forbidden_words}
        
        From the above call transcript, you have to check if the following rules across various categories are followed by the agent while conversing with the customer:
        {rules}

        For each rule, provide an entry in json format as below. return the followed field with yes or no or do not know based on your analysis
        Expected output format:
        {{
            "id of the rule": {{
                "justification": "Justification why you think it is followed or not followed",
                "followed": "yes" or "no" or "do not know"
            }}
            ....
        }}
    """
    messages = [
        HumanMessage(
            content= prompt
        )
    ]
    response = bedrock_llm.invoke(messages)
    greeting_rules = bedrockutil.extract_json(response.content)
    result_json = {}
    # calculate email score
    overall_score = 0
    # if (greeting_rules['10']['followed'] == 'no' or greeting_rules['11']['followed'] == 'no'):
    #     overall_score = 0
    # else:
    # iterate through the xml rules
    root = ET.fromstring(rules)
    categories = {}
    for category in root.findall('category'):
        category_name = category.get('name')
        category_score = category.get('score')
        all_rules_followed = True
        rules_list = []
        category_node = {}
        if category_score:
            category_node["category_score"] = int(category_score)
        for rule in category:
            rule_id = rule.get("id")
            rule = rule.text.replace("\n", "").replace("\r", "").strip()
            print(greeting_rules[rule_id])
            rules_list.append({
                "id": int(rule_id),
                "rule": rule,
                "followed": greeting_rules[rule_id]["followed"],
                "justification": greeting_rules[rule_id]["justification"]
            })
            
            if(category_score and greeting_rules[rule_id]["followed"] != "yes"):
                all_rules_followed = False
                
        category_node['rules'] = rules_list
        categories[category_name] = category_node
        if category_score and all_rules_followed:
            overall_score += int(category_score)
    
    if (greeting_rules['6']['followed'] == 'no'):
        overall_score = 0    
    result_json['overall_score'] = overall_score
    result_json['categories'] = categories
    return result_json

def lambda_handler(event):
    """
    Lambda function entrypoint
    """
    
    print(event)

    # Load in our existing interim CCA results
    pca_results = pcaresults.PCAResults()
    pca_results.read_results_from_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])
    languageCode = pca_results.get_conv_analytics().conversationLanguageCode
    duration = pca_results.get_conv_analytics().duration
    sentiment_trends = pca_results.get_conv_analytics().sentiment_trends["spk_1"]
    comments_log = None
    

    print("Comments Log")
    print(comments_log)
    # --------- Summarize Here ----------
    summary = 'No Summary Available'
    transcript_str = fts.get_transcript_str(event["interimResultsFile"])
    summary_json = None
    qa_report = None
    
    if SUMMARIZE_TYPE == 'BEDROCK' or SUMMARIZE_TYPE == 'BEDROCK+TCA':
        try:
            
            try: 
                summary = generate_bedrock_summary(transcript_str, pca_results.analytics.transcribe_job.api_mode, comments_log)
                summary_json = json.loads(summary)
            except Exception as e:
                print(f"Exception in processing summary report : {e}")
                print(traceback.format_exc())
                print('no json detected in summary.')
            try:
                
                qa_report = generate_qa_report(transcript_str)
                # qa_report = check_for_violations(transcript_str)
                print(qa_report)
            except Exception as e:
                print(f"Exception in processing qa report : {e}")
                print(traceback.format_exc())
                print('No json detected in summary.')
        except Exception as err:
            summary = 'An error occurred generating Bedrock summary.'
            print(err)    
    else:
        summary = 'Summarization disabled.'
    
    if qa_report:
        pca_results.analytics.qa_report = qa_report
    else:
        pca_results.analytics.qa_report = "No QA report"

    if summary_json:
        pca_results.analytics.summary = summary_json
        print("Summary JSON: " + summary)
    elif SUMMARIZE_TYPE != 'TCA-ONLY':
        pca_results.analytics.summary = {}
        pca_results.analytics.summary['Summary'] = summary
        print("Summary: " + summary)
    
    # Write out back to interim file
    pca_results.write_results_to_s3(bucket=cf.appConfig[cf.CONF_S3BUCKET_OUTPUT],
                                    object_key=event["interimResultsFile"])

    return event, languageCode, duration, sentiment_trends, qa_report, summary_json["Summary"]