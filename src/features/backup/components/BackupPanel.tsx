import { Cloud, KeyRound } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'

export function BackupPanel() {
  return (
    <section className="tool-panel" id="backup" aria-label="Google Drive backup">
      <header className="panel-header">
        <h2>Backup</h2>
        <span className="status-pill">Drive disconnected</span>
      </header>
      <div className="tool-panel-body">
        <div className="tool-row">
          <div>
            <strong>Google Drive</strong>
            <span>Encrypted snapshot</span>
          </div>
          <AppButton icon={KeyRound}>Connect</AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Last backup</strong>
            <span>Not created</span>
          </div>
          <AppButton icon={Cloud} variant="ghost">
            Backup
          </AppButton>
        </div>
      </div>
    </section>
  )
}

