use keyring::{Entry, Error as KeyringError};
use serde::Serialize;
use std::env;

const GOOGLE_DRIVE_APP_DATA_SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const GOOGLE_OAUTH_CLIENT_ID_ENV: &str = "WARP_TRACKER_GOOGLE_CLIENT_ID";
const KEYRING_SERVICE_NAME: &str = "app.warptracker.desktop.google-drive";
const GOOGLE_DRIVE_REFRESH_TOKEN_KEY: &str = "google-drive-refresh-token";

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
    pub can_upload: bool,
    pub label: String,
    pub detail: String,
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

#[derive(Debug, PartialEq, Eq)]
struct GoogleOAuthClientConfig {
    client_id: Option<String>,
}

impl KeyringSecretStore {
    fn entry(&self, key: &str) -> Result<Entry, SecretStoreError> {
        Entry::new(KEYRING_SERVICE_NAME, key).map_err(to_secret_store_error)
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
    cloud_backup_status(
        &KeyringSecretStore,
        read_google_oauth_client_config_from_environment(),
    )
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
            "OAuth setup required",
            format!(
                "Secure token storage is ready. Configure {GOOGLE_OAUTH_CLIENT_ID_ENV} before enabling Google Drive backup."
            ),
        ),
        Ok(Some(_token)) => create_status(
            CloudBackupConnectionStatus::Connected,
            SecureTokenStorageStatus::Ready,
            true,
            false,
            false,
            "Token stored securely",
            "A Google Drive refresh token exists in secure storage. Upload and restore commands are not enabled yet.".to_string(),
        ),
        Ok(None) => create_status(
            CloudBackupConnectionStatus::Disconnected,
            SecureTokenStorageStatus::Ready,
            true,
            false,
            false,
            "Not connected",
            "Secure token storage is ready. The next step is the Google OAuth connect flow.".to_string(),
        ),
    }
}

fn create_status(
    connection_status: CloudBackupConnectionStatus,
    secure_storage_status: SecureTokenStorageStatus,
    oauth_client_configured: bool,
    can_connect: bool,
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
        can_upload,
        label: label.to_string(),
        detail,
    }
}

fn read_google_oauth_client_config_from_environment() -> GoogleOAuthClientConfig {
    GoogleOAuthClientConfig {
        client_id: env::var(GOOGLE_OAUTH_CLIENT_ID_ENV)
            .ok()
            .map(|client_id| client_id.trim().to_string())
            .filter(|client_id| !client_id.is_empty()),
    }
}

fn to_secret_store_error(error: KeyringError) -> SecretStoreError {
    SecretStoreError::Unavailable(error.to_string())
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
        assert_eq!(status.label, "Not connected");
    }

    #[test]
    fn reports_securely_stored_token_without_enabling_upload_yet() {
        let store = MemorySecretStore::default();
        store
            .write_secret(GOOGLE_DRIVE_REFRESH_TOKEN_KEY, "refresh-token")
            .expect("secret can be written");

        let status = cloud_backup_status(&store, oauth_config(Some("client-id")));

        assert_eq!(
            status.connection_status,
            CloudBackupConnectionStatus::Connected
        );
        assert_eq!(status.label, "Token stored securely");
        assert!(!status.can_upload);
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

    fn oauth_config(client_id: Option<&str>) -> GoogleOAuthClientConfig {
        GoogleOAuthClientConfig {
            client_id: client_id.map(ToString::to_string),
        }
    }
}
