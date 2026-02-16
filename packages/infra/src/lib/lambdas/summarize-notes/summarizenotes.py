# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import bedrockutil
import langchainutil

from langchain_core.messages import HumanMessage
import xml.etree.ElementTree as ET


boto3_bedrock = bedrockutil.get_bedrock_client()
bedrock_llm = langchainutil.get_bedrock_llm(boto3_bedrock)

def generate_qa_report(email_content):
    rules = """
        <rules>
            <category name="Greeting" score="25">
                <rule id="1">
                Did Agent always use a relevant opening statement matching the situation. e.g. "Hello Customer, Thank you for writing to us." or "Thank you for writing back to us" or any other formal email opening?    
                </rule>
            </category>
            <category name="Grammer" score="25">
                <rule id="2">
                    Was the Email that was replied by the agent is grammartically correct and easy to aprehend?
                </rule>
            </category>
            <category name="Acknowledgment" score="50">
                <rule id="3">
                    Did Agent acknowledge and address all the concerns that user has shared in the email trail?
                </rule>
            </category>
            <category name="Forbidden words">
                <rule id="4">
                    Did Agent use any forbidden words in the email?
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
        AnyCompany is an Indian enterprise which works in fsi segment.
        
        Here is an email transcript of a conversation between AnyCompany's customer support agent and their customer:
        <email transcript>
        {email_content}
        <email transcript>
        Here is a list of forbidden words that you should check if they were used in the email by the agent.
        {forbidden_words}

        From the above email transcript, you have to check if the following rules across various categories are followed by the agent while responding to their customer:
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
    
    if (greeting_rules['4']['followed'] == 'no'):
        overall_score = 0    
    result_json['overall_score'] = overall_score
    result_json['categories'] = categories
    return result_json

