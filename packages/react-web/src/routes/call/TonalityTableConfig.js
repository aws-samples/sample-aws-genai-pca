// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { createTableSortLabelFn } from "../../common/i18n-strings";
import { DateTimeForm, formatDateTime } from '../../components/DateTimeForm';
import { Formatter } from "../../format";

const rawColumns = [
    {
        id: "timestamp",
        sortingField: "timestamp",
        header: "Timestamp",
        cell: e => Formatter.Time(e.timestamp),
        minWidth: 100
    },
    {
        id: "speaker",
        header: "Speaker",
        sortingField: "speaker",
        cell: e => e.speaker,
    },
    {
        id: "detection",
        header: "Detection",
        sortingField: "detection",
        cell: e => e.detection,
    },
    {
        id: "abusive",
        header: "Abusive",
        sortingField: "abusive",
        cell: e => e.abusive ? "Yes" : "No",
    },
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
        key: "speaker",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Speaker",
        groupValuesLabel: "speaker"
    },
    {
        key: "detection",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Detection",
        groupValuesLabel: "detection"
    },
    {
        key: "abusive",
        operators: ["=", "!=", ":", "!:"],
        propertyLabel: "Abusive",
        groupValuesLabel: "abusive"
    },
].sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel));

export const DEFAULT_PREFERENCES = {
    pageSize: 30,
    wrapLines: false,
    stripedRows: true,
    contentDensity: 'comfortable',
}