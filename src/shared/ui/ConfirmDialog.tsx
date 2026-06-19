import { useEffect, useRef } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { AppButton } from './AppButton'

type ConfirmDialogProps = {
  confirmLabel: string
  description: string
  isOpen: boolean
  isPending?: boolean
  title: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  confirmLabel,
  description,
  isOpen,
  isPending = false,
  title,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    cancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isPending, onCancel])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="modal-backdrop confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onCancel()
        }
      }}
    >
      <section
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="modal-panel confirm-dialog"
        role="alertdialog"
      >
        <header className="confirm-dialog-header">
          <div className="confirm-dialog-icon" aria-hidden="true">
            <AlertTriangle size={20} />
          </div>
          <button
            aria-label="Close confirmation"
            className="icon-button"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="confirm-dialog-content">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-description">{description}</p>
        </div>

        <footer className="confirm-dialog-actions">
          <AppButton
            disabled={isPending}
            onClick={onCancel}
            ref={cancelButtonRef}
            variant="ghost"
          >
            Cancel
          </AppButton>
          <AppButton
            className="app-button-danger"
            disabled={isPending}
            icon={Trash2}
            onClick={onConfirm}
          >
            {isPending ? 'Deleting' : confirmLabel}
          </AppButton>
        </footer>
      </section>
    </div>
  )
}
