<div align="center">

# Miku Warp

<p>Honkai: Star Rail Warp Tracker.</p>

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-B7410E?style=for-the-badge&logo=rust&logoColor=black)](https://www.rust-lang.org)
[![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)](https://eslint.org)

</div>

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
