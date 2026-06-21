import { CheckCircle2, Trash2 } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { WarpAccount } from '../../persistence/data/warp-pull-history'
import { AccountAvatar } from './AccountAvatar'

type AccountManagementPanelProps = {
  accounts: WarpAccount[]
  activeAccountId: string
  isDeletingAccount?: boolean
  onOpenAccount: (accountId: string) => void
  onOpenAvatarPicker: (accountId: string) => void
  onDeleteAccount: (account: WarpAccount) => void
}

export function AccountManagementPanel({
  accounts,
  activeAccountId,
  isDeletingAccount = false,
  onDeleteAccount,
  onOpenAccount,
  onOpenAvatarPicker,
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
                  <span>{formatLastPull(account.lastPullAt)}</span>
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

function formatLastPull(value: string | undefined) {
  if (!value) {
    return 'No saved pulls'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Last pull time unavailable'
  }

  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const timeLabel = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':')

  return `Last pull ${dateLabel}, ${timeLabel}`
}
