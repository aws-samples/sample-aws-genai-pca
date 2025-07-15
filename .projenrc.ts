// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { MonorepoTsProject } from "@aws/pdk/monorepo";
import { AwsCdkTypeScriptApp } from "projen/lib/awscdk";
import { ReactProject } from "projen/lib/web";
const monorepo = new MonorepoTsProject({
  devDeps: ["@aws/pdk", "@aws-sdk/client-bedrock"],
  name: "aws-genai-post-call-analytics",
  projenrcTs: true,
  gitignore: [],
  license: "MIT-0",
  copyrightOwner: "Amazon.com, Inc. or its affiliates",
  licenseOptions: {
    spdx: "MIT-0",
    copyrightOwner: "Amazon.com, Inc. or its affiliates",
  },
});
const website = new ReactProject({
  name: "website",
  defaultReleaseBranch: "main",
  packageName: "website",
  outdir: "packages/react-web",
  npmignoreEnabled: false,
  parent: monorepo,
  gitignore: ["public/aws-config.js"],
  scripts: {
    start: "react-scripts start",
    eject: "react-scripts eject",
  },
  deps: [
    "@cloudscape-design/board-components@^3.0.33",
    "@cloudscape-design/collection-hooks@^1.0.0",
    "@cloudscape-design/components@^3.0.0",
    "@cloudscape-design/design-tokens@^3.0.0",
    "@cloudscape-design/global-styles@^1.0.0",
    "@testing-library/jest-dom@^5.17.0",
    "@testing-library/react@^13.4.0",
    "@testing-library/user-event@^13.5.0",
    "@aws-amplify/ui-react@^5.3.1",
    "aws-amplify@^6.0.28",
    "@aws-amplify/auth@^6.0.28",
    "@aws-amplify/core@^6.0.28",
    "@aws-amplify/ui-react@^6.0.28",
    "@aws-amplify/api@^6.0.28",
    "chance@^1.1.11",
    "chart.js@^4.4.0",
    "luxon@^3.4.3",
    "react@^18.2.0",
    "react-dropzone",
    "react-bootstrap@^2.9.1",
    "react-chartjs-2@^5.2.0",
    "react-datepicker@^4.2.1",
    "react-dom@^18.2.0",
    "react-icons@^4.11.0",
    "react-router-dom@^6.15.0",
    "react-scripts@5.0.1",
    "web-vitals@^2.1.4",
  ],
});

website.removeTask("build");
website.removeTask("test");
website.addTask("build", {
  exec: "react-scripts build",
});
website.addTask("test", {
  exec: "react-scripts test",
});
const infra = new AwsCdkTypeScriptApp({
  cdkVersion: "2.161.0",
  defaultReleaseBranch: "main",
  name: "infra",
  appEntrypoint: "bin/app.ts",
  outdir: "packages/infra",
  devDeps: ["esbuild"],
  parent: monorepo,
  lambdaAutoDiscover: false,
  deps: [
    "cdk-nag",
    "@aws/pdk",
    "@aws-cdk/aws-lambda-python-alpha",
    "@aws-sdk/client-s3@3.352.0",
    "@aws-sdk/s3-request-presigner",
    "@types/aws-lambda",
    "jsonwebtoken",
    "unzip-stream",
    "@types/jsonwebtoken",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-dynamodb@3.352.0",
    "@aws-sdk/client-sfn",
    "aws-lambda",
    "@aws-sdk/util-dynamodb",
    "@aws-solutions-constructs/aws-wafwebacl-apigateway",
    "@aws-solutions-constructs/aws-wafwebacl-cloudfront",
    "@aws-sdk/client-bedrock",
  ],
  sampleCode: false,
  context: {
    allowedDomains: "*",
    allowCloudFrontRegionList: [],
    stackName: "genai-pca-stack",
    bedrockModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  },
});

monorepo.package.addPackageResolutions(
  ...[
    // https://www.npmjs.com/advisories/1091426
    "**/js-yaml@^3.13.1",
    // https://www.npmjs.com/advisories/1092100
    "**/nth-check@^2.0.1",
    // https://www.npmjs.com/advisories/1092243
    "**/fast-xml-parser@^4.2.5",
    //https://github.com/advisories/GHSA-c2qf-rxjj-qqgw
    "**/semver@^7.5.2",
    //https://github.com/advisories/GHSA-72xf-g2v4-qvf3
    "**/tough-cookie@^4.1.3",
    //https://github.com/advisories/GHSA-j8xg-fqg3-53r7
    "**/word-wrap@^1.2.4",
    //https://github.com/advisories/GHSA-h755-8qp9-cq85
    "**/protobufjs@^7.2.4",
  ],
);
monorepo.addImplicitDependency(infra, website);
const PERMITTED_LICENSES = [
  "MIT",
  "Apache-2.0",
  "Unlicense",
  "BSD",
  "BSD*",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "Zlib",
  "WTFPL",
  "Python-2.0",
];

// Check dependency licenses
const licenseCheckerCommand = `npx license-checker --production --onlyAllow '${PERMITTED_LICENSES.join(
  ";",
)}' --excludePrivatePackages --summary --excludePackages '${monorepo.sortedSubProjects
  .map((p) => `${p.name}@0.0.0`)
  .join(";")}'`;
// Check monorepo and all subprojects
monorepo.buildTask.exec(licenseCheckerCommand);
monorepo.synth();
