export function getCatalogAssetUrl(path?: string) {
  if (!path) {
    return undefined
  }

  if (/^https?:\/\//.test(path)) {
    return path
  }

  return `/${path.replace(/^\/+/, '')}`
}
