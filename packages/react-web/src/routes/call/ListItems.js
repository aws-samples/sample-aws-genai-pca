// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { ListGroup } from "react-bootstrap";
import { Tag } from "../../components/Tag";

export const ListItems = ({ data }) => {
  if (!data.length) return <p>No items to display</p>;
  return (
    <ListGroup variant="flush">
      {data.map((v, i) => (
        <ListGroup.Item key={i}>
          <Tag>{v}</Tag>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
};
