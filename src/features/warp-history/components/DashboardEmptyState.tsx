import { FileInput } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import { useLocalization } from '../../settings/components/localization-context'

type DashboardEmptyStateProps = {
  isLoading: boolean
  onOpenImport: () => void
}

export function DashboardEmptyState({
  isLoading,
  onOpenImport,
}: DashboardEmptyStateProps) {
  const { t } = useLocalization()
  return (
    <section className="dashboard-empty-state" aria-label={t('dashboard.setupAria')}>
      <div className="dashboard-empty-card">
        <div className="dashboard-empty-icon" aria-hidden="true">
          <FileInput size={28} />
        </div>
        <div className="dashboard-empty-copy">
          <span className="eyebrow">{t('dashboard.startHere')}</span>
          <h2>{isLoading ? t('dashboard.checkingTitle') : t('dashboard.emptyTitle')}</h2>
          <p>
            {isLoading
              ? t('dashboard.checkingDetail')
              : t('dashboard.emptyDetail')}
          </p>
        </div>
        <AppButton
          disabled={isLoading}
          icon={FileInput}
          onClick={onOpenImport}
        >
          {isLoading ? t('dashboard.checkingAction') : t('dashboard.importAction')}
        </AppButton>
      </div>
    </section>
  )
}
