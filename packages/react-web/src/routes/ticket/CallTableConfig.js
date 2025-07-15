// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { createTableSortLabelFn } from "../../common/i18n-strings";
import { Link } from "@cloudscape-design/components";
import { SentimentIcon } from "../../components/SentimentIcon";
import { TrendIcon } from "../../components/TrendIcon";
import { DateTimeForm, formatDateTime } from '../../components/DateTimeForm';
import { Formatter } from "../../format";

const rawColumns = [
    {
        id: "callTime",
        sortingField: "callTime",
        header: "Timestamp",
        cell: e => (<Link variant="primary" href={`/tickets/${e.ticketId}/${e.jobId}/${e.callId}`}>{Formatter.Timestamp(e.timestamp)}</Link>),
        minWidth: 220
    },
    {
        id: "initiatorId",
        header: "Initiator Id",
        sortingField: "initiatorId",
        cell: e => e.initiatorId,
        minWidth: 220
    },
    {
        id: "duration",
        header: "Duration",
        sortingField: "duration",
        cell: (e) => Formatter.Time(e.duration * 1000),
    },
    {
        id: "languageCode",
        header: "Language",
        sortingField: "languageCode",
        cell: e => e.languageCode,
    },
    {
        id: "sentimentScore",
        header: "Sentiment",
        sortingField: "sentimentScore",
        cell: e => (
            <div className="d-flex justify-content-evenly">
                <SentimentIcon score={e?.sentimentScore} />
                <TrendIcon trend={e?.sentimentChange} />
            </div>
        )
    },
    {
        id: "overallScore",
        header: "Quality Score",
        sortingField: "overallScore",
        cell: e => e.qaReport.overall_score,
    },
    {
        id: "summary",
        header: "Summary",
        sortingField: "summary",
        cell: e => e.summary,
    },
];

export const COLUMN_DEFINITIONS = rawColumns.map(column => ({ ...column, ariaLabel: createTableSortLabelFn(column) }));

export const FILTERING_PROPERTIES = [
    {
        key: "callTime",
        propertyLabel: "Timestamp",
        groupValuesLabel: "Timestamps",
        defaultOperator: '>',
        operators: ['<', '<=', '>', '>='].map(operator => ({
            operator,
            form: DateTimeForm,
            format: formatDateTime,
            match: 'datetime',
        }))
    },
    {
        key: "initiatorId",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Initiator Id",
        groupValuesLabel: "initiatorId"
    },
    {
        key: "duration",
        propertyLabel: "Duration",
        groupValuesLabel: "duration",
        defaultOperator: '>',
        operators: ['<', '<=', '>', '>='].map(operator => ({
            operator,
            form: DateTimeForm,
            format: formatDateTime,
            match: 'datetime',
        }))
    },
    {
        key: "languageCode",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Language",
        groupValuesLabel: "languageCode"
    },
    {
        key: "sentimentScore",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Sentiment",
        groupValuesLabel: "Sentiment"
    },
    {
        key: "summary",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Summary",
        groupValuesLabel: "summary"
    },
].sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel));

export const DEFAULT_PREFERENCES = {
    pageSize: 30,
    wrapLines: false,
    stripedRows: true,
    contentDensity: 'comfortable',
    stickyColumns: { first: 1, last: 0 },
}