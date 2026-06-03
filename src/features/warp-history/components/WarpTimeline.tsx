import type { WarpPull } from '../domain/warp-pull'

type WarpTimelineProps = {
  pulls: WarpPull[]
}

export function WarpTimeline({ pulls }: WarpTimelineProps) {
  return (
    <section className="history-panel" aria-label="Warp history">
      <header className="panel-header">
        <h2>Recent pulls</h2>
        <span>{pulls.length} records</span>
      </header>
      <div className="warp-list">
        {pulls
          .slice()
          .reverse()
          .map((pull) => (
            <article className="warp-row" key={pull.id}>
              <div className={`warp-rarity warp-rarity-${pull.rarity}`}>
                {pull.rarity}
              </div>
              <div>
                <span className="warp-item-name">{pull.itemName}</span>
                <span className="warp-item-meta">{formatItemType(pull.itemType)}</span>
              </div>
              <time className="warp-time" dateTime={pull.pulledAt}>
                {formatPullTime(pull.pulledAt)}
              </time>
              <div className="warp-pity">
                <strong>{pull.pityFiveAtPull ? `Pity ${pull.pityFiveAtPull}` : '-'}</strong>
                <span>{formatSource(pull.source)}</span>
              </div>
            </article>
          ))}
      </div>
    </section>
  )
}

function formatPullTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatItemType(value: WarpPull['itemType']) {
  return value === 'light_cone' ? 'Light Cone' : 'Character'
}

function formatSource(value: WarpPull['source']) {
  if (value === 'game_history') {
    return 'Game history'
  }

  if (value === 'backup_restore') {
    return 'Backup'
  }

  return 'Manual'
}
