import { CheckCircle2, Trash2 } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { WarpAccount } from '../../persistence/data/warp-pull-history'
import { AccountAvatar } from './AccountAvatar'
import type {
  AppLanguage,
  TimeZonePreference,
} from '../../settings/domain/localization'
import { formatDateTime } from '../../../shared/lib/date-time'
import { useLocalization } from '../../settings/components/localization-context'
import { formatLocalizedPullCount } from '../../settings/domain/localized-labels'

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
  const { t } = useLocalization()
  return (
    <section className="account-management-panel" aria-label={t('accounts.ariaLabel')}>
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
                    aria-label={t('accounts.chooseAvatar', { uid: account.uid })}
                    className="account-management-icon-button"
                    onClick={() => onOpenAvatarPicker(account.id)}
                    type="button"
                  >
                    <AccountAvatar avatarPath={account.avatarPath} />
                  </button>
                </div>
                <div className="account-management-copy">
                  <strong>UID {account.uid}</strong>
                  <span>{formatAccountMeta(account, t)}</span>
                  <span>{formatLastPull(account.lastPullAt, language, timeZone, t)}</span>
                </div>
                {isActive ? (
                  <span className="status-pill status-pill-success">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {t('accounts.active')}
                  </span>
                ) : (
                  <div className="account-management-actions">
                    <AppButton
                      disabled={isDeletingAccount}
                      onClick={() => onOpenAccount(account.id)}
                    >
                      {t('common.open')}
                    </AppButton>
                    <button
                      aria-label={t('accounts.moveToTrash', { uid: account.uid })}
                      className="icon-button account-delete-button"
                      disabled={isDeletingAccount}
                      onClick={() => onDeleteAccount(account)}
                      title={t('accounts.moveToTrashTitle')}
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
          <strong>{t('accounts.empty.title')}</strong>
          <span>{t('accounts.empty.detail')}</span>
        </div>
      )}
    </section>
  )
}

function formatAccountMeta(account: WarpAccount, t: ReturnType<typeof useLocalization>['t']) {
  const pulls = formatLocalizedPullCount(t, account.totalPulls)
  const region = account.region ?? 'asia'

  return `${pulls} - ${region.toUpperCase()}`
}

function formatLastPull(
  value: string | undefined,
  language: AppLanguage,
  timeZone: TimeZonePreference,
  t: ReturnType<typeof useLocalization>['t'],
) {
  if (!value) {
    return t('accounts.noSavedPulls')
  }

  const formatted = formatDateTime(value, { language, timeZone })
  if (!formatted) {
    return t('accounts.lastPullUnavailable')
  }
  return t('accounts.lastPull', { date: formatted })
}
