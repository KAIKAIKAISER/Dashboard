const LOCAL_SEARCH_ICON_PATH = './img/icons/'
const LOCAL_SITE_ICON_PATH = './favicon.png'

const backgroundFallbacks = [
  'radial-gradient(circle at 18% 16%, rgba(89, 132, 190, 0.82) 0%, rgba(89, 132, 190, 0) 38%), radial-gradient(circle at 82% 78%, rgba(31, 78, 121, 0.7) 0%, rgba(31, 78, 121, 0) 42%), linear-gradient(145deg, #263b55 0%, #172238 48%, #0f1728 100%)',
  'radial-gradient(circle at 16% 22%, rgba(20, 184, 166, 0.82) 0%, rgba(20, 184, 166, 0) 34%), radial-gradient(circle at 80% 24%, rgba(59, 130, 246, 0.75) 0%, rgba(59, 130, 246, 0) 38%), linear-gradient(140deg, #102a43 0%, #183b56 48%, #132238 100%)',
  'radial-gradient(circle at 22% 18%, rgba(124, 58, 237, 0.75) 0%, rgba(124, 58, 237, 0) 36%), radial-gradient(circle at 76% 74%, rgba(14, 165, 233, 0.72) 0%, rgba(14, 165, 233, 0) 40%), linear-gradient(145deg, #172554 0%, #1e1b4b 52%, #111827 100%)',
  'radial-gradient(circle at 18% 72%, rgba(249, 115, 22, 0.7) 0%, rgba(249, 115, 22, 0) 38%), radial-gradient(circle at 78% 18%, rgba(236, 72, 153, 0.68) 0%, rgba(236, 72, 153, 0) 36%), linear-gradient(145deg, #312e81 0%, #3b1f4b 50%, #172033 100%)'
]

const stringHash = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const getBackgroundFallback = (source: string) => {
  if (source.includes('Rain.webm')) return backgroundFallbacks[0]
  return backgroundFallbacks[stringHash(source) % backgroundFallbacks.length]
}

const normalizeString = (value: string) => {
  let result = value.replace(
    /https:\/\/(?:cdn\.)?kongfandong\.cn\/(?:img\/search-icons|images\/icons)\/([a-z0-9-]+\.svg)/gi,
    `${LOCAL_SEARCH_ICON_PATH}$1`
  )

  if (/https:\/\/doc\.howdz\.xyz\/favicon\.ico/i.test(result)) {
    result = result.replace(/https:\/\/doc\.howdz\.xyz\/favicon\.ico/gi, LOCAL_SITE_ICON_PATH)
  }

  const usesRetiredThemeBackground =
    /https:\/\/(?:cdn\.)?kongfandong\.cn\/(?:Rain\.webm|api\/randomPhoto\/bing[^)]*)/i.test(result)
  const usesLegacyBingWallpaper = /https:\/\/cn\.bing\.com\/\/th\?id=/i.test(result)

  if (usesRetiredThemeBackground || usesLegacyBingWallpaper) {
    return getBackgroundFallback(result)
  }

  return result
}

type NormalizedResult<T> = {
  value: T
  changed: boolean
}

const normalizeValue = <T>(input: T): NormalizedResult<T> => {
  if (typeof input === 'string') {
    const value = normalizeString(input)
    return { value: value as T, changed: value !== input }
  }

  if (Array.isArray(input)) {
    let changed = false
    const value = input.map((item) => {
      const normalized = normalizeValue(item)
      changed ||= normalized.changed
      return normalized.value
    })
    return { value: (changed ? value : input) as T, changed }
  }

  if (input && typeof input === 'object') {
    let changed = false
    const value: Record<string, unknown> = {}
    Object.entries(input as Record<string, unknown>).forEach(([key, item]) => {
      const normalized = normalizeValue(item)
      changed ||= normalized.changed
      value[key] = normalized.value
    })
    return { value: (changed ? value : input) as T, changed }
  }

  return { value: input, changed: false }
}

export const normalizeThemeAssets = <T>(input: T): T => normalizeValue(input).value

export const migrateLegacyThemeAssets = (store: any) => {
  const statePayloads: Array<{ key: string; value: unknown }> = []
  const persistedThemeKeys = ['list', 'affix', 'tabList']

  persistedThemeKeys.forEach((key) => {
    const normalized = normalizeValue(store[key])
    if (normalized.changed) statePayloads.push({ key, value: normalized.value })
  })

  if (statePayloads.length) store.updateStates(statePayloads)

  const normalizedGlobal = normalizeValue(store.global)
  if (normalizedGlobal.changed) store.updateGlobal(normalizedGlobal.value)
}
