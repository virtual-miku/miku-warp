import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { WarpAccount } from '../../persistence/data/warp-pull-history'
import { AppButton } from '../../../shared/ui/AppButton'
import { AccountAvatar } from './AccountAvatar'
import type { AccountAvatarOption } from '../data/account-avatar-options'
import { useLocalization } from '../../settings/components/localization-context'

type AccountAvatarDialogProps = {
  account?: WarpAccount
  avatars: AccountAvatarOption[]
  error?: string
  isOpen: boolean
  isSaving: boolean
  onClose: () => void
  onSelectAvatar: (avatarPath: string | undefined) => void
}

export function AccountAvatarDialog({
  account,
  avatars,
  error,
  isOpen,
  isSaving,
  onClose,
  onSelectAvatar,
}: AccountAvatarDialogProps) {
  const { t } = useLocalization()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !account) {
    return null
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="account-avatar-dialog-title"
        aria-modal="true"
        className="modal-panel account-avatar-dialog"
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">UID {account.uid}</span>
            <h2 id="account-avatar-dialog-title">{t('avatar.choose')}</h2>
          </div>
          <button
            aria-label={t('avatar.closePicker')}
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="account-avatar-dialog-content">
          <div className="account-avatar-dialog-actions">
            <AppButton
              disabled={isSaving || !account.avatarPath}
              onClick={() => onSelectAvatar(undefined)}
              variant="ghost"
            >
              {t('avatar.useDefault')}
            </AppButton>
          </div>
          {error ? (
            <div className="backup-message backup-message-error" role="alert">
              <strong>{t('avatar.error')}</strong>
              <p>{error}</p>
            </div>
          ) : null}
          {avatars.length > 0 ? (
            <div className="account-avatar-grid">
              {avatars.map((avatar) => {
                const isSelected = account.avatarPath === avatar.path

                return (
                  <button
                    aria-label={avatar.label}
                    aria-pressed={isSelected}
                    className={
                      isSelected
                        ? 'account-avatar-option account-avatar-option-active'
                        : 'account-avatar-option'
                    }
                    disabled={isSaving}
                    key={avatar.path}
                    onClick={() => onSelectAvatar(avatar.path)}
                    title={avatar.label}
                    type="button"
                  >
                    <AccountAvatar avatarPath={avatar.path} fallbackSize={18} />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="account-management-empty">
              <strong>{t('avatar.empty.title')}</strong>
              <span>{t('avatar.empty.detail')}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
