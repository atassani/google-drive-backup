# Google Drive Backup CLI

Local CLI that authenticates two Google Drive accounts (origin + destination) and backs up Drive files/folders between them.

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

Account mapping:
- `origin`: account that owns/can open the source file in Drive (for example: `toni.tassani@ocado.com`).
- `destination`: account that should receive the backup copy (for example: `atassani@gmail.com`).

Quick verification:

```bash
npm run dev -- whoami origin
npm run dev -- whoami destination
```

## Print Item Info (origin account)

```bash
npm run dev -- info <itemId|url>
```

Example:

```bash
npm run dev -- info https://docs.google.com/presentation/d/1FA_PMVPDjjI7qNkWoXqGFD6IleYV_U-4DxRPVwgG-3U/edit
```

## Notes

- Scope is full Drive access (`drive`). If you previously authenticated, delete the tokens in `./tokens/` and re-auth.
- Backup command:

```bash
npm run dev -- backup <itemId|url>
```

This preserves native Google formats and supports recursive folder backups. For Slides, Docs, and Sheets, it uses Apps Script functions to copy content into a new file (created by Destination in the shared Ocado folder, then Origin runs the script). For non-Google files, it downloads from Origin and uploads to Destination; resumable uploads are used above `BINARY_RESUMABLE_THRESHOLD_MB`. Set `APPS_SCRIPT_ID` in `.env`.

## Chrome Extension + Local Bridge

This lets you select files/folders in the Drive list (without opening them) and click the extension button to trigger backup.

1. Start the bridge:

```bash
npm run bridge
```

2. Load the extension in Chrome:
   - Go to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select `/Users/toni.tassani/code/google-drive-backup/extension`

3. In Google Drive, select one or more files/folders in the list and click the extension icon (or right-click → “Backup selected in Drive”).

Optional security: set `BRIDGE_TOKEN` in `.env`, and then in the extension background you can store it via DevTools:

```js
chrome.storage.local.set({ bridgeToken: "YOUR_TOKEN" })
```

## Apps Script setup (Slides, Docs, Sheets)

1. Create a new Apps Script project (standalone).
2. Replace the script with `/Users/toni.tassani/code/google-drive-backup/apps-script/Code.gs`.
3. Add the manifest from `/Users/toni.tassani/code/google-drive-backup/apps-script/appsscript.json`.
4. Deploy as API executable and copy the Script ID.
5. Enable the Apps Script API in your Cloud project if prompted.

Then set `APPS_SCRIPT_ID` in `.env`. The Apps Script project should be owned by (or shared with) the origin account since the script is executed with origin OAuth.
- Supports shared drives via `supportsAllDrives: true`.

## Troubleshooting `invalid_grant`

If the extension shows an error like `<file name> ✕ invalid_grant`, one OAuth token is stale/revoked.

1. Check which account is broken:

```bash
npm run dev -- whoami origin
npm run dev -- whoami destination
```

2. Re-auth only the failing account (example for destination):

```bash
rm ./tokens/destination.json
npm run dev -- auth destination
```

3. Confirm it works:

```bash
npm run dev -- whoami destination
```

4. Restart the bridge:

```bash
npm run bridge
```

If re-auth still returns `invalid_grant`, verify `credentials.json` is the expected OAuth client and remove old app access from the failing Google account, then run `auth` again.
