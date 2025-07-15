// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { CIAPI, Util } from '../../common';
import Layout from '../../layout/index';
import { Formatter } from "../../format";
import { TranscriptSegment } from "./TranscriptSegment";
import { Entities } from "./Entities";
import { ValueWithLabel } from "../../components/ValueWithLabel";
import { Placeholder } from "../../components/Placeholder";
import { SentimentChart } from "./SentimentChart";
import { LoudnessChart } from "./LoudnessChart";
import { ComprehendSentimentChart } from "./ComprehendSentimentChart";
import { SpeakerTimeChart } from "./SpeakerTimeChart";
import { ListItems } from "./ListItems";
import { useDangerAlert } from "../../hooks/useAlert";
import "./call.css";
import { getEntityColor } from "./colours";
import { TranscriptOverlay } from "./TranscriptOverlay";
import { Sentiment } from "../../components/Sentiment";
import { ChatInput } from "../../components/ChatInput";
import { TonalityTable } from "./TonalityTable";
import { ContentLayout, Spinner, Header, Grid, Container, SpaceBetween } from '@cloudscape-design/components';

const range = (start, end) => {
    return [...Array(end + 1 - start).keys()].map((x) => x + start);
}

const getSentimentTrends = (d, target, labels) => {
    const id = Object.entries(labels).find(([_, v]) => v === target)?.[0];
    if (!id) return {};
    return d?.ConversationAnalytics?.SentimentTrends[id];
};

const createLoudnessData = (segment) => {
    const start = Math.floor(segment.SegmentStartTime);
    const end = Math.floor(segment.SegmentEndTime);
    const r = range(start, end);
    return r.map((item, i) => ({
        x: item,
        y: segment.LoudnessScores[i],
        interruption: segment.SegmentInterruption && item === start ? 100 : null,
        sentiment: (segment.SentimentIsNegative ? -5 : (segment.SentimentIsPositive && segment.LoudnessScores[i] > 0 ? 5 : 0)),
        sentimentScore: segment.SentimentScore,
        silence: (segment.LoudnessScores[i] === 0 ? true : false)
    }));
};

const createSentimentData = (segment) => {
    const start = Math.floor(segment.SegmentStartTime);
    const end = Math.floor(segment.SegmentEndTime);
    const r = range(start, end);
    return r.map((item) => ({
        x: item,
        y: (segment.SentimentIsNegative === 1 ? segment.SentimentScore * -1 : segment.SentimentScore)
    }));
}

function Call({ setAlert }) {
    const { authStatus, utilities, GenerateBreadcrumb } = Util();

    const { ticketId, jobId, callId } = useParams()

    const audioElem = useRef();
    const transcriptElem = useRef();

    const [data, setData] = useState();
    const [error, setError] = useState();

    const breadItems = [
        { text: "Home", href: "/" },
        { text: `Ticket: ${ticketId} (Job: ${jobId})`, href: `/tickets/${ticketId}/${jobId}` },
        { text: `Call: ${callId}`, href: "#" },
    ]

    const isTranscribeCallAnalyticsMode =
        data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
            ?.TranscribeApiType === "analytics";

    const hasTranscribeStreamingSession =
        data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
            ?.StreamingSession;

    const usedCustomLanguageModel =
        data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
            ?.CLMName;

    useDangerAlert(error, setAlert);

    const [speakerLabels, setSpeakerLabels] = useState({});

    const [loudnessData, setLoudnessData] = useState({});

    const [genAiQueries, setGenAiQueries] = useState([]);
    const [genAiQueryStatus, setGenAiQueryStatus] = useState(false);


    useEffect(() => {
        if (authStatus === "authenticated") {
            const init = async () => {
                let data = await CIAPI.getCall(ticketId, jobId, callId);
                setData(data.jsonData);
                setError(undefined);
            }
            init();
        }
    }, [authStatus, callId, jobId, ticketId])

    useEffect(() => {
        const labels = data?.ConversationAnalytics?.SpeakerLabels || [];
        const newSpeakerLabels = {
            NonTalkTime: "Silence",
            Interruptions: "Interruptions",
            Positive: "Positive",
            Negative: "Negative",
            Neutral: "Neutral"
        };
        labels.forEach(({ Speaker, DisplayText }) => {
            newSpeakerLabels[Speaker] = DisplayText;
        });
        setSpeakerLabels(newSpeakerLabels);
    }, [data]);

    useEffect(() => {
        const loudness = {};

        if (isTranscribeCallAnalyticsMode) {
            // TCA mode
            let interruptions = [];
            let silence = [];
            let positive = [];
            let negative = [];
            let neutral = [];
            let nonSilence = [];

            Object.keys(speakerLabels).forEach(key => {
                let keyLoudness = (data?.SpeechSegments || [])
                    .filter((segment) => segment.SegmentSpeaker === key)
                    .map(createLoudnessData)
                    .flat();

                loudness[key] = keyLoudness;
                let newInterruptions = keyLoudness.filter((d) => d.interruption)
                    .map((d) => ({ y: d.interruption, x: d.x }))
                interruptions = interruptions.concat(newInterruptions)

                let newSilence = keyLoudness.filter((d) => d.silence)
                    .map((d) => ({ x: d.x, y: 100 }))
                silence = silence.concat(newSilence);

                keyLoudness.forEach((item) => {
                    let sentimentItem = {
                        x: item.x,
                        y: 10,
                        sentiment: item.sentiment
                    };
                    if (item.sentiment > 0) positive.push(sentimentItem)
                    else if (item.sentiment < 0) negative.push(sentimentItem)
                    else neutral.push(sentimentItem);
                    nonSilence[item.x.toString()] = sentimentItem;
                });

            });

            // generate the rest of the silence
            if (data) {
                const r = range(0, parseInt(data?.ConversationAnalytics.Duration));
                r.forEach((item, i) => {
                    if (!(i in nonSilence)) {
                        silence = silence.concat({ x: i, y: 100 });
                    }
                });
            }

            loudness['Interruptions'] = interruptions;
            loudness['NonTalkTime'] = silence;
            loudness['Positive'] = positive;
            loudness['Neutral'] = neutral;
            loudness['Negative'] = negative;
        } else {
            // this is transcribe standard
            Object.keys(speakerLabels).forEach(key => {
                if (key.indexOf('spk_') >= 0) {
                    let keyLoudness = (data?.SpeechSegments || [])
                        .filter((segment) => segment.SegmentSpeaker === key)
                        .map(createSentimentData)
                        .flat();
                    console.log('keyloudness', keyLoudness);
                    loudness[key] = keyLoudness;
                }
            });
        }
        console.log('Loudness', loudness);
        setLoudnessData(loudness);
    }, [speakerLabels, data, isTranscribeCallAnalyticsMode])

    const getElementByIdAsync = id => new Promise(resolve => {
        const getElement = () => {
            const element = document.getElementById(id);
            if (element) {
                resolve(element);
            } else {
                requestAnimationFrame(getElement);
            }
        };
        getElement();
    });

    const scrollToBottomOfChat = async () => {
        const chatDiv = await getElementByIdAsync("chatDiv");
        chatDiv.scrollTop = chatDiv.scrollHeight + 200;
    }

    const submitQuery = (query) => {
        if (genAiQueryStatus === true) {
            return;
        }

        setGenAiQueryStatus(true);

        let responseData = {
            label: query,
            value: '...'
        }
        const currentQueries = genAiQueries.concat(responseData);
        setGenAiQueries(currentQueries);
        scrollToBottomOfChat();

        let query_response = CIAPI.genAiQuery(ticketId, jobId, callId, query);
        query_response.then((data) => {
            const queries = currentQueries.map(query => {
                if (query.value !== '...') {
                    return query;
                } else {
                    return {
                        label: query.label,
                        value: data.response
                    }
                }
            });
            setGenAiQueries(queries);
            scrollToBottomOfChat();
        });
        setGenAiQueryStatus(false);
    }

    const setAudioCurrentTime = (e) => {
        const a = document.getElementsByTagName("audio")[0];
        a.currentTime = e.target.dataset.currenttime;
    };

    const callDetailColumn = [
        {
            label: "Timestamp",
            value: (d) => d?.ConversationAnalytics?.ConversationTime.substring(0, 19),
        },
        {
            label: "Call Duration",
            value: (d) => Formatter.Time(d.ConversationAnalytics.Duration * 1000),
        },
        {
            label: "Language Model",
            value: (d) =>
                usedCustomLanguageModel
                    ? d?.ConversationAnalytics?.LanguageCode + " [" +
                    d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo?.CLMName + "]"
                    : d?.ConversationAnalytics?.LanguageCode
        },
        {
            label: "Agent Sentiment",
            value: (d) => (
                <Sentiment
                    score={getSentimentTrends(d, "Agent", speakerLabels)?.SentimentScore}
                    trend={getSentimentTrends(d, "Agent", speakerLabels)?.SentimentChange}
                />
            ),
        },
        {
            label: "Customer Sentiment",
            value: (d) => (
                <Sentiment
                    score={
                        getSentimentTrends(d, "Customer", speakerLabels)?.SentimentScore
                    }
                    trend={
                        getSentimentTrends(d, "Customer", speakerLabels)?.SentimentChange
                    }
                />
            ),
        },
    ];

    const transcribeDetailColumn = [
        {
            label: "Type",
            value: () =>
                isTranscribeCallAnalyticsMode
                    ? hasTranscribeStreamingSession
                        ? "Transcribe Streaming Call Analytics"
                        : "Transcribe Call Analytics"
                    : hasTranscribeStreamingSession
                        ? "Transcribe Streaming"
                        : "Transcribe"
        },
        {
            label: "Job Id",
            value: (d) => (
                <div key='jobIdKey' className="text-break">
                    {
                        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
                            ?.TranscriptionJobName
                    }
                </div>
            ),
        },
        {
            label: "File Format",
            value: (d) =>
                d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
                    ?.MediaFormat,
        },
        {
            label: "Sample Rate",
            value: (d) =>
                d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
                    ?.MediaSampleRateHertz,
        },
        {
            label: "Average Word Confidence",
            value: (d) =>
                Formatter.Percentage(
                    d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
                        ?.AverageWordConfidence
                ),
        },
    ];

    let genAiSummary = (data?.ConversationAnalytics?.Summary ?
        Object.entries(data?.ConversationAnalytics?.Summary).map(([key, value]) => {
            return {
                label: key,
                value: (value instanceof Array ? value.join(', ') : value)
            }
        }) : []);

    if (data?.ConversationAnalytics?.ContactSummary?.AutoGenerated?.OverallSummary?.Content) {
        // we also have a TCA summary
        genAiSummary = [{
            label: "Contact Summary",
            value: data?.ConversationAnalytics?.ContactSummary?.AutoGenerated?.OverallSummary?.Content
        }].concat(genAiSummary)
    };


    let qaReport = (data?.ConversationAnalytics?.QAReport ?
        Object.entries(data?.ConversationAnalytics?.QAReport.categories).map(([key, value]) => {
            return {
                label: key.replaceAll('_', ' '),
                value: value.rules
            }
        }) : []).filter(item => item.value);



    let qaScore = data?.ConversationAnalytics?.QAReport?.overall_score


    const audioEndTimestamps = (data?.SpeechSegments || [])
        .map(({ WordConfidence }) => WordConfidence)
        .flat()
        .reduce((accumulator, item) => ([...accumulator, item.EndTime]), []);

    const onAudioPlayTimeUpdate = () => {
        let elementEndTime = undefined;
        for (let i = 0; i < audioEndTimestamps.length; i++) {
            if (audioElem.current.currentTime < audioEndTimestamps[i]) {
                elementEndTime = audioEndTimestamps[i];
                break;
            }
        }

        [...transcriptElem.current.getElementsByClassName('playing')].forEach(elem => elem.classList?.remove("playing"));
        transcriptElem.current.querySelector('span[data-end="' + elementEndTime + '"]')?.classList?.add("playing");
    };



    let tonalityData = data?.ConversationAnalytics?.TonalAnalysis;
    if (tonalityData) {
        let loudness = [];
        if (tonalityData.loudness) {
            loudness = tonalityData.loudness.map(item => ({
                timestamp: item.start,
                duration: item.end - item.start,
                speaker: item.role,
                detection: "Loudness",
                abusive: item.abusive
            }));
        }

        let interruptions = [];
        if (tonalityData.interruptions) {
            interruptions = tonalityData.interruptions.map(item => ({
                timestamp: item.start,
                duration: item.end - item.start,
                speaker: item.role,
                detection: "Interruption",
                abusive: item.abusive
            }));
        }

        tonalityData = [
            ...loudness,
            ...interruptions
        ]

        tonalityData = tonalityData.sort((lhs, rhs) => lhs.timestamp - rhs.timestamp)
    }
    console.log('tonalityData ', tonalityData)

    return (
        <Layout
            id="main_panel"
            navUtilities={utilities()}
            breadcrumb={GenerateBreadcrumb(breadItems)}>
            <ContentLayout
                header={
                    <Header variant="h2" >
                        Call Details
                    </Header>
                }>
                <Grid
                    gridDefinition={
                        (
                            [
                                { colspan: { l: 4, m: 4, default: 12 } },
                                { colspan: { l: 4, m: 4, default: 12 } },
                                { colspan: { l: 4, m: 4, default: 12 } },
                                { colspan: { l: 12, m: 12, default: 12 } },
                                { colspan: { l: 6, m: 6, default: 12 } },
                                { colspan: { l: 6, m: 6, default: 12 } },
                                { colspan: { l: 6, m: 6, default: 12 } },
                                { colspan: { l: 6, m: 6, default: 12 } },
                                { colspan: { l: 6, m: 6, default: 12 } },
                                { colspan: { l: 6, m: 6, default: 12 } },
                                { colspan: { l: 12, m: 12, default: 12 } },
                            ]
                        )}
                >

                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Call Metadata
                            </Header>
                        }
                    >
                        <SpaceBetween size="m">
                            {callDetailColumn.map((entry, j) => (
                                <ValueWithLabel key={j} label={entry.label}>
                                    {!data && !error ? (
                                        <Placeholder />
                                    ) : (
                                        entry.value(data) || "-"
                                    )}
                                </ValueWithLabel>
                            ))}
                        </SpaceBetween>
                    </Container>
                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Transcribe Details
                            </Header>
                        }
                    >
                        <SpaceBetween size="m">
                            {transcribeDetailColumn.map((entry, i) => (
                                <ValueWithLabel key={i} label={entry.label}>
                                    {!data && !error ? (
                                        <Placeholder />
                                    ) : (
                                        entry.value(data) || "-"
                                    )}
                                </ValueWithLabel>
                            ))}
                        </SpaceBetween>
                    </Container>
                    <Container
                        header={
                            <Header variant="h2">
                                Sentiment
                            </Header>
                        }>
                        <SentimentChart
                            data={data?.ConversationAnalytics?.SentimentTrends}
                            speakerOrder={speakerLabels}
                        />
                        <Header variant="h2">Speaker Time</Header>
                        <SpeakerTimeChart
                            data={Object.entries(
                                data?.ConversationAnalytics?.SpeakerTime || {}
                            ).map(([key, value]) => ({
                                value: value.TotalTimeSecs,
                                label: speakerLabels[key],
                                channel: key
                            }))}
                            speakerOrder={speakerLabels}
                        />
                    </Container>
                    {isTranscribeCallAnalyticsMode && (
                        <Container fitHeight
                            header={
                                <Header variant="h2">
                                    Loudness/Sentiment
                                </Header>
                            }
                        >
                            {!loudnessData && !error ? (
                                <div key='noSpeakers'>No Speakers</div>
                            ) : (
                                <LoudnessChart loudnessData={loudnessData} speakerLabels={speakerLabels} />
                            )}
                        </Container>
                    )}
                    {!isTranscribeCallAnalyticsMode && (
                        <Container
                            header={
                                <Header variant="h2">
                                    Comprehend Sentiment
                                </Header>
                            }
                        >
                            {!loudnessData && !error ? (
                                <div key='noSpeakers'>No Speakers</div>
                            ) : (
                                <ComprehendSentimentChart comprehendSentimentData={loudnessData} speakerLabels={speakerLabels} />
                            )}
                        </Container>
                    )}
                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Entities
                            </Header>
                        }
                    >
                        {!data && !error ? (
                            <Placeholder />
                        ) : (
                            <Entities data={data?.ConversationAnalytics?.CustomEntities} />
                        )}
                    </Container>

                    {isTranscribeCallAnalyticsMode && (
                        <Container
                            fitHeight={true}
                            header={
                                <Header variant="h2">
                                    Categories
                                </Header>
                            }>
                            {!data && !error ? (
                                <Placeholder />
                            ) : (
                                <ListItems
                                    data={data?.ConversationAnalytics?.CategoriesDetected.map(
                                        (category) => category.Name
                                    )}
                                />
                            )}
                        </Container>
                    )}
                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Generative AI Insights
                            </Header>
                        }

                    >
                        <SpaceBetween size="m">
                            {genAiSummary.length > 0 ? genAiSummary.map((entry, i) => (
                                <ValueWithLabel key={i} label={entry.label}>
                                    {entry.value}
                                </ValueWithLabel>
                            )) : <ValueWithLabel key='nosummary'>No Summary Available</ValueWithLabel>}
                        </SpaceBetween>
                    </Container>
                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                QA Report
                            </Header>
                        }

                    >
                        <SpaceBetween size="m">
                            <div style={{ maxHeight: "350px" }}>
                                <ValueWithLabel key='QAScore' label='Overall Score'>{qaScore}</ValueWithLabel>
                                {qaReport.length > 0 ? qaReport.map((entry, i) => (
                                    <ValueWithLabel key={i} label={entry.label}>
                                        <ul>
                                            {entry.value.map(item => {
                                                return (<li>
                                                    {item.rule}
                                                    <span style={{ paddingLeft: 10 }}>{item.followed === 'yes' ? '✅︎' : '❌'}</span>
                                                </li>)
                                            })}
                                        </ul>
                                    </ValueWithLabel>
                                )) : <ValueWithLabel key='nosummary'>No Qa Report Available</ValueWithLabel>}
                            </div>
                        </SpaceBetween>
                    </Container>

                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Generative AI Query
                            </Header>
                        }
                        // For future use. :) 
                        footer={
                            <ChatInput submitQuery={submitQuery} />
                        }
                    >
                        <div id="chatDiv" style={{ overflow: "hidden", overflowY: 'auto', height: '30em' }}>
                            <SpaceBetween size="m">
                                {genAiQueries.length > 0 ? genAiQueries.map((entry, i) => (
                                    <ValueWithLabel key={i} index={i} label={entry.label}>
                                        {entry.value === '...' ? <div style={{ height: '30px' }}><Spinner /></div> : entry.value}
                                    </ValueWithLabel>
                                )) : <ValueWithLabel key='nosummary'>Ask a question below.</ValueWithLabel>}
                            </SpaceBetween>
                        </div>
                    </Container>

                    <Container
                        fitHeight={true}
                        header={
                            <Header variant="h2">
                                Tonality based analysis
                            </Header>
                        }
                    >
                        <TonalityTable data={tonalityData || []} loading={!tonalityData} />
                    </Container>

                    <Container
                        header={
                            <Header
                                variant="h2"
                                actions={
                                    <SpaceBetween
                                        direction="horizontal"
                                        size="xs"
                                    >
                                        {data && (
                                            <audio
                                                key='audoiElem'
                                                ref={audioElem}
                                                className="float-end"
                                                controls
                                                src={
                                                    data?.ConversationAnalytics?.SourceInformation[0]
                                                        ?.TranscribeJobInfo?.MediaFileUri
                                                }
                                                onTimeUpdate={onAudioPlayTimeUpdate}
                                            >
                                                Your browser does not support the
                                                <code>audio</code> element.
                                            </audio>
                                        )}
                                    </SpaceBetween>
                                }
                            >
                                Transcript
                            </Header>
                        }>
                        <div ref={transcriptElem}>
                            {!data && !error ? (
                                <Placeholder />
                            ) : (
                                (data?.SpeechSegments || []).map((s, i) => (
                                    <TranscriptSegment
                                        key={i}
                                        name={speakerLabels[s.SegmentSpeaker]}
                                        allSegments={s?.WordConfidence || []}
                                        segmentStart={s.SegmentStartTime}
                                        text={s.DisplayText}
                                        onClick={setAudioCurrentTime}
                                        highlightLocations={[
                                            ...s.EntitiesDetected.map((e) => ({
                                                start: e.BeginOffset,
                                                end: e.EndOffset,
                                                fn: (match, key, start, end, offsetStart, offsetEnd) => (
                                                    <TranscriptOverlay
                                                        key={key}
                                                        colour={getEntityColor(e.Type)}
                                                        visuallyHidden={`Entity - ${e.Type}`}
                                                        data-start={start}
                                                        data-end={end}
                                                        data-offset-start={offsetStart}
                                                        data-offset-end={offsetEnd}
                                                        content={match}
                                                        type={""}
                                                        entityOffsetStart={e.BeginOffset}
                                                        entityOffsetEnd={e.EndOffset}
                                                        entityClass={"text-danger"}
                                                        addType={offsetStart === e.BeginOffset ? true : false}
                                                    >
                                                    </TranscriptOverlay>
                                                ),
                                            })),
                                            ...(s.IssuesDetected ? s.IssuesDetected?.map((issue) => ({
                                                start: issue.BeginOffset,
                                                end: issue.EndOffset,
                                                fn: (match, key, start, end, offsetStart, offsetEnd) => (
                                                    <TranscriptOverlay
                                                        key={key}
                                                        colour="#ffff00"
                                                        tooltip="Issue"
                                                        data-start={start}
                                                        data-end={end}
                                                        data-offset-start={offsetStart}
                                                        data-offset-end={offsetEnd}
                                                        content={match}
                                                        type={"Issue"}
                                                        entityOffsetStart={issue.BeginOffset}
                                                        entityOffsetEnd={issue.EndOffset}
                                                        entityClass={"text-danger"}
                                                        addType={offsetStart === issue.BeginOffset ? true : false}
                                                    >
                                                    </TranscriptOverlay>
                                                ),
                                            })) : []),
                                            ...(s.ActionItemsDetected ? s.ActionItemsDetected?.map((issue) => ({
                                                start: issue.BeginOffset,
                                                end: issue.EndOffset,
                                                fn: (match, key, start, end, offsetStart, offsetEnd) => (
                                                    <TranscriptOverlay
                                                        key={key}
                                                        colour="lightpink"
                                                        tooltip="Action Item"
                                                        data-start={start}
                                                        data-end={end}
                                                        data-offset-start={offsetStart}
                                                        data-offset-end={offsetEnd}
                                                        content={match}
                                                        type={"Action Item"}
                                                        entityOffsetStart={issue.BeginOffset}
                                                        entityOffsetEnd={issue.EndOffset}
                                                        entityClass={"text-danger"}
                                                        addType={offsetStart === issue.BeginOffset ? true : false}
                                                    >
                                                    </TranscriptOverlay>
                                                ),
                                            })) : []),
                                            ...(s.OutcomesDetected ? s.OutcomesDetected?.map((issue) => ({
                                                start: issue.BeginOffset,
                                                end: issue.EndOffset,
                                                fn: (match, key, start, end, offsetStart, offsetEnd) => (
                                                    <TranscriptOverlay
                                                        key={key}
                                                        colour="aquamarine"
                                                        tooltip="Outcome"
                                                        data-start={start}
                                                        data-end={end}
                                                        data-offset-start={offsetStart}
                                                        data-offset-end={offsetEnd}
                                                        content={match}
                                                        type={"Outcome"}
                                                        entityOffsetStart={issue.BeginOffset}
                                                        entityOffsetEnd={issue.EndOffset}
                                                        entityClass={"text-danger"}
                                                        addType={offsetStart === issue.BeginOffset ? true : false}
                                                    >
                                                    </TranscriptOverlay>
                                                ),
                                            })) : []),
                                        ]}
                                        score={s.LLMSentimentScore}
                                        interruption={s.SegmentInterruption}
                                        ivr={s?.IVRSegment || false}
                                        categoryList={s.CategoriesDetected}
                                    />
                                ))
                            )}</div>
                    </Container>
                </Grid>
            </ContentLayout >
        </Layout>
    );
}

export default Call;
