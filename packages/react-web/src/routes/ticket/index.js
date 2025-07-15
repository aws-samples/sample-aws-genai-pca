// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Grid, ContentLayout, Header, Container, SpaceBetween, Button } from "@cloudscape-design/components";

import { ValueWithLabel } from "../../components/ValueWithLabel";
import Layout from '../../layout';
import { CIAPI, Util } from '../../common';
import { CallTable } from './CallTable';
import { LogTable } from './LogTable';

import { COLUMN_DEFINITIONS } from './LogTableConfig';

const Tickets = () => {
    const { authStatus, utilities, GenerateBreadcrumb } = Util();

    const [loading, setLoading] = useState(true);
    const [ticket, setTicket] = useState();

    const { ticketId, jobId } = useParams()
    const navigate = useNavigate();

    const breadItems = [
        { text: "Home", href: "/" },
        { text: `Ticket: ${ticketId} (Job: ${jobId})`, href: "#" },
    ]

    useEffect(() => {
        if (authStatus === "authenticated") {
            const init = async () => {
                let ticket = await CIAPI.getTicket(ticketId, jobId);

                ticket.phoneCalls.forEach(call => {
                    call.jobId = jobId;
                    call.ticketId = ticketId
                })

                ticket.commentsLog.forEach((item, index) => {
                    item.jobId = jobId;
                    item.ticketId = ticketId;
                    item.index = index;
                });

                setTicket(ticket);
                setLoading(false);
            }
            init();
        }
    }, [authStatus, ticketId, jobId])

    const { search } = useLocation();
    const query = new URLSearchParams(search);
    let logIndex = query.get('logIndex');
    logIndex = (logIndex === null) ? -1 : +logIndex;

    const qaReport = logIndex >= 0 ? ticket?.commentsLog[logIndex].qaReport : undefined;

    return (<>
        <Layout
            id="main_panel"
            navUtilities={utilities()}
            breadcrumb={GenerateBreadcrumb(breadItems)}>
            <ContentLayout
                header={
                    <Header
                        variant="h1"
                        description="Select a call to view its details.">
                        Ticket summary
                    </Header>
                }>
                <Grid
                    gridDefinition={[
                        { colspan: { default: 6 } },
                        { colspan: { default: 6 } },
                        { colspan: { default: 12 } },
                        { colspan: { default: 12 } }
                    ]}>

                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Overall Summary
                            </Header>
                        }
                    >
                        {ticket?.header.overallSummary}
                    </Container>

                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Executive Summary
                            </Header>
                        }
                    >
                        {ticket?.header.executiveSummary}
                    </Container>

                    <CallTable data={ticket?.phoneCalls || []} loading={loading} />

                    <Container
                        fitHeight={true}
                        header={
                            <div style={{ display: 'flex', flexDirection: 'row' }}>
                                <Header variant="h2">
                                    {logIndex >= 0 ? 'Interaction details' : 'Interaction log'}
                                </Header>
                                <Button iconName="close" variant="icon" onClick={() => navigate(`/tickets/${ticketId}/${jobId}`)} />
                            </div>
                        }
                    >

                        <Grid
                            gridDefinition={
                                (
                                    [
                                        { colspan: { default: qaReport ? 6 : 12 } },
                                        { colspan: { default: 6 } },
                                    ]
                                )
                            }>

                            {ticket && logIndex >= 0 ?
                                <>
                                    <Container
                                        fitHeight={true}
                                        header={
                                            <Header variant="h2">
                                                Log data
                                            </Header>
                                        }>
                                        <SpaceBetween size="m">
                                            {Object.keys(COLUMN_DEFINITIONS).map((key) => (
                                                <ValueWithLabel key={key} label={COLUMN_DEFINITIONS[key].header}>
                                                    {COLUMN_DEFINITIONS[key].cell(ticket?.commentsLog[logIndex], true)}
                                                </ValueWithLabel>
                                            ))}
                                        </SpaceBetween>
                                    </Container>

                                    {qaReport ?
                                        <Container
                                            fitHeight={true}
                                            header={
                                                <Header variant="h2">
                                                    QA Report
                                                </Header>
                                            }>
                                            <SpaceBetween size="m">
                                                <div >
                                                    <p>
                                                        <ValueWithLabel key='QAScore' label='Overall Score'>{qaReport.overall_score}</ValueWithLabel>
                                                    </p>
                                                    {Object.keys(qaReport.categories).map((key) => (
                                                        <ValueWithLabel key={key} label={key}>
                                                            <ul>
                                                                {qaReport.categories[key].rules.map(item => {
                                                                    return (<li key={item.id}>
                                                                        {item.rule}
                                                                        <span style={{ paddingLeft: 10 }}>{item.followed === 'yes' ? '✅︎' : '❌'}</span>
                                                                    </li>)
                                                                })}
                                                            </ul>
                                                        </ValueWithLabel>
                                                    ))}
                                                </div>
                                            </SpaceBetween>
                                        </Container>
                                        :
                                        null
                                    }
                                </>
                                :
                                <LogTable data={ticket?.commentsLog || []} loading={loading} />
                            }
                        </Grid>
                    </Container>
                </Grid >
            </ContentLayout >
        </Layout >
    </>);
};

export default Tickets;
