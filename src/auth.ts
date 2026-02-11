import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/script.projects",
];

export type Account = "origin" | "destination";

export function tokenPath(account: Account): string {
  return path.resolve("tokens", `${account}.json`);
}

function loadCredentials(): { client_id: string; client_secret: string; redirect_uris: string[] } {
  const envPath = process.env.GOOGLE_OAUTH_CREDENTIALS;
  const credentialsPath = envPath && envPath.trim().length > 0 ? envPath : path.resolve("credentials.json");
  const raw = fs.readFileSync(credentialsPath, "utf-8");
  const json = JSON.parse(raw);
  const creds = json.installed ?? json.web;
  if (!creds?.client_id || !creds?.client_secret || !creds?.redirect_uris?.length) {
    throw new Error("Invalid OAuth credentials JSON. Expected installed/web client with redirect_uris.");
  }
  return {
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    redirect_uris: creds.redirect_uris,
  };
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function authorize(account: Account) {
  const { client_id, client_secret, redirect_uris } = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokenFile = tokenPath(account);
  if (fs.existsSync(tokenFile)) {
    const token = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log(`\nAuthorize ${account} account:`);
  console.log(authUrl);
  const code = await prompt("\nPaste the authorization code here: ");

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
  console.log(`Saved token to ${tokenFile}`);

  return oAuth2Client;
}
