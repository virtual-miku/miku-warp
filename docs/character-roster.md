# Character Roster (Import from HoYoLAB)

## Data Source

HoYoLAB Battle Chronicle endpoint `avatar/info` requires authentication
(cookie + DS signature) and cannot be called directly by the app. Instead,
the user pastes the JSON response copied from their browser DevTools.

## User Flow

1. Open HoYoLAB → Battle Chronicle for Honkai: Star Rail.
2. Open DevTools (F12) → Network tab.
3. Type `avatar` in the filter box, select `Fetch/XHR`.
4. Right-click the `avatar/info` request → Copy → Copy response.
5. Paste the JSON into the app and click Import.

The JSON is validated (`retcode == 0`), the roster is stored per account in
the `character_rosters` table, and rendered as a HoYoLAB-style card grid
(level, eidolon, element, equipped light cone) with an element filter.

## Image Caching

During import, remote portrait / light cone images are downloaded into
`{app_data}/roster-images/{account_id}/` and the stored payload is rewritten
to reference the local files. Images that already exist on disk are left
untouched, so repeated imports never re-download. The frontend renders local
paths via `convertFileSrc` (requires the `assetProtocol` scope in
`tauri.conf.json`).

## Backup

`character_rosters` is included in backup snapshots (field
`characterRosters`), so a restore brings the roster back without re-importing
JSON. Old snapshots without the field remain valid (`#[serde(default)]`).

## Key Files

- `src-tauri/src/roster.rs` — `parse_roster_payload` (HoYoLAB `avatar/info`
  shape → `RosterCharacter`), `cache_roster_images` (parallel download to
  local cache).
- `src-tauri/src/database.rs` — `character_rosters` table (migration
  `0011_character_rosters.sql`), save/load, backup read/restore functions.
- `src-tauri/src/lib.rs` — Tauri commands `import_character_roster` and
  `get_character_roster` (both run in `spawn_blocking`).
- `src/features/persistence/data/character-roster.ts` — frontend wrappers.
- `src/features/characters/components/CharacterRosterPanel.tsx` — import form
  + HoYoLAB-style roster grid UI.
- `src-tauri/tauri.conf.json` — `assetProtocol` scope for local images.

## Notes

- No HoYoLAB credentials are stored by the app.
- `avatar_list[].rank` = eidolon; `equip.rank` = light cone superimpose.
- `avatar_list[].image` is preferred for the portrait; falls back to `icon`.
- Backup result objects expose `characterRosters` (count) alongside the
  other snapshot counts.
- Element icons come from `Mar-7th/StarRailRes` `icon/element` and are synced
  into `public/icon/element` by `npm run assets:update`. If HoYoLAB ever adds
  a new element, re-run that script.
- Path icons come from `icon/path`; the avatar id → path mapping is generated
  into `src/features/warp-history/data/generated/star-rail-character-meta.json`
  from `index_new/en/characters.json` + `paths.json`. Re-run
  `npm run assets:update` after game updates.
- Eidolon badges render as `E{n}` and light cone superimpose as `S{n}`; both
  show their full label on hover (tooltip).

---

Last updated: 2026-07-26
