// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { fetchAuthSession } from '@aws-amplify/auth';
import { get as amplifyGet, post as amplifyPost } from '@aws-amplify/api';

async function get(path) {
    const response = await amplifyGet({
        apiName: 'genai-pca-api',
        path,
        options: {
            headers: {
                Authorization: `Bearer ${(await fetchAuthSession()).tokens.idToken}`
            }
        }
    }).response;

    return (await response.body.json());
}

async function post(path, body) {
    const response = await amplifyPost({
        apiName: 'genai-pca-api',
        path,
        options: {
            headers: {
                Authorization: `Bearer ${(await fetchAuthSession()).tokens.idToken}`
            },
            body: body
        }
    }).response;

    return (await response.body.json());
}

const CIAPI = {

    async getTickets() {
        const result = await get('/tickets');
        console.log('getTickets', result)
        return result
    },

    async getTicket(ticketId, jobId) {
        const result = await get(`/tickets/${ticketId}/${jobId}`);
        console.log('getTicket', result)
        return result
    },

    async getCall(ticketId, jobId, callId) {
        const result = await get(`/tickets/${ticketId}/${jobId}/${callId}`);
        console.log('getCall', result)
        return result
    },

    async genAiQuery(ticketId, jobId, callId, query) {

        const result = await post(`/genai`, {
            "ticketId": ticketId,
            "jobId": jobId,
            "callId": callId,
            "query": query,
        });
        console.log('getCall', result)
        return result
    },

    async upload(filename) {
        const result = await post(`/tickets`, {
            "fileNameWithExtension": filename,
        });
        console.log('upload', result)
        return result
    },

};

export default CIAPI;