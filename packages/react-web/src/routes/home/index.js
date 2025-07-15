// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useEffect, useState } from 'react'
import { Grid, ContentLayout, Header, Container } from "@cloudscape-design/components";

import Layout from '../../layout';
import { CIAPI, Util } from '../../common';
import { TicketTable } from './TicketTable';
import { Upload } from "./Upload";
import ExpandableSection from "@cloudscape-design/components/expandable-section";


const Tickets = () => {
    const { authStatus, utilities } = Util();

    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState([]);

    useEffect(() => {
        if (authStatus === "authenticated") {
            const init = async () => {
                let tickets = await CIAPI.getTickets();

                tickets = tickets.sort((lhs, rhs) => rhs.lastModifiedAt - lhs.lastModifiedAt);

                setTickets(tickets);
                setLoading(false);
            }
            init();
        }
    }, [authStatus])

    return (<>
        <Layout
            id="main_panel"
            navUtilities={utilities()}>
            <ContentLayout
                header={
                    <Header
                        variant="h1"
                        description="Select a ticket to view its details.">
                        Home
                    </Header>
                }>


                <Container>
                    <Grid
                        gridDefinition={[
                            { colspan: { default: 12 } },
                            { colspan: { default: 12 } },
                            { colspan: { default: 12 } }
                        ]}
                    >
                        <ExpandableSection headerText="Upload Ticket zip file">
                            <Upload />
                        </ExpandableSection>
                        <TicketTable data={tickets} loading={loading} />
                    </Grid>
                </Container>


            </ContentLayout>
        </Layout>
    </>);
};

export default Tickets;