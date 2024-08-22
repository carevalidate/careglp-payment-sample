import * as functions from "firebase-functions";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";

// If the incoming company name is, e.g. YOUR_COMPANY, then you would
// need to have a secret named YOUR_COMPANY_CAREGLP_API_KEY set in
// Google Secret Manager

// This needs to be set to your Google Cloud project name.
// Please set the same value in .firebaserc at the top level.
const project = "your-project-name";
const secretClient = new SecretManagerServiceClient();


async function getSecret(name: string): Promise<string> {
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${project}/secrets/${name}/versions/latest`,
  });
  const payload = version.payload?.data?.toString();
  if (!payload) {
    throw new Error("Secret payload is empty");
  }
  return payload;
}

export const initiatePayment = functions.https.onRequest(async (request, response) => {
  try {
    // can add specific domains instead for security
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.set("Access-Control-Max-Age", "3600");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    const companyName = request.query.companyName as string;
    const keyName = companyName ? `${companyName.toUpperCase()}_CAREGLP_API_KEY` :
      "CAREGLP_API_KEY";
    const apiKey = await getSecret(keyName);

    const payload = {
      ...request.body,
      key: apiKey,
    };

    const url = "https://us-central1-care360-next.cloudfunctions.net/initiatePayment";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Failed to forward payment initiation: ${res.statusText}`);
    }

    const data = await res.json();
    response.status(200).send(data);
  } catch (error) {
    functions.logger.error("Failed to initiate payment", error);
    if (!(error instanceof Error) || !error.message) {
      response.status(500).send("Internal Server Error");
      return;
    } else response.status(500).send(error.message);
  }
});
