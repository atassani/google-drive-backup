# Google Drive Backup CLI (Scaffold)

Local CLI scaffolding that authenticates two Google Drive accounts (origin + destination) and can print basic metadata for a file in the origin account.

## Setup

1. Create an OAuth Client (Desktop app) in Google Cloud Console.
2. Download the OAuth client JSON.
3. Put it at `./credentials.json` or set `GOOGLE_OAUTH_CREDENTIALS` in `.env`.
4. Install dependencies:

```bash
npm install
```

## Authenticate

```bash
npm run dev -- auth origin
npm run dev -- auth destination
```

Tokens are stored in `./tokens/origin.json` and `./tokens/destination.json`.

## Print File Info (origin account)

```bash
npm run dev -- info <fileId|url>
```

Example:

```bash
npm run dev -- info https://docs.google.com/presentation/d/1FA_PMVPDjjI7qNkWoXqGFD6IleYV_U-4DxRPVwgG-3U/edit
```

## Notes

- Scope is full Drive access (`drive`). If you previously authenticated, delete the tokens in `./tokens/` and re-auth.
- Backup command:

```bash
npm run dev -- backup <fileId|url>
```

This preserves native Google formats. For Slides, it uses an Apps Script function to copy slides into a new presentation (the file is created by Destination in the shared Ocado folder, then Origin runs the script). For Docs/Sheets it copies the file directly. Set `APPS_SCRIPT_ID` in `.env`. `DESTINATION_EMAIL` is only required for Docs/Sheets.

## Apps Script setup (Slides only)

1. Create a new Apps Script project (standalone).
2. Replace the script with `/Users/toni.tassani/code/google-drive-backup/apps-script/Code.gs`.
3. Add the manifest from `/Users/toni.tassani/code/google-drive-backup/apps-script/appsscript.json`.
4. Deploy as API executable and copy the Script ID.
5. Enable the Apps Script API in your Cloud project if prompted.

Then set `APPS_SCRIPT_ID` in `.env`. The Apps Script project should be owned by (or shared with) the origin account since the script is executed with origin OAuth.
- Supports shared drives via `supportsAllDrives: true`.
