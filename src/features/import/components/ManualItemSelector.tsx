import { useMemo, useState } from 'react'
import {
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import { getCatalogAssetUrl } from '../../warp-history/data/catalog-assets'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import {
  bannerDefinitions,
  getFiveStarHardPity,
  type BannerType,
} from '../../warp-history/domain/banner'
import type { WarpItem } from '../../warp-history/domain/warp-item'
import { getPityLevelClass } from '../../warp-history/domain/pity-level'
import { type ManualItemSelection } from '../domain/manual-item-selector'
import type { TimeZonePreference } from '../../settings/domain/localization'
import { formatDateTimeLocalInput } from '../../../shared/lib/date-time'
import { useLocalization } from '../../settings/components/localization-context'
import { getLocalizedBannerLabel } from '../../settings/domain/localized-labels'

type CatalogItemTypeFilter = WarpItem['itemType'] | 'all'
type CatalogMode = 'add' | 'edit'

type ManualItemSelectorProps = {
  fallbackBannerType: BannerType
  onChange: (selections: ManualItemSelection[]) => void
  selections: ManualItemSelection[]
  timeZone: TimeZonePreference
}

const sortedCatalogItems = [...itemCatalog].sort(
  (left, right) =>
    right.rarity - left.rarity ||
    left.itemType.localeCompare(right.itemType) ||
    left.name.localeCompare(right.name),
)

export function ManualItemSelector({
  fallbackBannerType,
  onChange,
  selections,
  timeZone,
}: ManualItemSelectorProps) {
  const { t } = useLocalization()
  const [catalogMode, setCatalogMode] = useState<CatalogMode>()
  const [editingSelection, setEditingSelection] =
    useState<ManualItemSelection>()

  const handleCatalogItemSelect = (item: WarpItem) => {
    if (catalogMode === 'edit' && editingSelection) {
      setEditingSelection({
        ...editingSelection,
        bannerType: getCompatibleBannerType(
          item,
          editingSelection.bannerType,
        ),
        item,
      })
      setCatalogMode(undefined)
      return
    }

    const now = formatDateTimeLocalInput(new Date(), timeZone)
    const selection: ManualItemSelection = {
      bannerType: getCompatibleBannerType(item, fallbackBannerType),
      id: createSelectionId(selections.length),
      item,
      pity: 1,
      pulledAt: now,
    }

    onChange([...selections, selection])
    setCatalogMode(undefined)
  }

  const handleSaveEdit = () => {
    if (!editingSelection) {
      return
    }

    const maxPity = getSelectionMaxPity(editingSelection)
    const nextSelection = {
      ...editingSelection,
      pity: clampPity(editingSelection.pity, maxPity),
    }

    onChange(
      selections.map((selection) =>
        selection.id === nextSelection.id ? nextSelection : selection,
      ),
    )
    setEditingSelection(undefined)
  }

  const handleDeleteEdit = () => {
    if (!editingSelection) {
      return
    }

    onChange(
      selections.filter(
        (selection) => selection.id !== editingSelection.id,
      ),
    )
    setEditingSelection(undefined)
  }

  return (
    <>
      <section
        aria-label={t('selector.ariaLabel')}
        className="manual-selector-editor"
      >
        <header className="manual-selector-header">
          <div>
            <strong>{t('selector.selectedPulls')}</strong>
            <span>{t('selector.selectedHint')}</span>
          </div>
          <AppButton icon={Plus} onClick={() => setCatalogMode('add')}>
            {t('selector.addItem')}
          </AppButton>
        </header>

        {selections.length > 0 ? (
          <div
            aria-label={t('selector.galleryAria')}
            className="manual-selector-gallery"
          >
            {selections.map((selection) => (
              <button
                aria-label={t('selector.editAria', {
                  item: selection.item.name,
                  pity: selection.pity,
                })}
                className={`manual-selector-result manual-selector-result-${selection.item.rarity}`}
                key={selection.id}
                onClick={() => setEditingSelection({ ...selection })}
                title={t('results.pityTitle', {
                  item: selection.item.name,
                  pity: selection.pity,
                })}
                type="button"
              >
                <CatalogItemIcon item={selection.item} />
                <strong
                  className={`manual-selector-result-pity ${getPityLevelClass(
                    selection.pity,
                    getSelectionMaxPity(selection),
                  )}`}
                >
                  {selection.pity}
                </strong>
              </button>
            ))}
          </div>
        ) : (
          <div className="manual-selector-empty">
            <strong>{t('selector.emptyTitle')}</strong>
            <span>{t('selector.emptyDetail')}</span>
          </div>
        )}
      </section>

      {editingSelection ? (
        <ManualSelectionEditDialog
          onChange={setEditingSelection}
          onChangeItem={() => setCatalogMode('edit')}
          onClose={() => setEditingSelection(undefined)}
          onDelete={handleDeleteEdit}
          onSave={handleSaveEdit}
          selection={editingSelection}
        />
      ) : null}

      {catalogMode ? (
        <ManualCatalogDialog
          onClose={() => setCatalogMode(undefined)}
          onSelect={handleCatalogItemSelect}
        />
      ) : null}
    </>
  )
}

function ManualCatalogDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void
  onSelect: (item: WarpItem) => void
}) {
  const { t } = useLocalization()
  const [itemTypeFilter, setItemTypeFilter] =
    useState<CatalogItemTypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('en-US')

    return sortedCatalogItems.filter(
      (item) =>
        (itemTypeFilter === 'all' || item.itemType === itemTypeFilter) &&
        (!normalizedQuery ||
          item.name.toLocaleLowerCase('en-US').includes(normalizedQuery)),
    )
  }, [itemTypeFilter, searchQuery])

  return (
    <div
      className="modal-backdrop manual-nested-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="manual-catalog-title"
        aria-modal="true"
        className="modal-panel manual-catalog-dialog"
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t('manual.selector')}</span>
            <h2 id="manual-catalog-title">{t('selector.chooseItem')}</h2>
          </div>
          <button
            aria-label={t('selector.close')}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="manual-catalog-toolbar">
          <label className="manual-catalog-search">
            <Search aria-hidden="true" size={16} />
            <input
              autoFocus
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('selector.search')}
              type="search"
              value={searchQuery}
            />
          </label>
          <div aria-label={t('selector.typeFilter')} className="manual-catalog-filters">
            {(
              [
                ['all', t('common.all')],
                ['character', t('selector.characters')],
                ['light_cone', t('selector.lightCones')],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={itemTypeFilter === value}
                className={
                  itemTypeFilter === value
                    ? 'manual-category-tab manual-category-tab-active'
                    : 'manual-category-tab'
                }
                key={value}
                onClick={() => setItemTypeFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          aria-label={t('selector.catalogAria')}
          className="manual-catalog-grid"
        >
          {filteredItems.map((item) => (
            <button
              aria-label={t('selector.addAria', { item: item.name })}
              className={`manual-catalog-option manual-catalog-option-${item.rarity}`}
              data-tooltip={item.name}
              key={item.id}
              onClick={() => onSelect(item)}
              title={item.name}
              type="button"
            >
              <CatalogItemIcon item={item} />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function ManualSelectionEditDialog({
  onChange,
  onChangeItem,
  onClose,
  onDelete,
  onSave,
  selection,
}: {
  onChange: (selection: ManualItemSelection) => void
  onChangeItem: () => void
  onClose: () => void
  onDelete: () => void
  onSave: () => void
  selection: ManualItemSelection
}) {
  const { t } = useLocalization()
  const maxPity = getSelectionMaxPity(selection)
  const hasValidDate = !Number.isNaN(new Date(selection.pulledAt).getTime())
  const canSave =
    hasValidDate && selection.pity >= 1 && selection.pity <= maxPity

  return (
    <div
      className="modal-backdrop manual-nested-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="manual-selection-edit-title"
        aria-modal="true"
        className="modal-panel manual-selection-edit-dialog"
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t('selector.selectedPull')}</span>
            <h2 id="manual-selection-edit-title">{t('selector.editResult')}</h2>
          </div>
          <button
            aria-label={t('selector.closeEditor')}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="manual-selection-edit-form">
          <button
            className="manual-selection-item-field"
            onClick={onChangeItem}
            type="button"
          >
            <CatalogItemIcon item={selection.item} />
            <span>
              <strong>{selection.item.name}</strong>
              <small>{t('selector.chooseAnother')}</small>
            </span>
          </button>

          <label>
            <span>{t('selector.banner')}</span>
            <select
              onChange={(event) =>
                onChange({
                  ...selection,
                  bannerType: event.target.value as BannerType,
                })
              }
              value={selection.bannerType}
            >
              {getCompatibleBannerDefinitions(selection.item).map((banner) => (
                <option key={banner.type} value={banner.type}>
                  {getLocalizedBannerLabel(t, banner.type)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('selector.dateTime')}</span>
            <input
              onChange={(event) =>
                onChange({ ...selection, pulledAt: event.target.value })
              }
              step="1"
              type="datetime-local"
              value={selection.pulledAt}
            />
          </label>

          <label>
            <span>{t('selector.pity')}</span>
            <input
              max={maxPity}
              min="1"
              onChange={(event) =>
                onChange({
                  ...selection,
                  pity: Number.parseInt(event.target.value, 10) || 1,
                })
              }
              type="number"
              value={selection.pity}
            />
            <small>
              {selection.item.rarity >= 4
                ? t('selector.allowedRange', { max: maxPity })
                : t('selector.pityVisibility')}
            </small>
          </label>
        </div>

        <footer className="manual-selection-edit-actions">
          <AppButton icon={Trash2} onClick={onDelete} variant="ghost">
            {t('selector.remove')}
          </AppButton>
          <div>
            <AppButton onClick={onClose} variant="ghost">
              {t('common.cancel')}
            </AppButton>
            <AppButton disabled={!canSave} icon={Save} onClick={onSave}>
              {t('selector.saveChanges')}
            </AppButton>
          </div>
        </footer>
      </section>
    </div>
  )
}

function CatalogItemIcon({ item }: { item: WarpItem }) {
  const [hasImageError, setHasImageError] = useState(false)
  const iconUrl = getCatalogAssetUrl(item.iconPath)

  return iconUrl && !hasImageError ? (
    <img
      alt=""
      loading="lazy"
      onError={() => setHasImageError(true)}
      src={iconUrl}
    />
  ) : (
    <span>{item.rarity}*</span>
  )
}

function createSelectionId(selectionCount: number) {
  return globalThis.crypto?.randomUUID?.() ??
    `manual-selection-${Date.now()}-${selectionCount + 1}`
}

function getCompatibleBannerType(
  item: WarpItem,
  preferredBannerType: BannerType,
): BannerType {
  if (item.itemType === 'light_cone') {
    if (preferredBannerType === 'collaboration_character') {
      return 'collaboration_light_cone'
    }

    if (preferredBannerType === 'character_event') {
      return 'light_cone_event'
    }

    return preferredBannerType
  }

  if (preferredBannerType === 'collaboration_light_cone') {
    return 'collaboration_character'
  }

  if (preferredBannerType === 'light_cone_event') {
    return 'character_event'
  }

  return preferredBannerType
}

function getCompatibleBannerDefinitions(item: WarpItem) {
  return bannerDefinitions.filter((banner) => {
    if (item.itemType === 'light_cone') {
      return (
        banner.type === 'departure' ||
        banner.type === 'standard' ||
        banner.type === 'light_cone_event' ||
        banner.type === 'collaboration_light_cone'
      )
    }

    return (
      banner.type === 'departure' ||
      banner.type === 'standard' ||
      banner.type === 'character_event' ||
      banner.type === 'collaboration_character'
    )
  })
}

function getSelectionMaxPity(selection: ManualItemSelection) {
  if (selection.item.rarity === 4) {
    return 10
  }

  if (selection.item.rarity === 5) {
    return getFiveStarHardPity(selection.bannerType)
  }

  return 999
}

function clampPity(value: number, maxPity: number) {
  return Math.min(maxPity, Math.max(1, Math.trunc(value)))
}
