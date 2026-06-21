import { CheckCircle2, Trash2 } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { WarpAccount } from '../../persistence/data/warp-pull-history'
import { AccountAvatar } from './AccountAvatar'
import type {
  AppLanguage,
  TimeZonePreference,
} from '../../settings/domain/localization'
import { formatDateTime } from '../../../shared/lib/date-time'

type AccountManagementPanelProps = {
  accounts: WarpAccount[]
  activeAccountId: string
  isDeletingAccount?: boolean
  language: AppLanguage
  onOpenAccount: (accountId: string) => void
  onOpenAvatarPicker: (accountId: string) => void
  onDeleteAccount: (account: WarpAccount) => void
  timeZone: TimeZonePreference
}

export function AccountManagementPanel({
  accounts,
  activeAccountId,
  isDeletingAccount = false,
  language,
  onDeleteAccount,
  onOpenAccount,
  onOpenAvatarPicker,
  timeZone,
}: AccountManagementPanelProps) {
  return (
    <section className="account-management-panel" aria-label="Accounts">
      {accounts.length > 0 ? (
        <div className="account-management-grid">
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId

            return (
              <article
                className={
                  isActive
                    ? 'account-management-card account-management-card-active'
                    : 'account-management-card'
                }
                key={account.id}
              >
                <div className="account-management-icon">
                  <button
                    aria-label={`Choose avatar for UID ${account.uid}`}
                    className="account-management-icon-button"
                    onClick={() => onOpenAvatarPicker(account.id)}
                    type="button"
                  >
                    <AccountAvatar avatarPath={account.avatarPath} />
                  </button>
                </div>
                <div className="account-management-copy">
                  <strong>UID {account.uid}</strong>
                  <span>{formatAccountMeta(account)}</span>
                  <span>{formatLastPull(account.lastPullAt, language, timeZone)}</span>
                </div>
                {isActive ? (
                  <span className="status-pill status-pill-success">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Active
                  </span>
                ) : (
                  <div className="account-management-actions">
                    <AppButton
                      disabled={isDeletingAccount}
                      onClick={() => onOpenAccount(account.id)}
                    >
                      Open
                    </AppButton>
                    <button
                      aria-label={`Move UID ${account.uid} to Trash`}
                      className="icon-button account-delete-button"
                      disabled={isDeletingAccount}
                      onClick={() => onDeleteAccount(account)}
                      title="Move account to Trash"
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="account-management-empty">
          <strong>No accounts yet</strong>
          <span>Import game history or manual notes to create a UID.</span>
        </div>
      )}
    </section>
  )
}

function formatAccountMeta(account: WarpAccount) {
  const pulls =
    account.totalPulls === 1 ? '1 pull' : `${account.totalPulls} pulls`
  const region = account.region ?? 'asia'

  return `${pulls} - ${region.toUpperCase()}`
}

function formatLastPull(
  value: string | undefined,
  language: AppLanguage,
  timeZone: TimeZonePreference,
) {
  if (!value) {
    return 'No saved pulls'
  }

  const formatted = formatDateTime(value, { language, timeZone })
  if (!formatted) {
    return 'Last pull time unavailable'
  }
  return `Last pull ${formatted}`
}
