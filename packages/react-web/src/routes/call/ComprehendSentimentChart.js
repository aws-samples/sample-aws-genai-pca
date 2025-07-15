// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { colours } from "./colours";
import { Line } from "react-chartjs-2";
import { Placeholder } from "react-bootstrap";

const getRenderOrder = (key) => {
  if (key === 'Interruptions') return 1;
  else if (key === 'Positive') return 2;
  else if (key === 'Negative') return 1;
  else if (key === 'Neutral') return 3;
  else if (key.indexOf('Customer') >= 0) return 5;
  else return 10;
}

export const ComprehendSentimentChart = ({ comprehendSentimentData, speakerLabels }) => {
  if (comprehendSentimentData === undefined) {
    return <Placeholder />
  }

  const datasets = [];
  Object.keys(speakerLabels).forEach((key, index) => {
    if (key in comprehendSentimentData) {
      let dataset = {
        label: speakerLabels[key],
        data: comprehendSentimentData[key],
        backgroundColor: colours[key],
        borderColor: colours[key],
        order: getRenderOrder(speakerLabels[key]),
        type: "line",
        tension: 0.1,
        pointRadius: 0,
      }
      datasets.push(dataset);
    }
  });
  console.log("Datasets:", datasets);

  return (
    <Line
      aria-label="This is a chart showing speaker and caller sentiment per second."
      height={70}
      data={{
        type: 'line',
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
            title: { text: "Sentiment (-5 to 5)", display: true },
            suggestedMin: -5,
            suggestedMax: 5
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
