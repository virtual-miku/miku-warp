# Miku Warp

Desktop UI for the Honkai: Star Rail warp tracker.

## Scripts

- `npm run dev`: run the Vite web UI.
- `npm run build`: type-check and build the web UI.
- `npm run catalog:update`: refresh generated item catalog from StarRailRes.
- `npm run lint`: run ESLint.
- `npm run desktop`: run the Tauri desktop app.
- `npm run desktop:build`: build the desktop app.

## Google Drive backup

Miku Warp uses Google Drive's app data folder for cloud backup. Create an OAuth
Client ID with application type **Desktop app**. Google may also show a Client
Secret for that desktop client. If Google requires it during token exchange, set
the Client Secret alongside the Client ID for local development.

For local development, provide the OAuth credentials only to the process that
runs the desktop app:

```powershell
$env:MIKU_WARP_GOOGLE_CLIENT_ID="your-desktop-client-id.apps.googleusercontent.com"
$env:MIKU_WARP_GOOGLE_CLIENT_SECRET="your-desktop-client-secret"
npm run desktop
```

These variables are runtime-only. Neither `npm run build` nor
`npm run desktop:build` embeds their values, even when the variables are still
set in the current PowerShell session. You can build from the same terminal
without clearing them:

```powershell
npm run desktop:build
```

The resulting public package has Google Drive disabled until a release-safe
OAuth configuration is implemented. If a distributed Google OAuth client
requires a Client Secret, use a backend OAuth broker instead of relying on
environment variables or embedding the value in the desktop binary.

## Structure

- `src/app`: app shell and composition.
- `src/features`: feature-driven modules.
- `src/shared`: shared UI and utilities.
- `src-tauri`: Tauri desktop shell.
