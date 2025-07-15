// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { createTableSortLabelFn } from "../../common/i18n-strings";
import { Link } from "@cloudscape-design/components";
import { DateTimeForm, formatDateTime } from '../../components/DateTimeForm';
import { Formatter } from "../../format";

const PREVIEW_LENGTH = 100;

const rawColumns = [
    {
        id: "timestamp",
        sortingField: "timestamp",
        header: "Timestamp",
        cell: e => <Link variant="primary" href={`/tickets/${e.ticketId}/${e.jobId}?logIndex=${e.index}`}>{Formatter.Timestamp(e.timestamp)}</Link>,
        minWidth: 200
    },
    {
        id: "initiator",
        header: "Initiator",
        sortingField: "initiator",
        cell: e => e.initiator,
    },
    {
        id: "initiatorId",
        header: "Initiator Id",
        sortingField: "initiatorId",
        cell: e => e.initiatorId,
    },
    {
        id: "overallScore",
        header: "Quality Score",
        sortingField: "overallScore",
        cell: e => e.initiator === 'agent' ? e.qaReport.overall_score: 'N/A',
    },
    {
        id: "content",
        header: "Content",
        sortingField: "content",
        cell: (e, isRaw) => isRaw ? e.content : e.content.length > PREVIEW_LENGTH ? e.content.substring(0, PREVIEW_LENGTH) + '...' : e.content,
    }
];

export const COLUMN_DEFINITIONS = rawColumns.map(column => ({ ...column, ariaLabel: createTableSortLabelFn(column) }));

export const FILTERING_PROPERTIES = [
    {
        key: "timestamp",
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
        key: "initiator",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Initiator",
        groupValuesLabel: "initiator"
    },
    {
        key: "initiatorId",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Initiator Id",
        groupValuesLabel: "initiatorId"
    },
    {
        key: "content",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Content",
        groupValuesLabel: "content"
    }
].sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel));

export const DEFAULT_PREFERENCES = {
    pageSize: 30,
    wrapLines: false,
    stripedRows: true,
    contentDensity: 'comfortable',
    stickyColumns: { first: 1, last: 0 },
}