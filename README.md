# Miku Warp

Desktop UI for the Honkai: Star Rail warp tracker.

## Scripts

- `npm run assets:update`: refresh local item and account avatar assets from [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes).
- `npm run catalog:update`: refresh generated item catalog from [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes).
- `npm run lint`: run ESLint.
- `npm run test`: run the frontend test suite.
- `npm run preview`: preview the Vite UI bundle locally.
- `npm run tauri`: run the Tauri CLI.
- `npm run desktop`: run the Tauri desktop app.
- `npm run desktop:build`: build the desktop app.

## Structure

- `src/app`: app shell and composition.
- `src/features`: feature-driven modules.
- `src/shared`: shared UI and utilities.
- `src-tauri`: Tauri desktop shell.
