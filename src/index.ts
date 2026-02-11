import "dotenv/config";
import { google } from "googleapis";
import { authorize, Account } from "./auth.js";
import { backupFile } from "./backup.js";

function usage() {
  console.log(`\nUsage:
  npm run dev -- auth <origin|destination>
  npm run dev -- whoami <origin|destination>
  npm run dev -- info <fileId|url>
  npm run dev -- ping-script
  npm run dev -- backup <fileId|url>
`);
}

function parseFileId(input: string): string {
  const trimmed = input.trim();
  const idMatch = trimmed.match(/[-\w]{25,}/);
  if (trimmed.startsWith("http") && idMatch) return idMatch[0];
  if (trimmed.length > 0) return trimmed;
  throw new Error("Could not parse file id.");
}

async function getParentName(drive: ReturnType<typeof google.drive>, parentId: string) {
  try {
    const parent = await drive.files.get({
      fileId: parentId,
      fields: "id,name",
      supportsAllDrives: true,
    });
    return parent.data.name ?? "(unnamed folder)";
  } catch {
    return "(unable to fetch parent folder name)";
  }
}

const APPS_SCRIPT_ID = process.env.APPS_SCRIPT_ID?.trim();
const APPS_SCRIPT_DEV_MODE =
  process.env.APPS_SCRIPT_DEV_MODE?.toLowerCase() === "true" ||
  process.env.APPS_SCRIPT_DEV_MODE === "1";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
    process.exit(1);
  }

  const [command, ...rest] = args;

  if (command === "auth") {
    const account = rest[0] as Account | undefined;
    if (account !== "origin" && account !== "destination") {
      console.error("Account must be origin or destination.");
      process.exit(1);
    }
    await authorize(account);
    return;
  }

  if (command === "info") {
    const input = rest[0];
    if (!input) {
      console.error("Provide a file ID or URL.");
      process.exit(1);
    }
    const fileId = parseFileId(input);

    const auth = await authorize("origin");
    const drive = google.drive({ version: "v3", auth });

    const file = await drive.files.get({
      fileId,
      fields: "id,name,parents",
      supportsAllDrives: true,
    });

    const name = file.data.name ?? "(unnamed)";
    const parents = file.data.parents ?? [];

    let parentName = "(none)";
    if (parents.length > 0) {
      parentName = await getParentName(drive, parents[0]);
    }

    console.log(`\nFile: ${name}`);
    console.log(`Parent Folder: ${parentName}`);
    console.log(`Parent ID: ${parents[0] ?? "(none)"}`);
    return;
  }

  if (command === "whoami") {
    const account = rest[0] as Account | undefined;
    if (account !== "origin" && account !== "destination") {
      console.error("Account must be origin or destination.");
      process.exit(1);
    }
    const auth = await authorize(account);
    const drive = google.drive({ version: "v3", auth });
    const about = await drive.about.get({ fields: "user(emailAddress,displayName)" });
    const email = about.data.user?.emailAddress ?? "(unknown)";
    const name = about.data.user?.displayName ?? "(unknown)";
    console.log(`\n${account}: ${name} <${email}>`);
    return;
  }

  if (command === "ping-script") {
    if (!APPS_SCRIPT_ID) {
      throw new Error("Set APPS_SCRIPT_ID in .env to run ping.");
    }
    const auth = await authorize("origin");
    const script = google.script({ version: "v1", auth });
    const run = await script.scripts.run({
      scriptId: APPS_SCRIPT_ID,
      requestBody: {
        function: "ping",
        devMode: APPS_SCRIPT_DEV_MODE,
      },
    });

    if (run.data.error) {
      const details = run.data.error.details?.[0];
      const message =
        details?.errorMessage ?? run.data.error.message ?? "Apps Script error";
      throw new Error(message);
    }

    console.log("\nApps Script ping OK:", JSON.stringify(run.data.response?.result));
    return;
  }

  if (command === "backup") {
    const input = rest[0];
    if (!input) {
      console.error("Provide a file ID or URL.");
      process.exit(1);
    }
    const fileId = parseFileId(input);
    await backupFile(fileId);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error("\nError:", err?.message ?? err);
  process.exit(1);
});
