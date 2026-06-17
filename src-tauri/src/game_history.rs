use serde::Serialize;
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
};

const HISTORY_URL_MARKER: &str = "getGachaLog";
const AUTHKEY_MARKER: &str = "authkey=";
const CACHE_FILE_NAME: &str = "data_2";
const MAX_CACHE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 8;
const MAX_CACHE_FILES: usize = 24;

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

pub fn scan_game_history_source() -> GameHistorySourceScanResult {
    scan_game_history_source_from_roots(candidate_game_roots())
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
}
