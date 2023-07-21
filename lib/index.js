const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const md5 = require("md5");

const { Metal } = require("@getmetal/metal-sdk");
const { Configuration, OpenAIApi } = require("openai");
const { encode } = require("js-base64");

const shouldIgnore = require("../utils/ignore");

const fetch = require("node-fetch-commonjs");

const config = new Configuration({
  apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(config);

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION,
});

async function processDirectory(basePath, repoPath, localPath, metal) {
  const currPath = path.join(basePath, repoPath, ...localPath);
  if (shouldIgnore(currPath)) {
    console.log(`Ignoring ${currPath}`);
    return "";
  }
  console.log(`Processing ${currPath}`);
  const files = fs.readdirSync(currPath);
  console.log(`Files ${files}`);
  const summaries = [];
  const metalDocs = [];

  // traverse directory
  for (const file of files) {
    const filePath = path.join(currPath, file);
    const newLocalPath = [...localPath, file];
    try {
      if (fs.statSync(filePath).isDirectory()) {
        console.log(
          `Filepath ${filePath}, ${fs.statSync(filePath).isDirectory()}`,
        );
        const summary = await processDirectory(
          basePath,
          repoPath,
          newLocalPath,
          metal,
        );
        summaries.push([newLocalPath.join("/"), summary]);
      }
    } catch (e) {
      console.log(`Error processing ${filePath}`);
      console.log(e);
      summaries.push([newLocalPath.join("/"), ""]);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 40 * files.length)); // for rate limit

  const processingPromises = files.map(async (file) => {
    const filePath = path.join(currPath, file);
    const localPathWithFile = [...localPath, file];
    try {
      console.log(
        `Filepath ${filePath}, ${fs.statSync(filePath).isDirectory()}`,
      );
      if (fs.statSync(filePath).isDirectory()) {
        // Skip this time around, already processed above
      } else if (!shouldIgnore(filePath)) {
        console.log(filePath);
        const content = fs.readFileSync(filePath, "utf-8");
        console.log(`Summarizing ${filePath}`);
        let result = "";
        try {
          // never do this, but we need to catch the error
          try {
            const chatCompletion = await openai.createChatCompletion({
              model: "gpt-3.5-turbo",
              messages: [
                {
                  role: "user",
                  content:
                    `Explain this code file, named ${file}, in at most 3 sentences:\n` +
                    content,
                },
              ],
            });
            console.log(
              "summary file:",
              chatCompletion.data.choices[0].message?.content?.trim(),
            );
            result =
              chatCompletion.data.choices[0].message?.content?.trim() || "";
          } catch (e) {
            const chatCompletion = await openai.createChatCompletion({
              model: "gpt-3.5-turbo-16k",
              messages: [
                {
                  role: "user",
                  content:
                    `Explain this code file, named ${file}, in at most 3 sentences:\n` +
                    content,
                },
              ],
            });
            console.log(
              "summary file:",
              chatCompletion.data.choices[0].message?.content?.trim(),
            );
            result =
              chatCompletion.data.choices[0].message?.content?.trim() || "";
          }
        } catch (e) {
          console.log(`Error summarizing ${filePath}`);
          localPathWithFile.pop(); // skip file that fails even the 16k
          return;
        }
        if (result !== "") {
          metalDocs.push({
            id: md5(
              ["github", repoPath, localPathWithFile.join("/")].join(":"),
            ),
            index: process.env.METAL_INDEX_ID || "",
            text: result,
            metadata: {
              repository: encode(repoPath, true),
              filepath: localPathWithFile.join("/"),
            },
          });
        }
        summaries.push([localPathWithFile.join("/"), result]);
      } else {
        console.log(`Ignoring ${filePath}`);
        summaries.push([localPathWithFile.join("/"), ""]); // do we want to add a summary for ignored files?
      }
    } catch (e) {
      console.log(`Error processing ${filePath}`);
      console.log(e);
      summaries.push([localPathWithFile.join("/"), ""]);
    }
  });

  // Wait for all promises to resolve
  await Promise.all(processingPromises);

  // add timeout for following summary request to avoid rate limit
  await new Promise((resolve) => setTimeout(resolve, 40));

  const contentSummary = summaries
    .map(([file, summary]) => `${file}: ${summary || "n/a"}`)
    .join("\n");
  const chatCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: `Summarize the contents and functionality of the following directory in at most 3 sentences.\nThe directory is ${localPath.join(
          "/",
        )}, and its contents are as follows:\n\n${contentSummary}`,
      },
    ],
  });
  console.log(
    "summary directory:",
    chatCompletion.data.choices[0].message?.content?.trim(),
  );
  const result = chatCompletion.data.choices[0].message?.content?.trim();

  if (result !== "") {
    metalDocs.push({
      id: md5(["github", repoPath, localPath.join("/")].join(":")),
      index: process.env.METAL_INDEX_ID || "",
      text: result,
      metadata: {
        repository: encode(repoPath, true),
        filepath: localPath.join("/"),
      },
    });
  }

  const batchSize = 100;
  for (let i = 0; i < metalDocs.length; i += batchSize) {
    console.log(
      `Indexing batch ${i / batchSize + 1} of ${Math.ceil(
        metalDocs.length / batchSize,
      )}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    await metal.indexMany(metalDocs.slice(i, i + batchSize));
  }

  return result;
}

const deleteDirectory = (dirPath) => {
  try {
    fs.rm(dirPath, { recursive: true }, (err) => {
      if (err) {
        throw new Error(err.message);
      }
    });
  } catch (e) {
    console.log(`Error deleting ${dirPath}`);
    console.log(e);
  }
};

export default async function main(repoUrl) {
  if (!repoUrl) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "No repo url provided",
      }),
    };
  }
  console.log("Clone request received: " + repoUrl);
  const localPath = "/tmp/repos";
  const repoPath = repoUrl.substring(
    repoUrl.indexOf("github.com/") + "github.com/".length,
    repoUrl.indexOf(".git"),
  );

  // clone repo
  try {
    const repoInfo = await dynamodb
      .get({
        TableName: process.env.AWS_DYNAMODB_TABLE,
        Key: {
          repository: repoPath,
        },
      })
      .promise();
    console.log(repoInfo);

    if (repoInfo?.status === "submitted" || repoInfo?.status === "completed") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "repo processed",
        }),
      };
    }

    await dynamodb
      .put(
        {
          TableName: process.env.AWS_DYNAMODB_TABLE,
          Item: {
            repository: repoPath,
            status: "submitted",
          },
        },
        (err) => {
          if (err) console.log(err);
        },
      )
      .promise();
    console.log("job submitted");

    const response = await fetch(`https://api.github.com/repos/${repoPath}`, {
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .catch((err) => console.log(err));

    if (!response?.id) {
      console.log("Failed to get repository details.");
      await dynamodb
        .put(
          {
            TableName: process.env.AWS_DYNAMODB_TABLE,
            Item: {
              repository: repoPath,
              status: "failed to get repository details",
            },
          },
          (err) => {
            if (err) console.log(err);
          },
        )
        .promise();
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to get repository details.",
        }),
      };
    }
    // delete the repo if it already exists
    if (fs.existsSync(`${localPath}/${repoPath}`)) {
      console.log("Deleting existing repo");
      deleteDirectory(`${localPath}/${repoPath}`);
    }

    await new Promise(async (resolve) => {
      await exec(
        `git clone ${repoUrl} ${localPath}/${repoPath}`,
        async (error, stderr, stdout) => {
          if (error) {
            await dynamodb
              .put(
                {
                  TableName: process.env.AWS_DYNAMODB_TABLE,
                  Item: {
                    repository: repoPath,
                    status: "failed to clone repository",
                  },
                },
                (err) => {
                  if (err) console.log(err);
                },
              )
              .promise();
            return {
              statusCode: 500,
              body: JSON.stringify({
                message: "Failed to clone repository.",
              }),
            };
          }
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          resolve(stdout ? stdout : stderr);
        },
      );
    });

    // set up metal
    const metalRetriever = new Metal(
      process.env.METAL_API_KEY || "",
      process.env.METAL_CLIENT_ID || "",
      process.env.METAL_INDEX_ID || "",
    );

    console.log("Starting processing directory");
    await processDirectory(localPath, repoPath, [], metalRetriever);
    console.log("Finished processing directory");
    deleteDirectory(`${localPath}/${repoPath}`);

    await dynamodb
      .put(
        {
          TableName: process.env.AWS_DYNAMODB_TABLE,
          Item: {
            repository: repoPath,
            status: "completed", // need to have failed as first word TODO: change to better failure detection
          },
        },
        (err) => {
          if (err) console.log(err);
        },
      )
      .promise();
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "job complete",
      }),
    };
  } catch (error) {
    console.log(error);
    console.log("job failed");
    await dynamodb
      .put(
        {
          TableName: process.env.AWS_DYNAMODB_TABLE,
          Item: {
            repository: repoPath,
            status: "failed",
          },
        },
        (err) => {
          if (err) console.log(err);
        },
      )
      .promise();
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: error,
      }),
    };
  }
}
