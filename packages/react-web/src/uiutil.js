// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Link } from "@cloudscape-design/components";


function GetLink(e) {
  if (e.status === "PROCESSED") {
    return <Link variant="primary" href={`/tickets/${e.ticketId}/${e.PK}`}>{e.PK}</Link>;
  }
  else {
    return e.PK;
  }
}


export const UiUtil = { GetLink };
