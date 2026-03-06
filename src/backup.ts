import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { authorize } from "./auth.js";

const FOLDER_OCADO = "1wmjCSz-LrBzz1eBtsh4wfF_CYDxUNPuR";
const FOLDER_OCADO_BACKUP = "1H_z40P8H-aSIEIy-idSkqWyVtY69T8Ya";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

const APPS_SCRIPT_ID = process.env.APPS_SCRIPT_ID?.trim();
const APPS_SCRIPT_DEV_MODE =
  process.env.APPS_SCRIPT_DEV_MODE?.toLowerCase() === "true" ||
  process.env.APPS_SCRIPT_DEV_MODE === "1";
const BINARY_RESUMABLE_THRESHOLD_MB = Number(
  process.env.BINARY_RESUMABLE_THRESHOLD_MB ?? 10
);

type SupportedType = "document" | "slides" | "spreadsheet";

type BackupContext = {
  originAuth: any;
  originDrive: ReturnType<typeof google.drive>;
  destDrive: ReturnType<typeof google.drive>;
};

function getTypeFromMime(mimeType?: string): SupportedType {
  switch (mimeType) {
    case "application/vnd.google-apps.document":
      return "document";
    case "application/vnd.google-apps.presentation":
      return "slides";
    case "application/vnd.google-apps.spreadsheet":
      return "spreadsheet";
    case undefined:
    case null:
      break;
    default:
      throw new Error(`Unsupported file type: ${mimeType ?? "unknown"}`);
  }
  throw new Error(`Unsupported file type: ${mimeType ?? "unknown"}`);
}

function fileName(file: drive_v3.Schema$File) {
  return file.name ?? "(unnamed)";
}

function fileMime(file: drive_v3.Schema$File) {
  return file.mimeType ?? undefined;
}

async function createBackupContext(): Promise<BackupContext> {
  const originAuth = await authorize("origin");
  const destAuth = await authorize("destination");

  return {
    originAuth,
    originDrive: google.drive({ version: "v3", auth: originAuth }),
    destDrive: google.drive({ version: "v3", auth: destAuth }),
  };
}

async function runAppsScriptCopy(
  originAuth: BackupContext["originAuth"],
  functionName: "copySlidesInto" | "copyDocInto" | "copySheetsInto",
  sourceFileId: string,
  destinationFileId: string
) {
  if (!APPS_SCRIPT_ID) {
    throw new Error("Set APPS_SCRIPT_ID in .env to enable Google file copy.");
  }

  const script = google.script({ version: "v1", auth: originAuth });
  try {
    const run = await script.scripts.run({
      scriptId: APPS_SCRIPT_ID,
      requestBody: {
        function: functionName,
        parameters: [sourceFileId, destinationFileId],
        devMode: APPS_SCRIPT_DEV_MODE,
      },
    });

    if (run.data.error) {
      const details = run.data.error.details?.[0];
      const message =
        details?.errorMessage ??
        run.data.error.message ??
        `Apps Script error during ${functionName}`;
      throw new Error(message);
    }
  } catch (err: any) {
    const apiMessage = err?.message ?? "Apps Script API error";
    throw new Error(
      `${apiMessage}\nCheck:\n- APPS_SCRIPT_ID is correct\n- The Apps Script project is owned by (or shared with) the origin account\n- The origin account has editor access to the Ocado folder (so it can edit destination files staged there)`
    );
  }
}

async function moveFromStaging(
  destDrive: BackupContext["destDrive"],
  destFileId: string,
  targetParentId: string
) {
  await destDrive.files.update({
    fileId: destFileId,
    addParents: targetParentId,
    removeParents: FOLDER_OCADO,
    fields: "id,parents",
    supportsAllDrives: true,
  });
}

async function backupSingleFileByMetadata(
  ctx: BackupContext,
  originFile: drive_v3.Schema$File,
  targetParentId: string,
  depth: number
): Promise<string> {
  const fileId = originFile.id ?? undefined;
  if (!fileId) {
    throw new Error("Source file id is missing.");
  }

  const name = fileName(originFile);
  const mimeType = fileMime(originFile);
  const sizeBytes = originFile.size ? Number(originFile.size) : 0;

  if (mimeType === DRIVE_SHORTCUT_MIME) {
    throw new Error(`Shortcuts are not supported yet: ${name}`);
  }

  let type: SupportedType | "binary";
  try {
    type = getTypeFromMime(mimeType);
  } catch {
    type = "binary";
  }

  const indent = "  ".repeat(depth);
  console.log(
    `${indent}File: ${name} (${type}${mimeType ? `, ${mimeType}` : ""})`
  );

  let destFileId: string | undefined;

  if (type === "slides") {
    const create = await ctx.destDrive.files.create({
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

    await runAppsScriptCopy(ctx.originAuth, "copySlidesInto", fileId, destFileId);
  } else if (type === "document") {
    const create = await ctx.destDrive.files.create({
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

    await runAppsScriptCopy(ctx.originAuth, "copyDocInto", fileId, destFileId);
  } else if (type === "spreadsheet") {
    const create = await ctx.destDrive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [FOLDER_OCADO],
      },
      fields: "id",
      supportsAllDrives: true,
    });

    destFileId = create.data.id ?? undefined;
    if (!destFileId) {
      throw new Error("Failed to create destination spreadsheet.");
    }

    await runAppsScriptCopy(ctx.originAuth, "copySheetsInto", fileId, destFileId);
  } else {
    const thresholdBytes = BINARY_RESUMABLE_THRESHOLD_MB * 1024 * 1024;
    const useResumable = !sizeBytes || sizeBytes > thresholdBytes;

    if (useResumable) {
      const media = await ctx.originDrive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "stream" }
      );

      const upload = await ctx.destDrive.files.create({
        uploadType: "resumable",
        requestBody: {
          name,
          parents: [FOLDER_OCADO],
        },
        media: {
          mimeType: mimeType || "application/octet-stream",
          body: media.data as any,
        },
        fields: "id,name",
        supportsAllDrives: true,
      });

      destFileId = upload.data.id ?? undefined;
    } else {
      const media = await ctx.originDrive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );

      const upload = await ctx.destDrive.files.create({
        requestBody: {
          name,
          parents: [FOLDER_OCADO],
        },
        media: {
          mimeType: mimeType || "application/octet-stream",
          body: Readable.from(Buffer.from(media.data as ArrayBuffer)),
        },
        fields: "id,name",
        supportsAllDrives: true,
      });

      destFileId = upload.data.id ?? undefined;
    }
  }

  if (!destFileId) {
    throw new Error(`Failed to create destination file: ${name}`);
  }

  await moveFromStaging(ctx.destDrive, destFileId, targetParentId);
  console.log(`${indent}Backed up file: ${name} -> ${destFileId}`);
  return destFileId;
}

async function backupFolderByMetadata(
  ctx: BackupContext,
  originFolder: drive_v3.Schema$File,
  targetParentId: string,
  depth: number
): Promise<string> {
  const folderId = originFolder.id ?? undefined;
  if (!folderId) {
    throw new Error("Source folder id is missing.");
  }

  const name = fileName(originFolder);
  const indent = "  ".repeat(depth);
  console.log(`${indent}Folder: ${name}`);

  const created = await ctx.destDrive.files.create({
    requestBody: {
      name,
      mimeType: DRIVE_FOLDER_MIME,
      parents: [targetParentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const destFolderId = created.data.id ?? undefined;
  if (!destFolderId) {
    throw new Error(`Failed to create destination folder: ${name}`);
  }

  let pageToken: string | undefined;
  do {
    const list = await ctx.originDrive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageToken,
      pageSize: 1000,
      orderBy: "folder,name_natural",
    });

    for (const child of list.data.files ?? []) {
      await backupNodeByMetadata(ctx, child, destFolderId, depth + 1);
    }

    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);

  console.log(`${indent}Backed up folder: ${name} -> ${destFolderId}`);
  return destFolderId;
}

async function backupNodeByMetadata(
  ctx: BackupContext,
  originItem: drive_v3.Schema$File,
  targetParentId: string,
  depth: number
): Promise<string> {
  const mimeType = fileMime(originItem);
  if (mimeType === DRIVE_FOLDER_MIME) {
    return backupFolderByMetadata(ctx, originItem, targetParentId, depth);
  }
  return backupSingleFileByMetadata(ctx, originItem, targetParentId, depth);
}

export async function backupFile(fileId: string): Promise<string> {
  const ctx = await createBackupContext();
  const root = await ctx.originDrive.files.get({
    fileId,
    fields: "id,name,mimeType,size",
    supportsAllDrives: true,
  });

  const originItem = root.data;
  const rootName = fileName(originItem);
  const rootMime = fileMime(originItem);
  console.log(`\nStarting backup: ${rootName}${rootMime ? ` (${rootMime})` : ""}`);

  const destId = await backupNodeByMetadata(ctx, originItem, FOLDER_OCADO_BACKUP, 0);
  console.log(`Backup complete: ${destId}`);
  return destId;
}
