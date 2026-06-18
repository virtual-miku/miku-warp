use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

const HISTORY_URL_MARKER: &str = "getGachaLog";
const AUTHKEY_MARKER: &str = "authkey=";
const CACHE_FILE_NAME: &str = "data_2";
const MAX_CACHE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 8;
const MAX_CACHE_FILES: usize = 24;
const DEFAULT_MAX_PAGES_PER_BANNER: usize = 50;
const MAX_PAGES_PER_BANNER: usize = 200;
const GAME_HISTORY_PAGE_SIZE: usize = 20;
const GAME_HISTORY_REQUEST_INTERVAL_MS: u64 = 500;
const GAME_HISTORY_GACHA_TYPES: [(&str, &str); 6] = [
    ("2", "departure"),
    ("1", "standard"),
    ("11", "character_event"),
    ("12", "light_cone_event"),
    ("21", "collaboration_character"),
    ("22", "collaboration_light_cone"),
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportGameHistoryInput {
    pub account: GameHistoryAccountInput,
    pub max_pages_per_banner: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameHistoryAccountInput {
    pub id: String,
    pub uid: String,
    pub region: Option<String>,
    pub nickname: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportGameHistoryResult {
    pub account_id: String,
    pub uid: String,
    pub import_batch_id: String,
    pub records_found: usize,
    pub records_inserted: usize,
    pub records_skipped: usize,
    pub duplicate_records: usize,
    pub banner_count: usize,
    pub pages_fetched: usize,
    pub source_cache_path: String,
    pub endpoint_host: Option<String>,
    pub detected_uid: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GameHistorySourceScanStatus {
    Found,
    NeedsHistoryOpened,
    NotFound,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameHistorySourceScanResult {
    pub status: GameHistorySourceScanStatus,
    pub cache_files_checked: usize,
    pub candidate_roots: Vec<String>,
    pub matched_cache_path: Option<String>,
    pub url_preview: Option<String>,
    pub endpoint_host: Option<String>,
    pub detail: String,
}

#[derive(Debug)]
pub struct GameHistorySource {
    pub cache_path: String,
    pub history_url: String,
    pub endpoint_host: Option<String>,
}

#[derive(Debug)]
pub struct FetchedGameHistory {
    pub cache_path: String,
    pub endpoint_host: Option<String>,
    pub pages_fetched: usize,
    pub records_found: usize,
    pub detected_uid: Option<String>,
    pub pulls: Vec<GameHistoryPull>,
}

#[derive(Debug, Clone)]
pub struct GameHistoryPull {
    pub banner_type: String,
    pub item_source_id: Option<String>,
    pub gacha_id: String,
    pub pulled_at: String,
    pub pulled_at_timezone: Option<String>,
    pub sequence_in_timestamp_group: i64,
    pub raw_item_name: String,
}

#[derive(Debug, Deserialize)]
struct GachaLogResponse {
    retcode: i64,
    message: String,
    data: Option<GachaLogData>,
}

#[derive(Debug, Deserialize)]
struct GachaLogData {
    #[serde(default)]
    list: Vec<GachaLogRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct GachaLogRecord {
    #[serde(default)]
    uid: Option<String>,
    #[serde(default)]
    gacha_type: String,
    #[serde(default)]
    item_id: Option<String>,
    #[serde(default)]
    time: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    id: String,
}

pub fn scan_game_history_source() -> GameHistorySourceScanResult {
    scan_game_history_source_from_roots(candidate_game_roots())
}

pub fn fetch_game_history_from_cache(
    max_pages_per_banner: Option<usize>,
) -> Result<FetchedGameHistory, String> {
    let source = find_game_history_source()?;
    fetch_game_history(&source, max_pages_per_banner)
}

pub fn max_pages_per_banner(input: Option<usize>) -> usize {
    input
        .unwrap_or(DEFAULT_MAX_PAGES_PER_BANNER)
        .clamp(1, MAX_PAGES_PER_BANNER)
}

fn scan_game_history_source_from_roots(
    candidate_roots: Vec<PathBuf>,
) -> GameHistorySourceScanResult {
    let candidate_root_labels = candidate_roots
        .iter()
        .map(|path| path_to_label(path))
        .collect::<Vec<_>>();
    let cache_files = find_cache_files(&candidate_roots);
    let mut cache_files_checked = 0;

    for cache_file in cache_files.iter().take(MAX_CACHE_FILES) {
        cache_files_checked += 1;

        if !is_scan_safe_cache_file(cache_file) {
            continue;
        }

        let Ok(metadata) = fs::metadata(cache_file) else {
            continue;
        };

        if metadata.len() > MAX_CACHE_BYTES {
            continue;
        }

        let Ok(bytes) = fs::read(cache_file) else {
            continue;
        };
        let text = String::from_utf8_lossy(&bytes);

        if let Some(url) = extract_history_url(&text) {
            return GameHistorySourceScanResult {
                status: GameHistorySourceScanStatus::Found,
                cache_files_checked,
                candidate_roots: candidate_root_labels,
                matched_cache_path: Some(path_to_label(cache_file)),
                url_preview: Some(redact_history_url(&url)),
                endpoint_host: extract_endpoint_host(&url),
                detail: "History source found. Next step can fetch warp pages from this source."
                    .to_string(),
            };
        }
    }

    if cache_files_checked > 0 {
        return GameHistorySourceScanResult {
            status: GameHistorySourceScanStatus::NeedsHistoryOpened,
            cache_files_checked,
            candidate_roots: candidate_root_labels,
            matched_cache_path: None,
            url_preview: None,
            endpoint_host: None,
            detail: "Cache found, but no warp history URL yet. Open Warp History in game, then scan again."
                .to_string(),
        };
    }

    GameHistorySourceScanResult {
        status: GameHistorySourceScanStatus::NotFound,
        cache_files_checked,
        candidate_roots: candidate_root_labels,
        matched_cache_path: None,
        url_preview: None,
        endpoint_host: None,
        detail:
            "Game cache was not found. Set WARP_TRACKER_HSR_GAME_PATH or GAME_PATH to your Star Rail game folder."
                .to_string(),
    }
}

fn find_game_history_source() -> Result<GameHistorySource, String> {
    let candidate_roots = candidate_game_roots();
    let cache_files = find_cache_files(&candidate_roots);

    for cache_file in cache_files.iter().take(MAX_CACHE_FILES) {
        if !is_scan_safe_cache_file(cache_file) {
            continue;
        }

        let Ok(metadata) = fs::metadata(cache_file) else {
            continue;
        };

        if metadata.len() > MAX_CACHE_BYTES {
            continue;
        }

        let Ok(bytes) = fs::read(cache_file) else {
            continue;
        };
        let text = String::from_utf8_lossy(&bytes);

        if let Some(history_url) = extract_history_url(&text) {
            return Ok(GameHistorySource {
                cache_path: path_to_label(cache_file),
                endpoint_host: extract_endpoint_host(&history_url),
                history_url,
            });
        }
    }

    if cache_files.is_empty() {
        return Err(
            "Game cache was not found. Set WARP_TRACKER_HSR_GAME_PATH or GAME_PATH to your Star Rail game folder."
                .to_string(),
        );
    }

    Err(
        "Cache found, but no warp history URL yet. Open Warp History in game, then scan again."
            .to_string(),
    )
}

fn fetch_game_history(
    source: &GameHistorySource,
    max_pages_per_banner_input: Option<usize>,
) -> Result<FetchedGameHistory, String> {
    let max_pages_per_banner = max_pages_per_banner(max_pages_per_banner_input);
    let mut pages_fetched = 0;
    let mut records = Vec::new();

    for (gacha_type, banner_type) in GAME_HISTORY_GACHA_TYPES {
        let mut end_id: Option<String> = None;

        for _ in 0..max_pages_per_banner {
            let url = build_gacha_log_url(
                &source.history_url,
                gacha_type,
                GAME_HISTORY_PAGE_SIZE,
                end_id.as_deref(),
            )?;
            let page = fetch_gacha_log_page(&url)?;
            pages_fetched += 1;

            if page.is_empty() {
                break;
            }

            let page_len = page.len();
            end_id = page.last().map(|record| record.id.clone());
            let next_end_id_is_empty = end_id.as_deref().unwrap_or_default().is_empty();
            records.extend(
                page.into_iter()
                    .filter(|record| record.gacha_type == gacha_type)
                    .map(|record| (banner_type.to_string(), record)),
            );

            if next_end_id_is_empty || page_len < GAME_HISTORY_PAGE_SIZE {
                break;
            }

            thread::sleep(Duration::from_millis(GAME_HISTORY_REQUEST_INTERVAL_MS));
        }
    }

    let detected_uid = records
        .iter()
        .find_map(|(_, record)| record.uid.as_ref().filter(|uid| !uid.is_empty()).cloned());
    let records_found = records.len();
    let pulls = normalize_game_history_records(records)?;

    Ok(FetchedGameHistory {
        cache_path: source.cache_path.clone(),
        endpoint_host: source.endpoint_host.clone(),
        pages_fetched,
        records_found,
        detected_uid,
        pulls,
    })
}

fn fetch_gacha_log_page(url: &str) -> Result<Vec<GachaLogRecord>, String> {
    let response = ureq::get(url)
        .set("Accept", "application/json")
        .call()
        .map_err(|error| format!("Failed to fetch game history: {error}"))?;
    let payload = response
        .into_json::<GachaLogResponse>()
        .map_err(|error| format!("Failed to decode game history response: {error}"))?;

    if payload.retcode != 0 {
        return Err(format!(
            "Game history endpoint returned {}: {}",
            payload.retcode, payload.message
        ));
    }

    Ok(payload.data.map(|data| data.list).unwrap_or_default())
}

fn build_gacha_log_url(
    source_url: &str,
    gacha_type: &str,
    size: usize,
    end_id: Option<&str>,
) -> Result<String, String> {
    let mut parsed_url = url::Url::parse(source_url)
        .map_err(|error| format!("Failed to parse game history URL: {error}"))?;
    let mut query_pairs = parsed_url
        .query_pairs()
        .filter(|(key, _)| !matches!(key.as_ref(), "gacha_type" | "size" | "page" | "end_id"))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();

    query_pairs.push(("gacha_type".to_string(), gacha_type.to_string()));
    query_pairs.push(("size".to_string(), size.to_string()));

    if let Some(end_id) = end_id.filter(|value| !value.is_empty()) {
        query_pairs.push(("end_id".to_string(), end_id.to_string()));
    }

    parsed_url.query_pairs_mut().clear().extend_pairs(
        query_pairs
            .iter()
            .map(|(key, value)| (&key[..], &value[..])),
    );

    Ok(parsed_url.to_string())
}

fn normalize_game_history_records(
    mut records: Vec<(String, GachaLogRecord)>,
) -> Result<Vec<GameHistoryPull>, String> {
    records.sort_by(|(left_banner, left), (right_banner, right)| {
        normalize_game_history_time(&left.time)
            .cmp(&normalize_game_history_time(&right.time))
            .then_with(|| compare_gacha_id(&left.id, &right.id))
            .then_with(|| left_banner.cmp(right_banner))
    });

    let mut pulls = Vec::with_capacity(records.len());
    let mut current_timestamp = String::new();
    let mut current_sequence = 0;

    for (banner_type, record) in records {
        validate_game_history_record(&record)?;

        let pulled_at = normalize_game_history_time(&record.time);
        if pulled_at != current_timestamp {
            current_timestamp = pulled_at.clone();
            current_sequence = 1;
        } else {
            current_sequence += 1;
        }

        pulls.push(GameHistoryPull {
            banner_type,
            item_source_id: record.item_id.filter(|item_id| !item_id.trim().is_empty()),
            gacha_id: record.id,
            pulled_at,
            pulled_at_timezone: None,
            sequence_in_timestamp_group: current_sequence,
            raw_item_name: record.name,
        });
    }

    Ok(pulls)
}

fn validate_game_history_record(record: &GachaLogRecord) -> Result<(), String> {
    if record.id.trim().is_empty() {
        return Err(format!(
            "Game history record for {} at {} does not include an id.",
            record.name, record.time
        ));
    }

    if record.name.trim().is_empty() {
        return Err(format!(
            "Game history record {} at {} does not include an item name.",
            record.id, record.time
        ));
    }

    if normalize_game_history_time(&record.time).is_empty() {
        return Err(format!(
            "Game history record {} has an invalid timestamp.",
            record.id
        ));
    }

    Ok(())
}

fn normalize_game_history_time(value: &str) -> String {
    let trimmed_value = value.trim();

    if trimmed_value.len() == 19 && trimmed_value.as_bytes().get(10) == Some(&b' ') {
        return format!("{}T{}", &trimmed_value[..10], &trimmed_value[11..]);
    }

    trimmed_value.to_string()
}

fn compare_gacha_id(left: &str, right: &str) -> std::cmp::Ordering {
    match (left.parse::<u128>(), right.parse::<u128>()) {
        (Ok(left), Ok(right)) => left.cmp(&right),
        _ => left.cmp(right),
    }
}

fn candidate_game_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    for key in ["WARP_TRACKER_HSR_GAME_PATH", "GAME_PATH"] {
        if let Ok(value) = env::var(key) {
            push_unique_path(&mut roots, PathBuf::from(value));
        }
    }

    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(value) = env::var(key) {
            let root = PathBuf::from(value);
            push_unique_path(&mut roots, root.join("Star Rail").join("Games"));
            push_unique_path(&mut roots, root.join("HoYoPlay").join("games"));
            push_unique_path(&mut roots, root.join("Epic Games").join("HonkaiStarRail"));
        }
    }

    roots
}

fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if candidate.as_os_str().is_empty() {
        return;
    }

    if paths.iter().any(|existing| existing == &candidate) {
        return;
    }

    paths.push(candidate);
}

fn find_cache_files(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut cache_files = Vec::new();
    let mut seen = HashSet::new();

    for root in roots {
        find_cache_files_in(root, 0, &mut cache_files, &mut seen);

        if cache_files.len() >= MAX_CACHE_FILES {
            break;
        }
    }

    cache_files
}

fn find_cache_files_in(
    path: &Path,
    depth: usize,
    cache_files: &mut Vec<PathBuf>,
    seen: &mut HashSet<String>,
) {
    if depth > MAX_SCAN_DEPTH || cache_files.len() >= MAX_CACHE_FILES {
        return;
    }

    let Ok(metadata) = fs::metadata(path) else {
        return;
    };

    if metadata.is_file() {
        if path.file_name().and_then(|value| value.to_str()) == Some(CACHE_FILE_NAME)
            && is_scan_safe_cache_file(path)
        {
            let label = path_to_label(path);
            if seen.insert(label) {
                cache_files.push(path.to_path_buf());
            }
        }

        return;
    }

    if !metadata.is_dir() {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        find_cache_files_in(&entry.path(), depth + 1, cache_files, seen);

        if cache_files.len() >= MAX_CACHE_FILES {
            break;
        }
    }
}

fn is_scan_safe_cache_file(path: &Path) -> bool {
    let parts = path
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .map(|part| part.to_ascii_lowercase())
        .collect::<Vec<_>>();

    parts.iter().any(|part| part == "starrail_data")
        && parts.iter().any(|part| part == "webcaches")
        && parts.iter().any(|part| part == "cache_data")
        && path.file_name().and_then(|value| value.to_str()) == Some(CACHE_FILE_NAME)
}

fn extract_history_url(text: &str) -> Option<String> {
    for (marker_index, _) in text.match_indices(HISTORY_URL_MARKER) {
        let Some(start) = text[..marker_index].rfind("https://") else {
            continue;
        };
        let tail = &text[start..];
        let end = tail.find(is_url_delimiter).unwrap_or(tail.len());
        let url = &tail[..end];

        if url.contains(AUTHKEY_MARKER) {
            return Some(url.to_string());
        }
    }

    None
}

fn is_url_delimiter(character: char) -> bool {
    matches!(
        character,
        '\0' | '"' | '\'' | '<' | '>' | ' ' | '\n' | '\r' | '\t'
    )
}

fn redact_history_url(url: &str) -> String {
    let Some(authkey_index) = url.find(AUTHKEY_MARKER) else {
        return url.to_string();
    };

    let value_start = authkey_index + AUTHKEY_MARKER.len();
    let suffix_start = url[value_start..]
        .find('&')
        .map(|relative_index| value_start + relative_index)
        .unwrap_or(url.len());

    format!("{}<redacted>{}", &url[..value_start], &url[suffix_start..])
}

fn extract_endpoint_host(url: &str) -> Option<String> {
    url::Url::parse(url)
        .ok()
        .and_then(|parsed_url| parsed_url.host_str().map(ToString::to_string))
}

fn path_to_label(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn extracts_and_redacts_history_url() {
        let text = "prefix https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?authkey=secret-token&lang=en-us suffix";

        let url = extract_history_url(text).expect("history url");

        assert_eq!(
            redact_history_url(&url),
            "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?authkey=<redacted>&lang=en-us"
        );
        assert_eq!(
            extract_endpoint_host(&url).as_deref(),
            Some("public-operation-hkrpg-sg.hoyoverse.com")
        );
    }

    #[test]
    fn skips_marker_without_url_and_continues_scanning() {
        let text = "getGachaLog noise https://example.test/getGachaLog?authkey=abc123&lang=en-us";

        let url = extract_history_url(text).expect("history url");

        assert_eq!(
            url,
            "https://example.test/getGachaLog?authkey=abc123&lang=en-us"
        );
    }

    #[test]
    fn builds_page_url_without_stale_pagination() {
        let url = build_gacha_log_url(
            "https://example.test/getGachaLog?authkey=abc123&gacha_type=1&page=4&size=5&lang=en-us",
            "11",
            20,
            Some("987"),
        )
        .expect("page url");

        assert_eq!(
            url,
            "https://example.test/getGachaLog?authkey=abc123&lang=en-us&gacha_type=11&size=20&end_id=987"
        );
    }

    #[test]
    fn normalizes_game_history_records_with_timestamp_sequence() {
        let pulls = normalize_game_history_records(vec![
            (
                "character_event".to_string(),
                gacha_record("1002", "1001", "Pela", "2025-07-11 11:20:01"),
            ),
            (
                "character_event".to_string(),
                gacha_record("1001", "20000", "Data Bank", "2025-07-11 11:20:01"),
            ),
            (
                "standard".to_string(),
                gacha_record("1003", "1002", "Dan Heng", "2025-07-11 11:20:25"),
            ),
        ])
        .expect("normalized records");

        assert_eq!(pulls[0].gacha_id, "1001");
        assert_eq!(pulls[0].sequence_in_timestamp_group, 1);
        assert_eq!(pulls[1].gacha_id, "1002");
        assert_eq!(pulls[1].sequence_in_timestamp_group, 2);
        assert_eq!(pulls[2].banner_type, "standard");
        assert_eq!(pulls[2].pulled_at, "2025-07-11T11:20:25");
    }

    #[test]
    fn scans_cache_file_with_history_url() {
        let root = create_temp_root("found");
        let cache_file = write_cache_file(
            &root,
            "cache https://example.test/getGachaLog?authkey=abc123&game_biz=hkrpg_global",
        );

        let result = scan_game_history_source_from_roots(vec![root.clone()]);

        assert_eq!(result.status, GameHistorySourceScanStatus::Found);
        assert_eq!(result.cache_files_checked, 1);
        assert_eq!(result.matched_cache_path, Some(path_to_label(&cache_file)));
        assert_eq!(
            result.url_preview.as_deref(),
            Some("https://example.test/getGachaLog?authkey=<redacted>&game_biz=hkrpg_global")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reports_needs_history_opened_when_cache_has_no_url() {
        let root = create_temp_root("needs-history-opened");
        write_cache_file(&root, "cache without gacha url");

        let result = scan_game_history_source_from_roots(vec![root.clone()]);

        assert_eq!(
            result.status,
            GameHistorySourceScanStatus::NeedsHistoryOpened
        );
        assert_eq!(result.cache_files_checked, 1);
        assert!(result.url_preview.is_none());

        let _ = fs::remove_dir_all(root);
    }

    fn write_cache_file(root: &Path, content: &str) -> PathBuf {
        let cache_dir = root
            .join("StarRail_Data")
            .join("webCaches")
            .join("4.3.0")
            .join("Cache")
            .join("Cache_Data");
        fs::create_dir_all(&cache_dir).expect("cache dir");

        let cache_file = cache_dir.join(CACHE_FILE_NAME);
        fs::write(&cache_file, content).expect("cache content");
        cache_file
    }

    fn create_temp_root(name: &str) -> PathBuf {
        let unique_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        env::temp_dir().join(format!("warp-tracker-{name}-{unique_id}"))
    }

    fn gacha_record(id: &str, item_id: &str, name: &str, time: &str) -> GachaLogRecord {
        GachaLogRecord {
            uid: Some("800000001".to_string()),
            gacha_type: "11".to_string(),
            item_id: Some(item_id.to_string()),
            time: time.to_string(),
            name: name.to_string(),
            id: id.to_string(),
        }
    }
}
