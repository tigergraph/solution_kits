import { globSync } from "glob";
import { parse } from "yaml";
import fs from "fs";
import path from "path";
import "dotenv/config";
import AWS from "aws-sdk";
import mime from "mime";

const emptySchemaJSON = {
  error: false,
  message: "",
  results: {
    EdgeTypes: [],
    VertexTypes: [],
  },
};

const emptyStyleJSON = {
  error: false,
  message: "",
  results: {
    vertexStyles: {},
    edgeStyles: {},
  },
};

const bucketName = "tigergraph-solution-kits";
const disableCacheControl = "max-age=0,no-cache,no-store";
const imageCacheControl = "max-age=86400"; // cache image for  1 day

const s3 = new AWS.S3();
const commonBucketConfig = {
  Bucket: bucketName,
};

async function syncFile(file, cacheControl = disableCacheControl) {
  const params = {
    ...commonBucketConfig,
    Key: file,
    Body: fs.readFileSync(file),
    ContentType: mime.getType(path.extname(file)),
    CacheControl: cacheControl,
  };

  let shouldUpload = true;
  try {
    const object = await s3
      .headObject({
        Bucket: bucketName,
        Key: file,
      })
      .promise();
    const length = object.ContentLength;
    const fileLength = params.Body.length;

    if (length === fileLength) {
      shouldUpload = false;
    }
  } catch (error) {
    if (error.code === "NotFound") {
    } else {
      shouldUpload = false;
    }
  }

  if (shouldUpload) {
    try {
      const data = await s3.upload(params).promise();
      console.log(`${file} => ${data.Location}`);
      return data.Location;
    } catch (error) {
      console.error(`Error uploading ${file}:`, error);
    }
  }

  return `https://${bucketName}.s3.us-west-1.amazonaws.com/${file}`;
}

async function syncFolder(folder, cacheControl = disableCacheControl) {
  const files = globSync([`${folder}/*`, `${folder}/*/*`]);
  let results = [];
  for (let file of files) {
    results.push(await syncFile(file, cacheControl));
  }
  return results;
}

function getAllSolutions() {
  const metaFiles = globSync("**/meta/meta.yml", {
    ignore: ["solution_kits/scripts/**"],
  });

  return metaFiles.map((file) => file.slice(0, -"/meta/meta.yml".length));
}

async function getSolution(dir) {
  const file = fs.readFileSync(`${dir}/meta/meta.yml`, "utf8");
  const content = parse(file);

  let iconPath = "";
  if (fs.existsSync(`${dir}/meta/icon.png`)) {
    iconPath = `${dir}/meta/icon.png`;
  } else if (fs.existsSync(`${dir}/meta/icon.jpg`)) {
    iconPath = `${dir}/meta/icon.jpg`;
  }

  if (iconPath) {
    content.metadata.icon = await syncFile(iconPath, imageCacheControl);
  }

  content.metadata.images = await syncFolder(`${dir}/meta/images`, imageCacheControl);
  content.metadata.images.sort();

  const hasInsightsApplication = fs.existsSync(`${dir}/meta/application.json`);
  let insightsApplication = null;
  if (hasInsightsApplication) {
    insightsApplication = await syncFile(`${dir}/meta/application.json`);
  }
  content.metadata.insightsApplication = insightsApplication;

  content.metadata.provider = content.metadata.provider || "TigerGraph";
  content.metadata.algorithms = content.metadata.algorithms || [];

  syncFolder(`${dir}/data`);

  return content;
}

function concatFiles(files) {
  const fileContents = files.map((file) => fs.readFileSync(file, "utf8"));

  let content = "";
  for (let i = 0; i < files.length; i++) {
    content += "#File: " + files[i] + "\n";
    content += fileContents[i];
    content += "\n\n";
  }

  return content;
}

async function getSolutionDetail(dir, first, last) {
  const schemaFiles = globSync(`${dir}/schema/*.gsql`);
  const schema = concatFiles(schemaFiles);

  let schemaJSON = "";
  try {
    schemaJSON = fs.readFileSync(`${dir}/meta/schema.json`, "utf8");
  } catch (error) {}
  let styleJSON = "";
  try {
    styleJSON = fs.readFileSync(`${dir}/meta/style.json`, "utf8");
  } catch (error) {}

  const queryFiles = globSync([`${dir}/queries/*.gsql`, `${dir}/queries/*/*.gsql`]);

  const firstFiles = [];
  for (let file of first) {
    const path = `${dir}/queries/${file}`;
    if (queryFiles.includes(path)) {
      firstFiles.push(path);
    }
  }
  const lastFiles = [];
  for (let file of last) {
    const path = `${dir}/queries/${file}`;
    if (queryFiles.includes(path)) {
      lastFiles.push(path);
    }
  }
  const middleFiles = queryFiles.filter(
    (file) => !firstFiles.includes(file) && !lastFiles.includes(file)
  );

  const allQueryFiles = [...firstFiles, ...middleFiles, ...lastFiles];
  const query = concatFiles(allQueryFiles);

  const sampleLoadingJobFiles = globSync(`${dir}/loading_job/*.gsql`);
  const sampleLoadingJob = concatFiles(sampleLoadingJobFiles);

  const resetFiles = globSync(`${dir}/reset/*.gsql`);
  const reset = concatFiles(resetFiles);

  let queriesDocs = "";
  try {
    queriesDocs = fs.readFileSync(`${dir}/meta/queriesDocs.json`, "utf8");
  } catch (error) {}

  const hasUDF = fs.existsSync(`${dir}/udf`);

  return {
    schema,
    schemaJSON: schemaJSON ? JSON.parse(schemaJSON) : emptySchemaJSON,
    styleJSON: styleJSON ? JSON.parse(styleJSON) : emptyStyleJSON,
    queriesDocs: queriesDocs ? JSON.parse(queriesDocs).queries : [],
    query,
    sampleLoadingJob,
    reset,
    hasUDF,
  };
}

async function main() {
  const solutions = getAllSolutions();
  const metadataList = [];
  for (let solution of solutions) {
    const { metadata, queries: { first = [], last = [] } = {} } = await getSolution(solution);

    metadataList.push({
      ...metadata,
      path: solution,
    });

    const solutionDetails = await getSolutionDetail(solution, first, last);
    const params = {
      ...commonBucketConfig,
      Key: `${solution}/meta.json`,
      Body: JSON.stringify(solutionDetails, null, 4),
      ContentType: "application/json",
    };

    try {
      const data = await s3.upload(params).promise();
      console.log(`${solution}/meta.json => ${data.Location}`);
    } catch (error) {
      console.error(`Error uploading ${solution}:`, error);
      process.exit(1);
    }
  }

  const params = {
    ...commonBucketConfig,
    Key: "list.json",
    Body: JSON.stringify(metadataList, null, 4),
    ContentType: "application/json",
  };

  try {
    const data = await s3.upload(params).promise();
    console.log(`list.json => ${data.Location}`);
  } catch (error) {
    console.error("Error uploading solution list:", error);
    process.exit(1);
  }
}

main();

// Debug code
// function decodeSolution(path) {
//   const file = fs.readFileSync(path, "utf8");
//   const content = JSON.parse(file);
//   const { schema, query, sampleLoadingJob, reset } = content;
//   console.log(schema);
//   console.log(query);
//   console.log(sampleLoadingJob);
//   console.log(reset);
// }
