// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { createTableSortLabelFn } from "../../common/i18n-strings";
import { SentimentIcon } from "../../components/SentimentIcon";
import { TrendIcon } from "../../components/TrendIcon";
import { DateTimeForm, formatDateTime } from '../../components/DateTimeForm';
import { Formatter } from "../../format";
import { UiUtil } from "../../uiutil";

const rawColumns = [
    {
        id: "PK",
        header: "Job",
        cell: e => UiUtil.GetLink(e),
        minWidth: 180,
    },
    {
        id: "ticketId",
        header: "Ticket",
        sortingField: "ticketId",
        cell: e => e.ticketId,
    },
    {
        id: "lastModifiedAt",
        sortingField: "lastModifiedAt",
        header: "Timestamp",
        cell: e => Formatter.Timestamp(e.lastModifiedAt),
        minWidth: 170
    },
    {
        id: "status",
        header: "Status",
        sortingField: "status",
        cell: e => e.status,

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
];

export const COLUMN_DEFINITIONS = rawColumns.map(column => ({ ...column, ariaLabel: createTableSortLabelFn(column) }));

export const FILTERING_PROPERTIES = [
    {
        key: "PK",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Job",
        groupValuesLabel: "Jobs"
    },
    {
        key: "ticketId",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Ticket",
        groupValuesLabel: "Tickets"
    },
    {
        key: "lastModifiedAt",
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
        key: "status",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Status",
        groupValuesLabel: "Status"
    },
    {
        key: "sentimentScore",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Sentiment",
        groupValuesLabel: "Sentiment"
    }
].sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel));

export const DEFAULT_PREFERENCES = {
    pageSize: 30,
    wrapLines: false,
    stripedRows: true,
    contentDensity: 'comfortable',
    stickyColumns: { first: 1, last: 0 },
}