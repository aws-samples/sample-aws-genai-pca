// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import '@aws-amplify/ui-react/styles.css';
import { Route, Routes } from 'react-router-dom';
import { withAuthenticator } from '@aws-amplify/ui-react';
import Home from "./routes/home";
import Ticket from './routes/ticket';
import Call from './routes/call';

function App({ signOut, user }) {
    return (
        <Routes>
            <Route index element={<Home />} />
            <Route path="/tickets/:ticketId/:jobId" element={<Ticket userid={user.username} />} />
            <Route path="/tickets/:ticketId/:jobId/:callId" element={<Call userid={user.username} />} />
        </Routes>
    );
}

export default withAuthenticator(App, {
    hideSignUp: true
});