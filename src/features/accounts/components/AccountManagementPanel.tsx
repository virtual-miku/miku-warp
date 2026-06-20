import { CheckCircle2 } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { WarpAccount } from '../../persistence/data/warp-pull-history'
import { AccountAvatar } from './AccountAvatar'

type AccountManagementPanelProps = {
  accounts: WarpAccount[]
  activeAccountId: string
  onOpenAccount: (accountId: string) => void
  onOpenAvatarPicker: (accountId: string) => void
}

export function AccountManagementPanel({
  accounts,
  activeAccountId,
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
                  <AppButton onClick={() => onOpenAccount(account.id)}>
                    Open
                  </AppButton>
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
  const timeLabel = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)

  return `Last pull ${dateLabel}, ${timeLabel}`
}
