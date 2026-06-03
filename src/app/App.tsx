import { useMemo, useState } from 'react'
import {
  Bell,
  Cloud,
  Database,
  Download,
  RefreshCw,
  Settings,
  Upload,
} from 'lucide-react'
import { BackupPanel } from '../features/backup/components/BackupPanel'
import { ImportPanel } from '../features/import/components/ImportPanel'
import { ManualImportDialog } from '../features/import/components/ManualImportDialog'
import { manualNoteSample } from '../features/import/data/manual-note-sample'
import { parseManualWarpNote } from '../features/import/domain/manual-note-parser'
import { BannerTabs } from '../features/warp-history/components/BannerTabs'
import { PityOverview } from '../features/warp-history/components/PityOverview'
import { WarpTimeline } from '../features/warp-history/components/WarpTimeline'
import { itemCatalog } from '../features/warp-history/data/item-catalog'
import { getBannerLabel } from '../features/warp-history/domain/banner'
import { calculatePitySummary } from '../features/warp-history/domain/pity'
import { demoPulls } from '../features/warp-history/data/demo-pulls'
import { AppButton } from '../shared/ui/AppButton'
import './App.css'

const activeBannerType = 'character_event'
const activePulls = demoPulls.filter((pull) => pull.bannerType === activeBannerType)
const pitySummary = calculatePitySummary(activePulls)

export function App() {
  const [manualImportOpen, setManualImportOpen] = useState(false)
  const [manualNoteDraft, setManualNoteDraft] = useState(manualNoteSample)
  const manualImportPreview = useMemo(
    () => parseManualWarpNote(manualNoteDraft, itemCatalog),
    [manualNoteDraft],
  )

  return (
    <>
      <main className="app-shell">
        <aside className="sidebar" aria-label="Workspace">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              WT
            </div>
            <div>
              <strong>Warp Tracker</strong>
              <span>Honkai: Star Rail</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            <a className="sidebar-link sidebar-link-active" href="#history">
              <Database size={18} aria-hidden="true" />
              History
            </a>
            <a className="sidebar-link" href="#import">
              <Upload size={18} aria-hidden="true" />
              Import
            </a>
            <a className="sidebar-link" href="#backup">
              <Cloud size={18} aria-hidden="true" />
              Backup
            </a>
          </nav>

          <section className="account-panel" aria-label="Selected account">
            <span className="eyebrow">Active UID</span>
            <strong>800000000</strong>
            <span>Asia server</span>
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-header">
            <div>
              <span className="eyebrow">Selected banner</span>
              <h1>{getBannerLabel(activeBannerType)}</h1>
            </div>
            <div className="header-actions" aria-label="Quick actions">
              <AppButton icon={RefreshCw}>Sync</AppButton>
              <AppButton icon={Download}>Export</AppButton>
              <AppButton icon={Settings} variant="ghost">
                Settings
              </AppButton>
            </div>
          </header>

          <BannerTabs activeBannerType={activeBannerType} />

          <section className="content-grid">
            <div className="primary-column" id="history">
              <PityOverview summary={pitySummary} />
              <WarpTimeline pulls={activePulls} />
            </div>

            <aside className="side-column" aria-label="Import and backup">
              <ImportPanel
                manualImportPreview={manualImportPreview}
                onOpenManualImport={() => setManualImportOpen(true)}
              />
              <BackupPanel />
              <section className="notice-panel" aria-label="Reminder">
                <div className="notice-icon" aria-hidden="true">
                  <Bell size={18} />
                </div>
                <div>
                  <strong>History window</strong>
                  <span>No reminder set</span>
                </div>
              </section>
            </aside>
          </section>
        </section>
      </main>

      <ManualImportDialog
        isOpen={manualImportOpen}
        note={manualNoteDraft}
        onClose={() => setManualImportOpen(false)}
        onNoteChange={setManualNoteDraft}
        preview={manualImportPreview}
      />
    </>
  )
}

export default App
