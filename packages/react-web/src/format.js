// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// import { DateTime } from "luxon";

function Time(input) {
  input = Math.floor(input / 1000);

  var hours = Math.floor(input / (60 * 60));
  var mins = Math.floor((input - hours * 60 * 60) / 60);
  var secs = Math.floor(input - hours * 60 * 60 - mins * 60).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  });

  return `${hours}`.padStart(2, "0") + ":" + `${mins}`.padStart(2, "0") + ":" + `${secs}`.padStart(2, "0");
}

function Percentage(input) {
  return input.toLocaleString("en-GB", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function Number(input) {
  return input.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Timestamp(input) {
  const dt = new Date(input * 1000);
  return dt.toISOString().slice(0, 19).replace("T", " ");
}

export const Formatter = { Percentage, Number, Time, Timestamp };
