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
Client ID with application type **Desktop app**. Do not use a Web application
client, because Google's token endpoint will require a client secret for that
client type.

For local development:

```powershell
$env:MIKU_WARP_GOOGLE_CLIENT_ID="your-desktop-client-id.apps.googleusercontent.com"
npm run desktop
```

For release builds, set the same environment variable before building so the
Client ID is bundled into the desktop app:

```powershell
$env:MIKU_WARP_GOOGLE_CLIENT_ID="your-desktop-client-id.apps.googleusercontent.com"
npm run desktop:build
```

## Structure

- `src/app`: app shell and composition.
- `src/features`: feature-driven modules.
- `src/shared`: shared UI and utilities.
- `src-tauri`: Tauri desktop shell.
