import { FileInput } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'

type DashboardEmptyStateProps = {
  isLoading: boolean
  onOpenImport: () => void
}

export function DashboardEmptyState({
  isLoading,
  onOpenImport,
}: DashboardEmptyStateProps) {
  return (
    <section className="dashboard-empty-state" aria-label="Dashboard setup">
      <div className="dashboard-empty-card">
        <div className="dashboard-empty-icon" aria-hidden="true">
          <FileInput size={28} />
        </div>
        <div className="dashboard-empty-copy">
          <span className="eyebrow">Start here</span>
          <h2>{isLoading ? 'Checking warp history' : 'No warp history yet'}</h2>
          <p>
            {isLoading
              ? 'Miku Warp is checking saved pulls for this account.'
              : 'Import your game history first. After pulls are saved, this dashboard will show banner progress, pity, rate-up stats, and recent results.'}
          </p>
        </div>
        <AppButton
          disabled={isLoading}
          icon={FileInput}
          onClick={onOpenImport}
        >
          {isLoading ? 'Checking history' : 'Import history'}
        </AppButton>
      </div>
    </section>
  )
}
