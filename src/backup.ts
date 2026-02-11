import { google } from "googleapis";
import { authorize } from "./auth.js";

const FOLDER_OCADO = "1wmjCSz-LrBzz1eBtsh4wfF_CYDxUNPuR";
const FOLDER_OCADO_BACKUP = "1H_z40P8H-aSIEIy-idSkqWyVtY69T8Ya";
const DESTINATION_EMAIL = process.env.DESTINATION_EMAIL?.trim();
const APPS_SCRIPT_ID = process.env.APPS_SCRIPT_ID?.trim();
const APPS_SCRIPT_DEV_MODE =
  process.env.APPS_SCRIPT_DEV_MODE?.toLowerCase() === "true" ||
  process.env.APPS_SCRIPT_DEV_MODE === "1";

type SupportedType = "document" | "slides" | "spreadsheet";

function getTypeFromMime(mimeType?: string): SupportedType {
  switch (mimeType) {
    case "application/vnd.google-apps.document":
      return "document";
    case "application/vnd.google-apps.presentation":
      return "slides";
    case "application/vnd.google-apps.spreadsheet":
      return "spreadsheet";
    default:
      throw new Error(`Unsupported file type: ${mimeType ?? "unknown"}`);
  }
}

export async function backupFile(fileId: string) {
  const originAuth = await authorize("origin");
  const destAuth = await authorize("destination");

  const originDrive = google.drive({ version: "v3", auth: originAuth });
  const destDrive = google.drive({ version: "v3", auth: destAuth });

  const originFile = await originDrive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  const name = originFile.data.name ?? "(unnamed)";
  const type = getTypeFromMime(originFile.data.mimeType ?? undefined);

  console.log(`\nOrigin: ${name} (${type})`);

  let destFileId: string | undefined;

  if (type === "slides") {
    if (!APPS_SCRIPT_ID) {
      throw new Error("Set APPS_SCRIPT_ID in .env to enable Slides copy.");
    }

    const create = await destDrive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.presentation",
        parents: [FOLDER_OCADO],
      },
      fields: "id",
      supportsAllDrives: true,
    });

    destFileId = create.data.id ?? undefined;
    if (!destFileId) {
      throw new Error("Failed to create destination presentation.");
    }

    const script = google.script({ version: "v1", auth: originAuth });
    try {
      const run = await script.scripts.run({
        scriptId: APPS_SCRIPT_ID,
        requestBody: {
          function: "copySlidesInto",
          parameters: [fileId, destFileId],
          devMode: APPS_SCRIPT_DEV_MODE,
        },
      });

      if (run.data.error) {
        const details = run.data.error.details?.[0];
        const message =
          details?.errorMessage ??
          run.data.error.message ??
          "Apps Script error during copySlidesInto";
        throw new Error(message);
      }
    } catch (err: any) {
      const apiMessage = err?.message ?? "Apps Script API error";
      throw new Error(
        `${apiMessage}\nCheck:\n- APPS_SCRIPT_ID is correct\n- The Apps Script project is owned by (or shared with) the origin account\n- The origin account has editor access to the Ocado folder (so it can edit the destination file)`
      );
    }
  } else if (type === "document") {
    if (!APPS_SCRIPT_ID) {
      throw new Error("Set APPS_SCRIPT_ID in .env to enable Docs copy.");
    }

    const create = await destDrive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.document",
        parents: [FOLDER_OCADO],
      },
      fields: "id",
      supportsAllDrives: true,
    });

    destFileId = create.data.id ?? undefined;
    if (!destFileId) {
      throw new Error("Failed to create destination document.");
    }

    const script = google.script({ version: "v1", auth: originAuth });
    try {
      const run = await script.scripts.run({
        scriptId: APPS_SCRIPT_ID,
        requestBody: {
          function: "copyDocInto",
          parameters: [fileId, destFileId],
          devMode: APPS_SCRIPT_DEV_MODE,
        },
      });

      if (run.data.error) {
        const details = run.data.error.details?.[0];
        const message =
          details?.errorMessage ??
          run.data.error.message ??
          "Apps Script error during copyDocInto";
        throw new Error(message);
      }
    } catch (err: any) {
      const apiMessage = err?.message ?? "Apps Script API error";
      throw new Error(
        `${apiMessage}\nCheck:\n- APPS_SCRIPT_ID is correct\n- The Apps Script project is owned by (or shared with) the origin account\n- The origin account has editor access to the Ocado folder (so it can edit the destination file)`
      );
    }
  } else {
    if (!DESTINATION_EMAIL) {
      throw new Error("Set DESTINATION_EMAIL in .env to allow copy into destination.");
    }

    await originDrive.permissions.create({
      fileId,
      requestBody: {
        type: "user",
        role: "reader",
        emailAddress: DESTINATION_EMAIL,
      },
      sendNotificationEmail: false,
      supportsAllDrives: true,
    });

    const copy = await destDrive.files.copy({
      fileId,
      requestBody: {
        name,
        parents: [FOLDER_OCADO],
      },
      fields: "id,name",
      supportsAllDrives: true,
    });

    destFileId = copy.data.id ?? undefined;
  }

  if (!destFileId) {
    throw new Error("Failed to create destination file.");
  }

  await destDrive.files.update({
    fileId: destFileId,
    addParents: FOLDER_OCADO_BACKUP,
    removeParents: FOLDER_OCADO,
    fields: "id,parents",
    supportsAllDrives: true,
  });

  console.log(`Destination file created and moved: ${destFileId}`);
  return destFileId;
}
