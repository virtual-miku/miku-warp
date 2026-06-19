use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::{Entry, Error as KeyringError};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use url::Url;

const GOOGLE_DRIVE_APP_DATA_SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const GOOGLE_OAUTH_CLIENT_ID_ENV: &str = "MIKU_WARP_GOOGLE_CLIENT_ID";
const LEGACY_GOOGLE_OAUTH_CLIENT_ID_ENV: &str = "WARP_TRACKER_GOOGLE_CLIENT_ID";
const BUNDLED_GOOGLE_OAUTH_CLIENT_ID: Option<&str> = option_env!("MIKU_WARP_GOOGLE_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET_ENV: &str = "MIKU_WARP_GOOGLE_CLIENT_SECRET";
const LEGACY_GOOGLE_OAUTH_CLIENT_SECRET_ENV: &str = "WARP_TRACKER_GOOGLE_CLIENT_SECRET";
const KEYRING_SERVICE_NAME: &str = "app.warptracker.desktop.google-drive";
const GOOGLE_DRIVE_REFRESH_TOKEN_KEY: &str = "google-drive-refresh-token";
const GOOGLE_AUTHORIZATION_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_ENDPOINT: &str = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_ENDPOINT: &str = "https://www.googleapis.com/upload/drive/v3/files";
const OAUTH_CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);
const OAUTH_RANDOM_TOKEN_BYTES: usize = 64;
const DRIVE_MULTIPART_BOUNDARY_PREFIX: &str = "warp-tracker-backup";
const CLOUD_BACKUP_FILE_NAME_PREFIX: &str = "warp-tracker-backup-";
const CLOUD_BACKUP_LIST_PAGE_SIZE: &str = "20";

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudBackupProvider {
    GoogleDrive,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudBackupConnectionStatus {
    NotConfigured,
    StorageUnavailable,
    Disconnected,
    Connecting,
    ConnectionFailed,
    Connected,
    NeedsReauth,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudBackupStorageSpace {
    AppDataFolder,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SecureTokenStorageStatus {
    Ready,
    Unavailable,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBackupStatus {
    pub provider: CloudBackupProvider,
    pub connection_status: CloudBackupConnectionStatus,
    pub storage_space: CloudBackupStorageSpace,
    pub scope: &'static str,
    pub secure_storage_status: SecureTokenStorageStatus,
    pub oauth_client_configured: bool,
    pub can_connect: bool,
    pub can_disconnect: bool,
    pub can_upload: bool,
    pub label: String,
    pub detail: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCloudBackupSnapshotResult {
    pub local_backup_path: String,
    pub file_name: String,
    pub remote_file_id: String,
    pub remote_file_name: String,
    pub remote_md5_checksum: Option<String>,
    pub remote_modified_time: Option<String>,
    pub bytes_uploaded: usize,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBackupSnapshotSummary {
    pub remote_file_id: String,
    pub file_name: String,
    pub remote_md5_checksum: Option<String>,
    pub remote_modified_time: Option<String>,
    pub size: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCloudBackupSnapshotResult {
    pub remote_file_id: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCloudBackupSnapshotInput {
    pub remote_file_id: String,
    pub file_name: Option<String>,
    pub remote_md5_checksum: Option<String>,
    pub remote_modified_time: Option<String>,
    pub size: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SecretStoreError {
    Unavailable(String),
}

pub trait SecretStore {
    fn read_secret(&self, key: &str) -> Result<Option<String>, SecretStoreError>;
    fn write_secret(&self, key: &str, value: &str) -> Result<(), SecretStoreError>;
    fn delete_secret(&self, key: &str) -> Result<(), SecretStoreError>;
}

#[derive(Debug, Default)]
pub struct KeyringSecretStore;

#[derive(Debug, Clone, PartialEq, Eq)]
struct GoogleOAuthClientConfig {
    client_id: Option<String>,
    client_secret: Option<String>,
}

#[derive(Debug, Clone)]
enum GoogleDriveAuthFlowState {
    Idle,
    InProgress {
        session_id: String,
        started_at: Instant,
        cancellation: Arc<AtomicBool>,
    },
    Failed {
        detail: String,
    },
}

#[derive(Debug, Clone)]
struct GoogleDriveAuthFlowSession {
    session_id: String,
    cancellation: Arc<AtomicBool>,
}

impl KeyringSecretStore {
    #[cfg(target_os = "windows")]
    fn entry(&self, key: &str) -> Result<Entry, SecretStoreError> {
        let target = format!("{KEYRING_SERVICE_NAME}.{key}");
        let credential = keyring::windows::WinCredential::new_with_target(
            Some(&target),
            KEYRING_SERVICE_NAME,
            key,
        )
        .map_err(to_secret_store_error)?;

        Ok(Entry::new_with_credential(Box::new(credential)))
    }

    #[cfg(not(target_os = "windows"))]
    fn entry(&self, _key: &str) -> Result<Entry, SecretStoreError> {
        Err(SecretStoreError::Unavailable(
            "Secure token storage is not configured for this operating system.".to_string(),
        ))
    }
}

impl SecretStore for KeyringSecretStore {
    fn read_secret(&self, key: &str) -> Result<Option<String>, SecretStoreError> {
        match self.entry(key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(to_secret_store_error(error)),
        }
    }

    fn write_secret(&self, key: &str, value: &str) -> Result<(), SecretStoreError> {
        self.entry(key)?
            .set_password(value)
            .map_err(to_secret_store_error)
    }

    fn delete_secret(&self, key: &str) -> Result<(), SecretStoreError> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(to_secret_store_error(error)),
        }
    }
}

pub fn get_cloud_backup_status() -> CloudBackupStatus {
    cloud_backup_status_with_auth_flow(
        &KeyringSecretStore,
        read_google_oauth_client_config_from_environment(),
        read_google_drive_auth_flow_state(),
    )
}

pub fn connect_google_drive_backup() -> Result<CloudBackupStatus, String> {
    let secret_store = KeyringSecretStore;
    let oauth_config = read_google_oauth_client_config_from_environment();
    let client_id = oauth_config
        .client_id
        .clone()
        .ok_or_else(google_drive_unavailable_message)?;
    let current_status = cloud_backup_status(&secret_store, oauth_config.clone());

    if matches!(
        current_status.connection_status,
        CloudBackupConnectionStatus::StorageUnavailable
    ) {
        return Err(current_status.detail);
    }

    if matches!(
        current_status.connection_status,
        CloudBackupConnectionStatus::Connected
    ) {
        return Ok(current_status);
    }

    start_google_oauth_flow_in_background(client_id, oauth_config.client_secret.clone())?;

    Ok(cloud_backup_status_with_auth_flow(
        &secret_store,
        oauth_config,
        read_google_drive_auth_flow_state(),
    ))
}

pub fn cancel_google_drive_backup_connection() -> Result<CloudBackupStatus, String> {
    let secret_store = KeyringSecretStore;

    cancel_google_drive_auth_flow()?;
    secret_store
        .delete_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
        .map_err(secret_store_error_message)?;

    Ok(get_cloud_backup_status())
}

pub fn disconnect_google_drive_backup() -> Result<CloudBackupStatus, String> {
    let secret_store = KeyringSecretStore;
    cancel_google_drive_auth_flow()?;
    secret_store
        .delete_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
        .map_err(secret_store_error_message)?;

    Ok(cloud_backup_status(
        &secret_store,
        read_google_oauth_client_config_from_environment(),
    ))
}

pub fn upload_google_drive_backup_snapshot(
    local_backup_path: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<UploadCloudBackupSnapshotResult, String> {
    let secret_store = KeyringSecretStore;
    let oauth_config = read_google_oauth_client_config_from_environment();
    let client_id = oauth_config
        .client_id
        .as_deref()
        .ok_or_else(google_drive_unavailable_message)?;
    let access_token = refresh_google_access_token(
        &secret_store,
        client_id,
        oauth_config.client_secret.as_deref(),
    )?;
    let remote_file = upload_backup_snapshot_to_drive(file_name, bytes, &access_token)?;
    let remote_file_id = remote_file
        .id
        .ok_or_else(|| "Google Drive upload did not return a remote file id.".to_string())?;

    Ok(UploadCloudBackupSnapshotResult {
        local_backup_path: local_backup_path.to_string(),
        file_name: file_name.to_string(),
        remote_file_id,
        remote_file_name: remote_file.name.unwrap_or_else(|| file_name.to_string()),
        remote_md5_checksum: remote_file.md5_checksum,
        remote_modified_time: remote_file.modified_time,
        bytes_uploaded: bytes.len(),
    })
}

pub fn list_google_drive_backup_snapshots() -> Result<Vec<CloudBackupSnapshotSummary>, String> {
    let secret_store = KeyringSecretStore;
    let oauth_config = read_google_oauth_client_config_from_environment();
    let client_id = oauth_config
        .client_id
        .as_deref()
        .ok_or_else(google_drive_unavailable_message)?;
    let access_token = refresh_google_access_token(
        &secret_store,
        client_id,
        oauth_config.client_secret.as_deref(),
    )?;

    list_backup_snapshots_from_drive(&access_token)
}

pub fn download_google_drive_backup_snapshot(
    remote_file_id: &str,
) -> Result<DownloadCloudBackupSnapshotResult, String> {
    let secret_store = KeyringSecretStore;
    let oauth_config = read_google_oauth_client_config_from_environment();
    let client_id = oauth_config
        .client_id
        .as_deref()
        .ok_or_else(google_drive_unavailable_message)?;
    let access_token = refresh_google_access_token(
        &secret_store,
        client_id,
        oauth_config.client_secret.as_deref(),
    )?;
    let bytes = download_backup_snapshot_from_drive(remote_file_id, &access_token)?;

    Ok(DownloadCloudBackupSnapshotResult {
        remote_file_id: remote_file_id.to_string(),
        bytes,
    })
}

fn cloud_backup_status(
    secret_store: &impl SecretStore,
    oauth_config: GoogleOAuthClientConfig,
) -> CloudBackupStatus {
    let token_lookup = secret_store.read_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY);

    match token_lookup {
        Err(SecretStoreError::Unavailable(error)) => create_status(
            CloudBackupConnectionStatus::StorageUnavailable,
            SecureTokenStorageStatus::Unavailable,
            oauth_config.client_id.is_some(),
            false,
            false,
            false,
            "Secure storage unavailable",
            format!(
                "OS credential storage is unavailable: {error}. Google Drive backup will stay disabled so tokens are not stored unsafely."
            ),
        ),
        Ok(_token) if oauth_config.client_id.is_none() => create_status(
            CloudBackupConnectionStatus::NotConfigured,
            SecureTokenStorageStatus::Ready,
            false,
            false,
            false,
            false,
            "Drive backup unavailable",
            google_drive_unavailable_message(),
        ),
        Ok(Some(_token)) => create_status(
            CloudBackupConnectionStatus::Connected,
            SecureTokenStorageStatus::Ready,
            true,
            false,
            true,
            true,
            "Connected",
            "Google Drive is connected. Local snapshots can be uploaded to the app data folder.".to_string(),
        ),
        Ok(None) => create_status(
            CloudBackupConnectionStatus::Disconnected,
            SecureTokenStorageStatus::Ready,
            true,
            true,
            false,
            false,
            "Not connected",
            String::new(),
        ),
    }
}

fn cloud_backup_status_with_auth_flow(
    secret_store: &impl SecretStore,
    oauth_config: GoogleOAuthClientConfig,
    auth_flow_state: GoogleDriveAuthFlowState,
) -> CloudBackupStatus {
    let status = cloud_backup_status(secret_store, oauth_config);

    apply_google_auth_flow_state(status, auth_flow_state)
}

fn apply_google_auth_flow_state(
    status: CloudBackupStatus,
    auth_flow_state: GoogleDriveAuthFlowState,
) -> CloudBackupStatus {
    if !matches!(
        status.connection_status,
        CloudBackupConnectionStatus::Disconnected | CloudBackupConnectionStatus::NeedsReauth
    ) {
        return status;
    }

    match auth_flow_state {
        GoogleDriveAuthFlowState::Idle => status,
        GoogleDriveAuthFlowState::InProgress { .. } => create_status(
            CloudBackupConnectionStatus::Connecting,
            status.secure_storage_status,
            status.oauth_client_configured,
            false,
            false,
            false,
            "Waiting for Google login",
            "Finish Google login in the browser. Miku Warp will update automatically.".to_string(),
        ),
        GoogleDriveAuthFlowState::Failed { detail } => create_status(
            CloudBackupConnectionStatus::ConnectionFailed,
            status.secure_storage_status,
            status.oauth_client_configured,
            true,
            false,
            false,
            "Connection failed",
            detail,
        ),
    }
}

fn refresh_google_access_token(
    secret_store: &impl SecretStore,
    client_id: &str,
    client_secret: Option<&str>,
) -> Result<String, String> {
    let refresh_token = secret_store
        .read_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
        .map_err(secret_store_error_message)?
        .ok_or_else(|| "Connect Google Drive before uploading cloud backups.".to_string())?;
    let mut form = vec![
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
    ];

    if let Some(client_secret) = client_secret {
        form.push(("client_secret", client_secret));
    }

    let token_response = ureq::post(GOOGLE_TOKEN_ENDPOINT)
        .send_form(&form)
        .map_err(|error| google_token_request_error("refresh Google Drive access token", error))?
        .into_json::<GoogleTokenResponse>()
        .map_err(|error| format!("Failed to read Google Drive access token response: {error}"))?;

    token_response.access_token.ok_or_else(|| {
        "Google did not return an access token. Disconnect and connect Google Drive again."
            .to_string()
    })
}

fn upload_backup_snapshot_to_drive(
    file_name: &str,
    bytes: &[u8],
    access_token: &str,
) -> Result<GoogleDriveFileResponse, String> {
    let boundary = create_drive_multipart_boundary();
    let body = build_drive_multipart_upload_body(file_name, bytes, &boundary)?;
    let upload_url = build_drive_upload_url()?;
    let authorization = format!("Bearer {access_token}");
    let content_type = format!("multipart/related; boundary={boundary}");

    ureq::post(&upload_url)
        .set("Authorization", &authorization)
        .set("Content-Type", &content_type)
        .send_bytes(&body)
        .map_err(|error| format!("Failed to upload backup snapshot to Google Drive: {error}"))?
        .into_json::<GoogleDriveFileResponse>()
        .map_err(|error| format!("Failed to read Google Drive upload response: {error}"))
}

fn list_backup_snapshots_from_drive(
    access_token: &str,
) -> Result<Vec<CloudBackupSnapshotSummary>, String> {
    let list_url = build_drive_backup_list_url()?;
    let authorization = format!("Bearer {access_token}");
    let file_list = ureq::get(&list_url)
        .set("Authorization", &authorization)
        .call()
        .map_err(|error| format!("Failed to list Google Drive backup snapshots: {error}"))?
        .into_json::<GoogleDriveFileListResponse>()
        .map_err(|error| format!("Failed to read Google Drive backup list response: {error}"))?;

    file_list
        .files
        .into_iter()
        .map(to_cloud_backup_snapshot_summary)
        .collect()
}

fn download_backup_snapshot_from_drive(
    remote_file_id: &str,
    access_token: &str,
) -> Result<Vec<u8>, String> {
    validate_google_drive_file_id(remote_file_id)?;

    let download_url = build_drive_download_url(remote_file_id)?;
    let authorization = format!("Bearer {access_token}");
    let response = ureq::get(&download_url)
        .set("Authorization", &authorization)
        .call()
        .map_err(|error| format!("Failed to download Google Drive backup snapshot: {error}"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read Google Drive backup snapshot bytes: {error}"))?;

    Ok(bytes)
}

fn build_drive_download_url(remote_file_id: &str) -> Result<String, String> {
    validate_google_drive_file_id(remote_file_id)?;

    let mut url = Url::parse(GOOGLE_DRIVE_FILES_ENDPOINT)
        .map_err(|error| format!("Failed to build Google Drive download URL: {error}"))?;
    url.path_segments_mut()
        .map_err(|()| "Failed to append Google Drive file id to download URL.".to_string())?
        .push(remote_file_id);
    url.query_pairs_mut().append_pair("alt", "media");

    Ok(url.to_string())
}

fn validate_google_drive_file_id(remote_file_id: &str) -> Result<(), String> {
    if remote_file_id.trim().is_empty() {
        return Err("Google Drive file id is required.".to_string());
    }

    if !remote_file_id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Google Drive file id contains unsupported characters.".to_string());
    }

    Ok(())
}

fn build_drive_backup_list_url() -> Result<String, String> {
    Url::parse_with_params(
        GOOGLE_DRIVE_FILES_ENDPOINT,
        &[
            ("spaces", "appDataFolder"),
            ("pageSize", CLOUD_BACKUP_LIST_PAGE_SIZE),
            ("orderBy", "modifiedTime desc"),
            ("fields", "files(id,name,md5Checksum,modifiedTime,size)"),
            (
                "q",
                &format!("name contains '{CLOUD_BACKUP_FILE_NAME_PREFIX}'"),
            ),
        ],
    )
    .map(|url| url.to_string())
    .map_err(|error| format!("Failed to build Google Drive backup list URL: {error}"))
}

fn to_cloud_backup_snapshot_summary(
    file: GoogleDriveFileResponse,
) -> Result<CloudBackupSnapshotSummary, String> {
    let remote_file_id = file
        .id
        .ok_or_else(|| "Google Drive backup list returned a file without an id.".to_string())?;
    let file_name = file
        .name
        .ok_or_else(|| "Google Drive backup list returned a file without a name.".to_string())?;

    Ok(CloudBackupSnapshotSummary {
        remote_file_id,
        file_name,
        remote_md5_checksum: file.md5_checksum,
        remote_modified_time: file.modified_time,
        size: file.size,
    })
}

fn build_drive_upload_url() -> Result<String, String> {
    Url::parse_with_params(
        GOOGLE_DRIVE_UPLOAD_ENDPOINT,
        &[
            ("uploadType", "multipart"),
            ("fields", "id,name,md5Checksum,modifiedTime,size"),
        ],
    )
    .map(|url| url.to_string())
    .map_err(|error| format!("Failed to build Google Drive upload URL: {error}"))
}

fn build_drive_multipart_upload_body(
    file_name: &str,
    bytes: &[u8],
    boundary: &str,
) -> Result<Vec<u8>, String> {
    let metadata = serde_json::json!({
        "name": file_name,
        "parents": ["appDataFolder"],
    })
    .to_string();
    let mut body = Vec::new();

    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json\r\n\r\n");
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    Ok(body)
}

fn create_drive_multipart_boundary() -> String {
    format!(
        "{DRIVE_MULTIPART_BOUNDARY_PREFIX}-{}",
        generate_oauth_random_token()
    )
}

fn complete_google_oauth_flow(
    secret_store: &impl SecretStore,
    client_id: &str,
    client_secret: Option<&str>,
    session_id: &str,
    cancellation: &AtomicBool,
) -> Result<(), String> {
    ensure_google_drive_auth_not_cancelled(cancellation)?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Failed to start local OAuth callback listener: {error}"))?;
    let local_port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read local OAuth callback address: {error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{local_port}");
    let code_verifier = generate_oauth_random_token();
    let state = generate_oauth_random_token();
    let code_challenge = create_pkce_code_challenge(&code_verifier);
    let authorization_url =
        build_google_authorization_url(client_id, &redirect_uri, &state, &code_challenge)?;

    webbrowser::open(&authorization_url)
        .map_err(|error| format!("Failed to open system browser for Google OAuth: {error}"))?;

    wait_for_authorization_code(listener, &state, cancellation, |authorization_code| {
        ensure_google_drive_auth_not_cancelled(cancellation)?;
        let token_response = exchange_authorization_code(
            client_id,
            client_secret,
            &redirect_uri,
            &code_verifier,
            &authorization_code,
        )?;
        let refresh_token = token_response.refresh_token.ok_or_else(|| {
            "Google did not return a refresh token. Try disconnecting the app from your Google account, then connect again.".to_string()
        })?;

        ensure_google_drive_auth_not_cancelled(cancellation)?;
        write_refresh_token_for_active_auth_session(
            secret_store,
            session_id,
            cancellation,
            &refresh_token,
        )
    })
}

fn start_google_oauth_flow_in_background(
    client_id: String,
    client_secret: Option<String>,
) -> Result<(), String> {
    let Some(session) = begin_google_drive_auth_flow()? else {
        return Ok(());
    };
    let session_id = session.session_id.clone();
    let cancellation = session.cancellation.clone();

    thread::spawn(move || {
        let secret_store = KeyringSecretStore;
        let result = complete_google_oauth_flow(
            &secret_store,
            &client_id,
            client_secret.as_deref(),
            &session_id,
            &cancellation,
        );

        finish_google_drive_auth_flow(&session_id, result);
    });

    Ok(())
}

fn begin_google_drive_auth_flow() -> Result<Option<GoogleDriveAuthFlowSession>, String> {
    let mut state = google_drive_auth_flow_state()
        .lock()
        .map_err(|error| format!("Failed to prepare Google Drive login state: {error}"))?;

    if let GoogleDriveAuthFlowState::InProgress {
        started_at,
        cancellation,
        ..
    } = &*state
    {
        if started_at.elapsed() < OAUTH_CALLBACK_TIMEOUT {
            return Ok(None);
        }

        cancellation.store(true, Ordering::Release);
    }

    let session = GoogleDriveAuthFlowSession {
        session_id: generate_oauth_random_token(),
        cancellation: Arc::new(AtomicBool::new(false)),
    };
    *state = GoogleDriveAuthFlowState::InProgress {
        session_id: session.session_id.clone(),
        started_at: Instant::now(),
        cancellation: session.cancellation.clone(),
    };

    Ok(Some(session))
}

fn cancel_google_drive_auth_flow() -> Result<bool, String> {
    let mut state = google_drive_auth_flow_state()
        .lock()
        .map_err(|error| format!("Failed to cancel Google Drive login: {error}"))?;

    if let GoogleDriveAuthFlowState::InProgress { cancellation, .. } = &*state {
        cancellation.store(true, Ordering::Release);
        *state = GoogleDriveAuthFlowState::Idle;
        return Ok(true);
    }

    Ok(false)
}

fn finish_google_drive_auth_flow(session_id: &str, result: Result<(), String>) {
    let Ok(mut state) = google_drive_auth_flow_state().lock() else {
        return;
    };
    let is_active_session = matches!(
        &*state,
        GoogleDriveAuthFlowState::InProgress {
            session_id: active_session_id,
            ..
        } if active_session_id == session_id
    );

    if !is_active_session {
        return;
    }

    *state = match result {
        Ok(()) => GoogleDriveAuthFlowState::Idle,
        Err(detail) => GoogleDriveAuthFlowState::Failed { detail },
    };
}

fn read_google_drive_auth_flow_state() -> GoogleDriveAuthFlowState {
    google_drive_auth_flow_state()
        .lock()
        .map(|state| state.clone())
        .unwrap_or(GoogleDriveAuthFlowState::Failed {
            detail: "Failed to read Google Drive login state.".to_string(),
        })
}

fn google_drive_auth_flow_state() -> &'static Mutex<GoogleDriveAuthFlowState> {
    static AUTH_FLOW_STATE: OnceLock<Mutex<GoogleDriveAuthFlowState>> = OnceLock::new();

    AUTH_FLOW_STATE.get_or_init(|| Mutex::new(GoogleDriveAuthFlowState::Idle))
}

fn write_and_verify_refresh_token(
    secret_store: &impl SecretStore,
    refresh_token: &str,
) -> Result<(), String> {
    secret_store
        .write_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY, refresh_token)
        .map_err(secret_store_error_message)?;

    match secret_store
        .read_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
        .map_err(secret_store_error_message)?
    {
        Some(saved_token) if saved_token == refresh_token => Ok(()),
        Some(_) => Err(
            "Google Drive token was saved, but Miku Warp could not verify it correctly."
                .to_string(),
        ),
        None => Err(
            "Google Drive token was saved, but Miku Warp could not read it back from secure storage."
                .to_string(),
        ),
    }
}

fn write_refresh_token_for_active_auth_session(
    secret_store: &impl SecretStore,
    session_id: &str,
    cancellation: &AtomicBool,
    refresh_token: &str,
) -> Result<(), String> {
    ensure_google_drive_auth_not_cancelled(cancellation)?;
    let state = google_drive_auth_flow_state()
        .lock()
        .map_err(|error| format!("Failed to verify active Google Drive login: {error}"))?;
    let is_active_session = matches!(
        &*state,
        GoogleDriveAuthFlowState::InProgress {
            session_id: active_session_id,
            ..
        } if active_session_id == session_id
    );

    if !is_active_session {
        return Err("Google Drive connection was cancelled.".to_string());
    }

    ensure_google_drive_auth_not_cancelled(cancellation)?;
    write_and_verify_refresh_token(secret_store, refresh_token)
}

fn wait_for_authorization_code<F>(
    listener: TcpListener,
    expected_state: &str,
    cancellation: &AtomicBool,
    mut complete_authorization: F,
) -> Result<(), String>
where
    F: FnMut(String) -> Result<(), String>,
{
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Failed to prepare OAuth callback listener: {error}"))?;

    let started_at = Instant::now();

    while started_at.elapsed() < OAUTH_CALLBACK_TIMEOUT {
        ensure_google_drive_auth_not_cancelled(cancellation)?;

        match listener.accept() {
            Ok((mut stream, _address)) => {
                let mut buffer = [0_u8; 4096];
                let bytes_read = stream
                    .read(&mut buffer)
                    .map_err(|error| format!("Failed to read OAuth callback: {error}"))?;
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let flow_result = parse_oauth_callback_request(&request, expected_state)
                    .and_then(&mut complete_authorization);
                let response = oauth_callback_response(flow_result.as_ref().err());
                stream.write_all(response.as_bytes()).map_err(|error| {
                    format!("Failed to finish OAuth callback response: {error}")
                })?;

                return flow_result;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                return Err(format!("Failed to receive OAuth callback: {error}"));
            }
        }
    }

    Err("Google OAuth timed out before the browser returned an authorization code.".to_string())
}

fn ensure_google_drive_auth_not_cancelled(cancellation: &AtomicBool) -> Result<(), String> {
    if cancellation.load(Ordering::Acquire) {
        return Err("Google Drive connection was cancelled.".to_string());
    }

    Ok(())
}

fn exchange_authorization_code(
    client_id: &str,
    client_secret: Option<&str>,
    redirect_uri: &str,
    code_verifier: &str,
    authorization_code: &str,
) -> Result<GoogleTokenResponse, String> {
    let mut form = vec![
        ("client_id", client_id),
        ("code", authorization_code),
        ("code_verifier", code_verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];

    if let Some(client_secret) = client_secret {
        form.push(("client_secret", client_secret));
    }

    ureq::post(GOOGLE_TOKEN_ENDPOINT)
        .send_form(&form)
        .map_err(|error| google_token_request_error("exchange Google OAuth code", error))?
        .into_json::<GoogleTokenResponse>()
        .map_err(|error| format!("Failed to read Google OAuth token response: {error}"))
}

fn build_google_authorization_url(
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
) -> Result<String, String> {
    Url::parse_with_params(
        GOOGLE_AUTHORIZATION_ENDPOINT,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("scope", GOOGLE_DRIVE_APP_DATA_SCOPE),
            ("state", state),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .map(|url| url.to_string())
    .map_err(|error| format!("Failed to build Google OAuth URL: {error}"))
}

fn parse_oauth_callback_request(request: &str, expected_state: &str) -> Result<String, String> {
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "OAuth callback request is empty.".to_string())?;
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "OAuth callback request is malformed.".to_string())?;
    let callback_url = Url::parse(&format!("http://127.0.0.1{path}"))
        .map_err(|error| format!("OAuth callback URL is malformed: {error}"))?;
    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;

    for (key, value) in callback_url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => oauth_error = Some(value.into_owned()),
            _ => {}
        }
    }

    if let Some(error) = oauth_error {
        return Err(format!("Google OAuth failed: {error}"));
    }

    if state.as_deref() != Some(expected_state) {
        return Err("Google OAuth callback state did not match the active request.".to_string());
    }

    code.ok_or_else(|| "Google OAuth callback did not include an authorization code.".to_string())
}

fn oauth_callback_response(error: Option<&String>) -> String {
    let body = if let Some(error) = error {
        format!(
            "Google Drive connection failed. Return to Miku Warp and try again.<br><small>{}</small>",
            escape_html(error)
        )
    } else {
        "Google Drive is connected. You can close this browser tab.".to_string()
    };

    let html = format!("<!doctype html><html><body><p>{body}</p></body></html>");

    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        html.len(),
        html
    )
}

fn google_token_request_error(action: &str, error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(status, response) => {
            let body = response.into_string().unwrap_or_default();
            let detail = parse_google_error_detail(&body)
                .or_else(|| (!body.trim().is_empty()).then(|| body.trim().to_string()))
                .unwrap_or_else(|| format!("HTTP {status}"));
            let detail = humanize_google_token_error(&detail);

            format!("Failed to {action}: {detail}")
        }
        error => format!("Failed to {action}: {error}"),
    }
}

fn parse_google_error_detail(body: &str) -> Option<String> {
    let error = serde_json::from_str::<GoogleErrorResponse>(body).ok()?;
    let mut parts = Vec::new();

    if let Some(code) = error.error.filter(|value| !value.trim().is_empty()) {
        parts.push(code);
    }

    if let Some(description) = error
        .error_description
        .filter(|value| !value.trim().is_empty())
    {
        parts.push(description);
    }

    (!parts.is_empty()).then(|| parts.join(": "))
}

fn humanize_google_token_error(detail: &str) -> String {
    if detail
        .to_ascii_lowercase()
        .contains("client_secret is missing")
    {
        return "Google requires a Client Secret for this OAuth client. Add the Client Secret from Google Cloud Console to Miku Warp's build or development environment, then reconnect.".to_string();
    }

    detail.to_string()
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn generate_oauth_random_token() -> String {
    let mut bytes = [0_u8; OAUTH_RANDOM_TOKEN_BYTES];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn create_pkce_code_challenge(code_verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()))
}

fn create_status(
    connection_status: CloudBackupConnectionStatus,
    secure_storage_status: SecureTokenStorageStatus,
    oauth_client_configured: bool,
    can_connect: bool,
    can_disconnect: bool,
    can_upload: bool,
    label: &str,
    detail: String,
) -> CloudBackupStatus {
    CloudBackupStatus {
        provider: CloudBackupProvider::GoogleDrive,
        connection_status,
        storage_space: CloudBackupStorageSpace::AppDataFolder,
        scope: GOOGLE_DRIVE_APP_DATA_SCOPE,
        secure_storage_status,
        oauth_client_configured,
        can_connect,
        can_disconnect,
        can_upload,
        label: label.to_string(),
        detail,
    }
}

fn read_google_oauth_client_config_from_environment() -> GoogleOAuthClientConfig {
    GoogleOAuthClientConfig {
        client_id: read_google_oauth_client_id_from_environment(),
        client_secret: read_google_oauth_client_secret_from_environment(),
    }
}

fn read_google_oauth_client_id_from_environment() -> Option<String> {
    let runtime_client_id = [
        GOOGLE_OAUTH_CLIENT_ID_ENV,
        LEGACY_GOOGLE_OAUTH_CLIENT_ID_ENV,
    ]
    .into_iter()
    .find_map(|env_key| {
        env::var(env_key)
            .ok()
            .map(|client_id| client_id.trim().to_string())
            .filter(|client_id| !client_id.is_empty())
    });

    runtime_client_id.or_else(|| {
        BUNDLED_GOOGLE_OAUTH_CLIENT_ID
            .map(|client_id| client_id.trim().to_string())
            .filter(|client_id| !client_id.is_empty())
    })
}

fn read_google_oauth_client_secret_from_environment() -> Option<String> {
    let runtime_client_secret = [
        GOOGLE_OAUTH_CLIENT_SECRET_ENV,
        LEGACY_GOOGLE_OAUTH_CLIENT_SECRET_ENV,
    ]
    .into_iter()
    .find_map(|env_key| {
        env::var(env_key)
            .ok()
            .map(|client_secret| client_secret.trim().to_string())
            .filter(|client_secret| !client_secret.is_empty())
    });

    runtime_client_secret
}

fn google_drive_unavailable_message() -> String {
    "Google Drive backup is not available in this build. Local JSON backup still works.".to_string()
}

fn to_secret_store_error(error: KeyringError) -> SecretStoreError {
    SecretStoreError::Unavailable(error.to_string())
}

fn secret_store_error_message(error: SecretStoreError) -> String {
    match error {
        SecretStoreError::Unavailable(error) => {
            format!("Secure token storage is unavailable: {error}")
        }
    }
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleDriveFileResponse {
    id: Option<String>,
    name: Option<String>,
    md5_checksum: Option<String>,
    modified_time: Option<String>,
    size: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleDriveFileListResponse {
    files: Vec<GoogleDriveFileResponse>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::HashMap};

    #[test]
    fn reports_not_configured_when_oauth_client_is_missing() {
        let store = MemorySecretStore::default();

        let status = cloud_backup_status(&store, oauth_config(None));

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::NotConfigured
        );
        assert_eq!(
            status.secure_storage_status,
            SecureTokenStorageStatus::Ready
        );
        assert!(!status.oauth_client_configured);
        assert!(!status.can_connect);
        assert!(!status.can_disconnect);
        assert!(!status.can_upload);
    }

    #[test]
    fn reports_disconnected_when_oauth_client_exists_without_token() {
        let store = MemorySecretStore::default();

        let status = cloud_backup_status(&store, oauth_config(Some("client-id")));

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::Disconnected
        );
        assert_eq!(
            status.secure_storage_status,
            SecureTokenStorageStatus::Ready
        );
        assert!(status.oauth_client_configured);
        assert!(status.can_connect);
        assert!(!status.can_disconnect);
        assert_eq!(status.label, "Not connected");
        assert!(status.detail.is_empty());
    }

    #[test]
    fn reports_securely_stored_token_with_manual_upload_enabled() {
        let store = MemorySecretStore::default();
        store
            .write_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY, "refresh-token")
            .expect("secret can be written");

        let status = cloud_backup_status(&store, oauth_config(Some("client-id")));

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::Connected
        );
        assert_eq!(status.label, "Connected");
        assert!(status.can_disconnect);
        assert!(status.can_upload);
    }

    #[test]
    fn reports_auth_flow_in_progress_without_starting_duplicate_connects() {
        let store = MemorySecretStore::default();

        let status = cloud_backup_status_with_auth_flow(
            &store,
            oauth_config(Some("client-id")),
            GoogleDriveAuthFlowState::InProgress {
                session_id: "session-id".to_string(),
                started_at: Instant::now(),
                cancellation: Arc::new(AtomicBool::new(false)),
            },
        );

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::Connecting
        );
        assert_eq!(status.label, "Waiting for Google login");
        assert!(!status.can_connect);
        assert!(!status.can_upload);
    }

    #[test]
    fn reports_auth_flow_failure_until_user_retries() {
        let store = MemorySecretStore::default();

        let status = cloud_backup_status_with_auth_flow(
            &store,
            oauth_config(Some("client-id")),
            GoogleDriveAuthFlowState::Failed {
                detail: "callback failed".to_string(),
            },
        );

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::ConnectionFailed
        );
        assert_eq!(status.label, "Connection failed");
        assert_eq!(status.detail, "callback failed");
        assert!(status.can_connect);
        assert!(!status.can_upload);
    }

    #[test]
    fn stops_waiting_for_oauth_callback_after_cancellation() {
        let listener =
            TcpListener::bind("127.0.0.1:0").expect("test callback listener can be created");
        let cancellation = AtomicBool::new(true);

        let error = wait_for_authorization_code(listener, "state-token", &cancellation, |_| {
            panic!("cancelled flow must not complete authorization")
        })
        .expect_err("cancelled auth flow should stop");

        assert!(error.contains("cancelled"));
    }

    #[test]
    fn verifies_refresh_token_after_saving() {
        let store = MemorySecretStore::default();

        write_and_verify_refresh_token(&store, "refresh-token")
            .expect("refresh token can be saved and read back");

        assert_eq!(
            store
                .read_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
                .expect("secret can be read"),
            Some("refresh-token".to_string())
        );
    }

    #[test]
    fn rejects_refresh_token_when_secure_storage_cannot_read_it_back() {
        let store = WriteOnlySecretStore;

        let error = write_and_verify_refresh_token(&store, "refresh-token")
            .expect_err("missing readback should fail");

        assert!(error.contains("could not read it back"));
    }

    #[test]
    fn creates_pkce_s256_challenge() {
        let challenge = create_pkce_code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");

        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn builds_google_authorization_url_for_drive_app_data_scope() {
        let url = Url::parse(
            &build_google_authorization_url(
                "client-id",
                "http://127.0.0.1:9004",
                "state-token",
                "challenge-token",
            )
            .expect("authorization url can be built"),
        )
        .expect("authorization url can be parsed");
        let query_pairs = url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();

        assert_eq!(
            url.as_str().split('?').next(),
            Some(GOOGLE_AUTHORIZATION_ENDPOINT)
        );
        assert_eq!(query_pairs.get("client_id"), Some(&"client-id".to_string()));
        assert_eq!(
            query_pairs.get("redirect_uri"),
            Some(&"http://127.0.0.1:9004".to_string())
        );
        assert_eq!(
            query_pairs.get("scope"),
            Some(&GOOGLE_DRIVE_APP_DATA_SCOPE.to_string())
        );
        assert_eq!(
            query_pairs.get("code_challenge_method"),
            Some(&"S256".to_string())
        );
        assert_eq!(query_pairs.get("access_type"), Some(&"offline".to_string()));
    }

    #[test]
    fn parses_google_token_error_details() {
        let detail = parse_google_error_detail(
            r#"{"error":"invalid_grant","error_description":"Bad Request"}"#,
        );

        assert_eq!(detail, Some("invalid_grant: Bad Request".to_string()));
    }

    #[test]
    fn explains_web_oauth_client_secret_errors() {
        let detail = humanize_google_token_error("invalid_request: client_secret is missing");

        assert_eq!(
            detail,
            "Google requires a Client Secret for this OAuth client. Add the Client Secret from Google Cloud Console to Miku Warp's build or development environment, then reconnect."
        );
    }

    #[test]
    fn escapes_oauth_callback_error_html() {
        let response = oauth_callback_response(Some(&"<bad & wrong>".to_string()));

        assert!(response.contains("&lt;bad &amp; wrong&gt;"));
        assert!(!response.contains("<bad & wrong>"));
    }

    #[test]
    fn builds_google_drive_upload_url_for_multipart_create() {
        let url = Url::parse(&build_drive_upload_url().expect("upload url can be built"))
            .expect("upload url can be parsed");
        let query_pairs = url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();

        assert_eq!(
            url.as_str().split('?').next(),
            Some(GOOGLE_DRIVE_UPLOAD_ENDPOINT)
        );
        assert_eq!(
            query_pairs.get("uploadType"),
            Some(&"multipart".to_string())
        );
        assert_eq!(
            query_pairs.get("fields"),
            Some(&"id,name,md5Checksum,modifiedTime,size".to_string())
        );
    }

    #[test]
    fn builds_google_drive_list_url_for_app_data_snapshots() {
        let url = Url::parse(&build_drive_backup_list_url().expect("list url can be built"))
            .expect("list url can be parsed");
        let query_pairs = url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();

        assert_eq!(
            url.as_str().split('?').next(),
            Some(GOOGLE_DRIVE_FILES_ENDPOINT)
        );
        assert_eq!(
            query_pairs.get("spaces"),
            Some(&"appDataFolder".to_string())
        );
        assert_eq!(
            query_pairs.get("q"),
            Some(&"name contains 'warp-tracker-backup-'".to_string())
        );
        assert_eq!(
            query_pairs.get("orderBy"),
            Some(&"modifiedTime desc".to_string())
        );
    }

    #[test]
    fn maps_google_drive_files_to_cloud_snapshot_summaries() {
        let summary = to_cloud_backup_snapshot_summary(GoogleDriveFileResponse {
            id: Some("remote-1".to_string()),
            name: Some("warp-tracker-backup-20260606.json".to_string()),
            md5_checksum: Some("checksum".to_string()),
            modified_time: Some("2026-06-06T14:00:00.000Z".to_string()),
            size: Some("1234".to_string()),
        })
        .expect("file can be mapped");

        assert_eq!(summary.remote_file_id, "remote-1");
        assert_eq!(summary.file_name, "warp-tracker-backup-20260606.json");
        assert_eq!(summary.remote_md5_checksum, Some("checksum".to_string()));
        assert_eq!(summary.size, Some("1234".to_string()));
    }

    #[test]
    fn builds_google_drive_download_url_for_blob_file() {
        let url = Url::parse(
            &build_drive_download_url("remote_file-1").expect("download url can be built"),
        )
        .expect("download url can be parsed");
        let query_pairs = url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();

        assert_eq!(
            url.as_str().split('?').next(),
            Some("https://www.googleapis.com/drive/v3/files/remote_file-1")
        );
        assert_eq!(query_pairs.get("alt"), Some(&"media".to_string()));
    }

    #[test]
    fn rejects_invalid_google_drive_file_ids_before_download() {
        assert!(validate_google_drive_file_id("").is_err());
        assert!(validate_google_drive_file_id("../backup").is_err());
        assert!(validate_google_drive_file_id("remote file").is_err());
        assert!(validate_google_drive_file_id("remote_file-1").is_ok());
    }

    #[test]
    fn builds_drive_multipart_body_with_app_data_parent_and_snapshot_bytes() {
        let body = build_drive_multipart_upload_body(
            "warp-tracker-backup-20260606.json",
            br#"{"schemaVersion":1}"#,
            "boundary-token",
        )
        .expect("multipart body can be built");
        let body_text = String::from_utf8(body).expect("body is utf8 for json snapshot");

        assert!(body_text.contains("--boundary-token\r\n"));
        assert!(body_text.contains(r#""name":"warp-tracker-backup-20260606.json""#));
        assert!(body_text.contains(r#""parents":["appDataFolder"]"#));
        assert!(body_text.contains(r#"{"schemaVersion":1}"#));
        assert!(body_text.ends_with("--boundary-token--\r\n"));
    }

    #[test]
    fn parses_oauth_callback_code_after_state_validation() {
        let code = parse_oauth_callback_request(
            "GET /?code=auth-code&state=state-token HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            "state-token",
        )
        .expect("callback has code");

        assert_eq!(code, "auth-code");
    }

    #[test]
    fn rejects_oauth_callback_with_wrong_state() {
        let result = parse_oauth_callback_request(
            "GET /?code=auth-code&state=wrong-state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            "state-token",
        );

        assert!(result
            .expect_err("wrong state should fail")
            .contains("state did not match"));
    }

    #[test]
    fn reports_storage_unavailable_without_falling_back_to_plaintext() {
        let store = MemorySecretStore {
            error: Some("credential manager disabled".to_string()),
            ..MemorySecretStore::default()
        };

        let status = cloud_backup_status(&store, oauth_config(Some("client-id")));

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::StorageUnavailable
        );
        assert_eq!(
            status.secure_storage_status,
            SecureTokenStorageStatus::Unavailable
        );
        assert!(status.detail.contains("credential manager disabled"));
        assert!(!status.can_connect);
        assert!(!status.can_disconnect);
    }

    #[test]
    fn memory_secret_store_supports_write_read_and_delete() {
        let store = MemorySecretStore::default();

        store
            .write_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY, "refresh-token")
            .expect("secret can be written");
        assert_eq!(
            store
                .read_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
                .expect("secret can be read"),
            Some("refresh-token".to_string())
        );

        store
            .delete_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
            .expect("secret can be deleted");
        assert_eq!(
            store
                .read_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY)
                .expect("missing secret can be read"),
            None
        );
    }

    #[derive(Default)]
    struct MemorySecretStore {
        secrets: RefCell<HashMap<String, String>>,
        error: Option<String>,
    }

    impl SecretStore for MemorySecretStore {
        fn read_secret(&self, key: &str) -> Result<Option<String>, SecretStoreError> {
            self.error()?;
            Ok(self.secrets.borrow().get(key).cloned())
        }

        fn write_secret(&self, key: &str, value: &str) -> Result<(), SecretStoreError> {
            self.error()?;
            self.secrets
                .borrow_mut()
                .insert(key.to_string(), value.to_string());
            Ok(())
        }

        fn delete_secret(&self, key: &str) -> Result<(), SecretStoreError> {
            self.error()?;
            self.secrets.borrow_mut().remove(key);
            Ok(())
        }
    }

    impl MemorySecretStore {
        fn error(&self) -> Result<(), SecretStoreError> {
            match &self.error {
                Some(error) => Err(SecretStoreError::Unavailable(error.clone())),
                None => Ok(()),
            }
        }
    }

    struct WriteOnlySecretStore;

    impl SecretStore for WriteOnlySecretStore {
        fn read_secret(&self, _key: &str) -> Result<Option<String>, SecretStoreError> {
            Ok(None)
        }

        fn write_secret(&self, _key: &str, _value: &str) -> Result<(), SecretStoreError> {
            Ok(())
        }

        fn delete_secret(&self, _key: &str) -> Result<(), SecretStoreError> {
            Ok(())
        }
    }

    fn oauth_config(client_id: Option<&str>) -> GoogleOAuthClientConfig {
        GoogleOAuthClientConfig {
            client_id: client_id.map(ToString::to_string),
            client_secret: None,
        }
    }
}
