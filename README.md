# Miku Warp

Desktop UI for the Honkai: Star Rail warp tracker.

## Scripts

- `npm run dev`: run the Vite web UI.
- `npm run build`: type-check and build the web UI.
- `npm run catalog:update`: refresh generated item catalog from [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes).
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

## Structure

- `src/app`: app shell and composition.
- `src/features`: feature-driven modules.
- `src/shared`: shared UI and utilities.
- `src-tauri`: Tauri desktop shell.
