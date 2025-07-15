// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Tag } from "../../components/Tag";
import "./Entities.css";
import { getEntityColor } from "./colours";
import { Tabs } from '@cloudscape-design/components';

const generateTabs = (data) => {
  let tabs = [];

  data.forEach((e, i) => {
    let tab = {
      label: e.Name,
      id: e.Name,
      content: e.Values.map((x, j) => (
        <Tag
          key={j}
          className="me-2 mb-1"
          style={{ "--highlight-colour": getEntityColor(e.Name) }}
        >
          {x}
        </Tag>
      ))
    }
    tabs.push(tab);
  });
  return tabs;
}

export const Entities = ({ data }) => {
  return data.length ? (
    <Tabs tabs={generateTabs(data)} />
  ) : (
    <p>No entities detected</p>
  );
};
