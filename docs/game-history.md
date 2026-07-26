# Game History Integration Notes

## Gacha Type Mapping

| gacha_type | banner_type             | API Endpoint      |
|------------|-------------------------|-------------------|
| 1          | standard                | `getGachaLog`     |
| 2          | departure               | `getGachaLog`     |
| 11         | character_event         | `getGachaLog`     |
| 12         | light_cone_event        | `getGachaLog`     |
| 21         | collaboration_character | `getLdGachaLog`   |
| 22         | collaboration_light_cone| `getLdGachaLog`   |
| 31         | collaboration_character | `getLdGachaLog`   |
| 32         | collaboration_light_cone| `getLdGachaLog`   |

### Key Files

- **Gacha type mapping & fetch logic:** `src-tauri/src/game_history.rs`
  - `GAME_HISTORY_GACHA_TYPES` — maps gacha_type → banner_type
  - `fetch_game_history` — fetches all banner types in sequence
  - `build_gacha_log_url` — uses `getLdGachaLog` for collab gacha types (21/22/31/32)

- **Cache scanning:** `src-tauri/src/game_history.rs`
  - `extract_history_url` — searches for both `getGachaLog` and `getLdGachaLog` markers
  - `HISTORY_URL_MARKER` — `"getGachaLog"`
  - `HISTORY_COLLAB_URL_MARKER` — `"getLdGachaLog"`

### Rate Limiting

- Interval antar halaman: 1500ms (`GAME_HISTORY_REQUEST_INTERVAL_MS`)
- Jeda antar banner type: 5000ms (`GAME_HISTORY_RATE_LIMIT_RETRY_MS`)
- Retry otomatis 3x dengan backoff progresif jika kena "visit too frequently"

### Adding Support for New Gacha Types

1. Add new entries to `GAME_HISTORY_GACHA_TYPES` array in `src-tauri/src/game_history.rs`
2. If it's a collaboration banner, add the gacha_type to the `is_collab` check in `build_gacha_log_url`
3. No database migration needed if reusing existing `banner_type` values
4. Rebuild with `cargo build`

### External Reference

- Upstream repo: https://github.com/Trinovantes/StarRail-Warp-Tracker
- Collab banners use `getLdGachaLog` instead of `getGachaLog` (see `fetchWarpHistory.ts` in upstream)
- Auth key expires when `retcode == -101` or message contains "authkey timeout"

---

Last updated: 2026-07-26
