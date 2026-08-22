use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const ROSTER_IMAGE_TIMEOUT_SECS: u64 = 15;
const MAX_ROSTER_IMAGE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCharacterRosterInput {
    pub account_id: String,
    pub payload: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCharacterRosterInput {
    pub account_id: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RosterLightCone {
    pub name: String,
    pub rarity: u32,
    pub level: u32,
    pub superimpose: u32,
    pub icon: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RosterCharacter {
    pub id: u32,
    pub name: String,
    pub rarity: u32,
    pub level: u32,
    pub eidolon: u32,
    pub element: String,
    pub portrait: String,
    pub light_cone: Option<RosterLightCone>,
}

// --- HoYoLAB Battle Chronicle avatar/info response shape ---

#[derive(Debug, Deserialize)]
struct HoyolabAvatarResponse {
    #[serde(default)]
    retcode: i64,
    #[serde(default)]
    message: String,
    #[serde(default)]
    data: Option<HoyolabAvatarData>,
}

#[derive(Debug, Deserialize)]
struct HoyolabAvatarData {
    #[serde(default)]
    avatar_list: Vec<HoyolabAvatar>,
}

#[derive(Debug, Deserialize)]
struct HoyolabAvatar {
    #[serde(default)]
    id: u32,
    name: String,
    #[serde(default)]
    rarity: u32,
    #[serde(default)]
    level: u32,
    #[serde(default)]
    rank: u32,
    #[serde(default)]
    element: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    image: String,
    #[serde(default)]
    equip: Option<HoyolabEquip>,
}

#[derive(Debug, Deserialize)]
struct HoyolabEquip {
    name: String,
    #[serde(default)]
    rarity: u32,
    #[serde(default)]
    level: u32,
    #[serde(default)]
    rank: u32,
    #[serde(default)]
    icon: String,
}

pub fn parse_roster_payload(payload: &str) -> Result<Vec<RosterCharacter>, String> {
    let response: HoyolabAvatarResponse = serde_json::from_str(payload)
        .map_err(|error| format!("Failed to parse character roster JSON: {error}"))?;

    if response.retcode != 0 {
        let message = if response.message.trim().is_empty() {
            format!("retcode {}", response.retcode)
        } else {
            response.message
        };
        return Err(format!("HoYoLAB rejected the request: {message}"));
    }

    let avatar_list = response
        .data
        .map(|data| data.avatar_list)
        .unwrap_or_default();

    Ok(avatar_list
        .into_iter()
        .map(|avatar| RosterCharacter {
            id: avatar.id,
            name: avatar.name,
            rarity: avatar.rarity,
            level: avatar.level,
            eidolon: avatar.rank,
            element: avatar.element,
            portrait: if avatar.image.is_empty() {
                avatar.icon
            } else {
                avatar.image
            },
            light_cone: avatar.equip.map(|equip| RosterLightCone {
                name: equip.name,
                rarity: equip.rarity,
                level: equip.level,
                superimpose: equip.rank,
                icon: equip.icon,
            }),
        })
        .collect())
}

/// Downloads the remote portrait / light cone images into the app data
/// folder and rewrites the character image fields to local file paths.
/// Images that are already cached are left untouched (preserved).
pub fn cache_roster_images(
    app: &tauri::AppHandle,
    account_id: &str,
    characters: Vec<RosterCharacter>,
) -> Result<Vec<RosterCharacter>, String> {
    let cache_dir = resolve_roster_image_directory(app, account_id)?;

    let mut caches = Vec::new();
    for character in &characters {
        if !character.portrait.is_empty() && looks_remote(&character.portrait) {
            caches.push((
                format!("avatar-{}.png", character.id),
                character.portrait.clone(),
            ));
        }
        if let Some(cone) = character
            .light_cone
            .as_ref()
            .filter(|cone| !cone.icon.is_empty() && looks_remote(&cone.icon))
        {
            caches.push((format!("lc-{}.png", character.id), cone.icon.clone()));
        }
    }

    let results = download_images_in_parallel(&cache_dir, caches)?;

    Ok(characters
        .into_iter()
        .map(|mut character| {
            if let Some(local) = results.get(&format!("avatar-{}.png", character.id)) {
                character.portrait = local.clone();
            }
            if let Some(cone) = character.light_cone.as_mut() {
                if let Some(local) = results.get(&format!("lc-{}.png", character.id)) {
                    cone.icon = local.clone();
                }
            }
            character
        })
        .collect())
}

fn resolve_roster_image_directory(
    app: &tauri::AppHandle,
    account_id: &str,
) -> Result<PathBuf, String> {
    use tauri::Manager;

    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("roster-images")
        .join(sanitize_segment(account_id));
    fs::create_dir_all(&base)
        .map_err(|error| format!("Failed to create roster image directory: {error}"))?;
    Ok(base)
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn looks_remote(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

fn download_images_in_parallel(
    cache_dir: &Path,
    entries: Vec<(String, String)>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let results = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for (file_name, url) in entries {
            handles.push(scope.spawn(move || {
                let local_path = cache_dir.join(&file_name);
                if local_path.exists() {
                    return Some((file_name, local_path.to_string_lossy().to_string()));
                }
                match download_image(&url) {
                    Ok(bytes) => {
                        let _ = fs::write(&local_path, &bytes);
                        Some((file_name, local_path.to_string_lossy().to_string()))
                    }
                    Err(_) => None,
                }
            }));
        }
        let mut results = std::collections::HashMap::new();
        for handle in handles {
            if let Some((file_name, path)) = handle.join().ok().flatten() {
                results.insert(file_name, path);
            }
        }
        results
    });

    Ok(results)
}

fn download_image(url: &str) -> Result<Vec<u8>, String> {
    let response = ureq::get(url)
        .set("Accept", "image/*")
        .timeout(std::time::Duration::from_secs(ROSTER_IMAGE_TIMEOUT_SECS))
        .call()
        .map_err(|error| format!("Failed to download roster image: {error}"))?;

    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_ROSTER_IMAGE_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read roster image: {error}"))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> &'static str {
        r#"{"retcode":0,"message":"OK","data":{"avatar_list":[
          {"id":1306,"level":80,"name":"Sparkle","element":"quantum","icon":"https://cdn/icon.png","rarity":5,"rank":6,"image":"https://cdn/image.png","equip":{"id":23021,"level":80,"rank":1,"name":"Earthly Escapade","rarity":5,"icon":"https://cdn/lc.png"}},
          {"id":1001,"level":70,"name":"March 7th","element":"ice","icon":"https://cdn/icon2.png","rarity":4,"rank":2,"image":"https://cdn/image2.png"}
        ]}}"#
    }

    #[test]
    fn parses_avatar_list_with_light_cones() {
        let characters = parse_roster_payload(sample_payload()).expect("payload parses");

        assert_eq!(characters.len(), 2);
        let first = &characters[0];
        assert_eq!(first.id, 1306);
        assert_eq!(first.name, "Sparkle");
        assert_eq!(first.rarity, 5);
        assert_eq!(first.level, 80);
        assert_eq!(first.eidolon, 6);
        assert_eq!(first.element, "quantum");
        assert_eq!(first.portrait, "https://cdn/image.png");

        let cone = first.light_cone.as_ref().expect("light cone");
        assert_eq!(cone.name, "Earthly Escapade");
        assert_eq!(cone.level, 80);
        assert_eq!(cone.superimpose, 1);
        assert_eq!(cone.rarity, 5);

        let second = &characters[1];
        assert_eq!(second.name, "March 7th");
        assert_eq!(second.eidolon, 2);
        assert!(second.light_cone.is_none());
    }

    #[test]
    fn falls_back_to_icon_when_image_is_missing() {
        let payload = r#"{"retcode":0,"message":"OK","data":{"avatar_list":[
          {"id":1001,"level":70,"name":"March 7th","element":"ice","icon":"https://cdn/icon.png","rarity":4,"rank":0}
        ]}}"#;
        let characters = parse_roster_payload(payload).expect("payload parses");

        assert_eq!(characters[0].portrait, "https://cdn/icon.png");
        assert_eq!(characters[0].eidolon, 0);
    }

    #[test]
    fn rejects_non_zero_retcode() {
        let payload = r#"{"retcode":-10001,"message":"invalid request","data":null}"#;
        let error = parse_roster_payload(payload).expect_err("rejected");
        assert!(error.contains("invalid request"));
    }

    #[test]
    fn rejects_invalid_json() {
        let error = parse_roster_payload("not json").expect_err("rejected");
        assert!(error.contains("Failed to parse"));
    }
}
