// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { colours } from "./colours";
import { Bar } from "react-chartjs-2";
import { Placeholder } from "react-bootstrap";

const getRenderOrder = (key) => {
  if (key === 'Interruptions') return 1;
  else if (key === 'Positive') return 2;
  else if (key === 'Negative') return 1;
  else if (key === 'Neutral') return 3;
  else if (key.indexOf('Customer') >= 0) return 5;
  else return 10;
}

export const LoudnessChart = ({ loudnessData, speakerLabels }) => {
  if (loudnessData === undefined) {
    return <Placeholder />
  }

  const datasets = [];
  Object.keys(speakerLabels).forEach((key, index) => {
    if (key in loudnessData) {
      let dataset = {
        label: speakerLabels[key],
        data: loudnessData[key],
        backgroundColor: colours[key],
        borderColor: colours[key],
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        borderSkipped: true,
        order: getRenderOrder(speakerLabels[key]),
        type: "bar",
        xAxisID: 'x'
      }
      datasets.push(dataset);
    }
  });

  return (
    <Bar
      aria-label="This is a chart showing speaker and caller loudness, interruptions, silence, and sentiment per second."
      height={70}
      data={{
        datasets: datasets,
      }}
      options={{
        scales: {
          x: {
            type: "linear",
            stacked: true,
            offset: false,
            display: true,
            position: "left",
            title: { text: "Seconds", display: true },
          },
          y: {
            display: true,
            stacked: false,
            offset: false,
            position: "left",
            title: { text: "Decibels", display: true },
          },
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              filter: function (item, chart) {
                if (item.text.includes('Positive') ||
                  item.text.includes('Negative') ||
                  item.text.includes('Neutral')
                ) return false;
                return true;
              }
            }
          },
        },
      }}
    />
  );
};
