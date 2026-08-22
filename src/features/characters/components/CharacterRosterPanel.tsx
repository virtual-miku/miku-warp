import { useMemo, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useLocalization } from '../../settings/components/localization-context'
import type { RosterCharacter } from '../../persistence/data/character-roster'
import { getCharacterPath } from '../../warp-history/data/character-meta'

type CharacterRosterPanelProps = {
  roster: RosterCharacter[] | undefined
  isLoading: boolean
  isImporting: boolean
  error?: string
  onImport: (payload: string) => void
}

const ELEMENT_ORDER = [
  'physical',
  'fire',
  'ice',
  'wind',
  'lightning',
  'quantum',
  'imaginary',
]

const PATH_ORDER = [
  'Destruction',
  'The Hunt',
  'Erudition',
  'Harmony',
  'Nihility',
  'Preservation',
  'Abundance',
  'Remembrance',
  'Elation',
]

export function CharacterRosterPanel({
  roster,
  isLoading,
  isImporting,
  error,
  onImport,
}: CharacterRosterPanelProps) {
  const { t } = useLocalization()
  const [draft, setDraft] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [elementFilter, setElementFilter] = useState<string>('all')
  const [pathFilter, setPathFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const hasRoster = roster !== undefined && roster.length > 0
  const showInput = showForm || !hasRoster

  const elements = useMemo(() => {
    if (!roster) {
      return []
    }
    const seen = new Set(roster.map((character) => character.element))
    return ELEMENT_ORDER.filter((element) => seen.has(element))
  }, [roster])

  const paths = useMemo(() => {
    if (!roster) {
      return []
    }
    const seen = new Set<string>()
    for (const character of roster) {
      const path = getCharacterPath(character.id)
      if (path) {
        seen.add(path.name)
      }
    }
    return PATH_ORDER.filter((name) => seen.has(name))
  }, [roster])

  const visibleCharacters = useMemo(() => {
    if (!roster) {
      return []
    }
    const query = searchQuery.trim().toLowerCase()
    return roster.filter((character) => {
      if (elementFilter !== 'all' && character.element !== elementFilter) {
        return false
      }
      if (pathFilter !== 'all') {
        const path = getCharacterPath(character.id)
        if (!path || path.name !== pathFilter) {
          return false
        }
      }
      if (query && !character.name.toLowerCase().includes(query)) {
        return false
      }
      return true
    })
  }, [roster, elementFilter, pathFilter, searchQuery])

  const handleImport = () => {
    const payload = draft.trim()
    if (!payload || isImporting) {
      return
    }
    onImport(payload)
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>{t('nav.characters')}</h1>
        </div>
      </header>
      <section className="workspace-panel-page">
        <div className="roster-panel">
          {hasRoster ? (
            <header className="panel-header roster-header">
              <h2>
                {t('roster.title')} · {roster.length}
              </h2>
              <div className="roster-header-actions">
                <input
                  aria-label={t('roster.searchPlaceholder')}
                  className="roster-search"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('roster.searchPlaceholder')}
                  type="search"
                  value={searchQuery}
                />
                <button
                  className="roster-refresh"
                  disabled={isLoading}
                  onClick={() => setShowForm(true)}
                  type="button"
                >
                  {t('roster.reimport')}
                </button>
              </div>
            </header>
          ) : null}

          {isLoading && !roster ? (
            <p className="roster-empty">{t('roster.loading')}</p>
          ) : null}

          {showInput ? (
            <div className="roster-input-panel">
              <h3>{t('roster.howToTitle')}</h3>
              <ol className="roster-steps">
                <li>{t('roster.howToStep1')}</li>
                <li>{t('roster.howToStep2')}</li>
                <li>{t('roster.howToStep3')}</li>
                <li>{t('roster.howToStep4')}</li>
                <li>{t('roster.howToStep5')}</li>
              </ol>
              <textarea
                aria-label={t('roster.pastePlaceholder')}
                className="roster-textarea"
                disabled={isImporting}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('roster.pastePlaceholder')}
                rows={8}
                value={draft}
              />
              <div className="roster-input-actions">
                {hasRoster ? (
                  <button
                    className="roster-cancel"
                    disabled={isImporting}
                    onClick={() => setShowForm(false)}
                    type="button"
                  >
                    {t('common.cancel')}
                  </button>
                ) : null}
                <button
                  className="roster-import"
                  disabled={isImporting || draft.trim().length === 0}
                  onClick={handleImport}
                  type="button"
                >
                  {isImporting ? t('roster.importing') : t('roster.import')}
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p className="roster-error">{error}</p> : null}

          {hasRoster && !showInput ? (
            <>
              {elements.length > 0 ? (
                <div className="roster-filters">
                  <button
                    aria-pressed={elementFilter === 'all'}
                    className={
                      elementFilter === 'all'
                        ? 'roster-filter roster-filter-active'
                        : 'roster-filter'
                    }
                    onClick={() => setElementFilter('all')}
                    type="button"
                  >
                    {t('common.all')}
                  </button>
                  {elements.map((element) => (
                    <button
                      aria-pressed={elementFilter === element}
                      className={
                        elementFilter === element
                          ? 'roster-filter roster-filter-active'
                          : 'roster-filter'
                      }
                      key={element}
                      onClick={() => setElementFilter(element)}
                      title={capitalize(element)}
                      type="button"
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        className="roster-filter-icon"
                        src={elementIconPath(element)}
                      />
                      {capitalize(element)}
                    </button>
                  ))}
                </div>
              ) : null}

              {paths.length > 0 ? (
                <div className="roster-filters">
                  <button
                    aria-pressed={pathFilter === 'all'}
                    className={
                      pathFilter === 'all'
                        ? 'roster-filter roster-filter-active'
                        : 'roster-filter'
                    }
                    onClick={() => setPathFilter('all')}
                    type="button"
                  >
                    {t('common.all')}
                  </button>
                  {paths.map((path) => (
                    <button
                      aria-pressed={pathFilter === path}
                      className={
                        pathFilter === path
                          ? 'roster-filter roster-filter-active'
                          : 'roster-filter'
                      }
                      key={path}
                      onClick={() => setPathFilter(path)}
                      title={path}
                      type="button"
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        className="roster-filter-icon"
                        src={pathFilterIconSrc(path)}
                      />
                      {path}
                    </button>
                  ))}
                </div>
              ) : null}

              {visibleCharacters.length === 0 ? (
                <p className="roster-empty">{t('roster.noMatches')}</p>
              ) : (
                <div className="roster-grid">
                  {visibleCharacters.map((character) => (
                    <CharacterCard character={character} key={character.id} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </>
  )
}

function CharacterCard({ character }: { character: RosterCharacter }) {
  const { t } = useLocalization()
  const portrait = resolveImageSrc(character.portrait)
  const rarityClass = character.rarity >= 5 ? 'rarity-5' : 'rarity-4'
  const path = getCharacterPath(character.id)

  return (
    <article className={`roster-card ${rarityClass}`}>
      {portrait ? (
        <img
          alt={character.name}
          className="roster-avatar"
          loading="lazy"
          src={portrait}
        />
      ) : (
        <div className="roster-portrait-fallback roster-avatar">
          {character.name.slice(0, 1)}
        </div>
      )}

      <div className="roster-card-attr">
        <span
          aria-label={character.element}
          className="roster-attr-badge"
          title={capitalize(character.element)}
        >
          <img
            alt=""
            aria-hidden="true"
            className="roster-attr-icon"
            src={elementIconPath(character.element)}
          />
        </span>
        {path ? (
          <span className="roster-attr-badge" title={path.name}>
            <img
              alt=""
              aria-hidden="true"
              className="roster-attr-icon"
              src={pathIconSrc(path.icon)}
            />
          </span>
        ) : null}
      </div>

      <div className="roster-card-footer">
        <strong className="roster-name">{character.name}</strong>
        <div className="roster-level-row">
          <span>
            {t('roster.level')} {character.level}
          </span>
          {character.eidolon > 0 ? (
            <span
              className="roster-eidolon"
              title={`${t('roster.eidolon')} ${character.eidolon}`}
            >
              E{character.eidolon}
            </span>
          ) : null}
        </div>
        {character.lightCone ? (
          <div className="roster-lc-row">
            <img
              alt=""
              className="roster-lc-icon"
              src={resolveImageSrc(character.lightCone.icon)}
            />
            <span className="roster-lc-name">{character.lightCone.name}</span>
            {character.lightCone.superimpose > 0 ? (
              <span
                className="roster-lc-meta"
                title={`${t('roster.superimposeFull')} ${character.lightCone.superimpose}`}
              >
                S{character.lightCone.superimpose}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="roster-lc-row roster-lc-empty">
            {t('roster.noLightCone')}
          </div>
        )}
      </div>
    </article>
  )
}

function resolveImageSrc(pathOrUrl: string) {
  if (!pathOrUrl) {
    return ''
  }
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  return convertFileSrc(pathOrUrl)
}

function pathIconSrc(iconPath: string) {
  if (!iconPath) {
    return ''
  }
  // StarRailRes stores icons relative to the repo root (icon/path/X.png).
  return `/${iconPath}`
}

function pathIconName(pathName: string) {
  switch (pathName) {
    case 'The Hunt':
      return 'Hunt.png'
    default:
      return `${pathName}.png`
  }
}

function pathFilterIconSrc(pathName: string) {
  return `/icon/path/${pathIconName(pathName)}`
}

function capitalize(value: string) {
  if (!value) {
    return value
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function elementIconPath(element: string) {
  switch (element) {
    case 'fire':
      return '/icon/element/Fire.png'
    case 'ice':
      return '/icon/element/Ice.png'
    case 'wind':
      return '/icon/element/Wind.png'
    case 'lightning':
      return '/icon/element/Thunder.png'
    case 'quantum':
      return '/icon/element/Quantum.png'
    case 'imaginary':
      return '/icon/element/Imaginary.png'
    case 'physical':
      return '/icon/element/Physical.png'
    default:
      return ''
  }
}

export function elementColor(element: string) {
  switch (element) {
    case 'physical':
      return '#B2ADAD'
    case 'fire':
      return '#F84F36'
    case 'ice':
      return '#47C7FD'
    case 'wind':
      return '#46DE9D'
    case 'lightning':
      return '#DF54FF'
    case 'imaginary':
      return '#FFEB61'
    case 'quantum':
      return '#6E67D0'
    default:
      return '#888'
  }
}
