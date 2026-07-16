import BaseTheme from '@/components/Global/DefaultThemeData/Base.json'
import MobileTheme from '@/components/Global/DefaultThemeData/Mobile.json'
import MobileProTheme from '@/components/Global/DefaultThemeData/MobilePro.json'
import ModuleTheme from '@/components/Global/DefaultThemeData/Module.json'
import MovieLinesTheme from '@/components/Global/DefaultThemeData/MovieLines.json'
import MultipleTheme from '@/components/Global/DefaultThemeData/Multiple.json'
import SimpleTheme from '@/components/Global/DefaultThemeData/Simple.json'
import TabsTheme from '@/components/Global/DefaultThemeData/Tabs.json'

const LOCAL_SEARCH_ICON_PATH = './img/icons/'
const LOCAL_SITE_ICON_PATH = './favicon.png'

// Version 1.9.0-7 mistakenly replaced working preset media URLs with one of
// these gradients. Keep the exact values only so that persisted data from that
// release can be repaired without touching user-created gradients.
const legacyBackgroundFallbacks = new Set([
  'radial-gradient(circle at 18% 16%, rgba(89, 132, 190, 0.82) 0%, rgba(89, 132, 190, 0) 38%), radial-gradient(circle at 82% 78%, rgba(31, 78, 121, 0.7) 0%, rgba(31, 78, 121, 0) 42%), linear-gradient(145deg, #263b55 0%, #172238 48%, #0f1728 100%)',
  'radial-gradient(circle at 16% 22%, rgba(20, 184, 166, 0.82) 0%, rgba(20, 184, 166, 0) 34%), radial-gradient(circle at 80% 24%, rgba(59, 130, 246, 0.75) 0%, rgba(59, 130, 246, 0) 38%), linear-gradient(140deg, #102a43 0%, #183b56 48%, #132238 100%)',
  'radial-gradient(circle at 22% 18%, rgba(124, 58, 237, 0.75) 0%, rgba(124, 58, 237, 0) 36%), radial-gradient(circle at 76% 74%, rgba(14, 165, 233, 0.72) 0%, rgba(14, 165, 233, 0) 40%), linear-gradient(145deg, #172554 0%, #1e1b4b 52%, #111827 100%)',
  'radial-gradient(circle at 18% 72%, rgba(249, 115, 22, 0.7) 0%, rgba(249, 115, 22, 0) 38%), radial-gradient(circle at 78% 18%, rgba(236, 72, 153, 0.68) 0%, rgba(236, 72, 153, 0) 36%), linear-gradient(145deg, #312e81 0%, #3b1f4b 50%, #172033 100%)'
])

const presetThemes: any[] = [
  BaseTheme,
  MobileTheme,
  MobileProTheme,
  ModuleTheme,
  MovieLinesTheme,
  MultipleTheme,
  SimpleTheme,
  TabsTheme
]

const defaultRecoveredBackground =
  '#242428 url(https://kongfandong.cn/api/randomPhoto/bing?duration=120) center center / cover'

const isObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isLegacyBackgroundFallback = (value: unknown): value is string =>
  typeof value === 'string' && legacyBackgroundFallbacks.has(value)

const normalizeString = (value: string) => {
  let result = value.replace(
    /https:\/\/(?:cdn\.)?kongfandong\.cn\/(?:img\/search-icons|images\/icons)\/([a-z0-9-]+\.svg)/gi,
    `${LOCAL_SEARCH_ICON_PATH}$1`
  )

  if (/https:\/\/doc\.howdz\.xyz\/favicon\.ico/i.test(result)) {
    result = result.replace(/https:\/\/doc\.howdz\.xyz\/favicon\.ico/gi, LOCAL_SITE_ICON_PATH)
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

  if (isObject(input)) {
    let changed = false
    const value: Record<string, unknown> = {}
    Object.entries(input).forEach(([key, item]) => {
      const normalized = normalizeValue(item)
      changed ||= normalized.changed
      value[key] = normalized.value
    })
    return { value: (changed ? value : input) as T, changed }
  }

  return { value: input, changed: false }
}

const presetItemsById = new Map<string, Record<string, any>[]>()

const indexPresetItems = (input: unknown) => {
  if (Array.isArray(input)) {
    input.forEach(indexPresetItems)
    return
  }
  if (!isObject(input)) return

  if (typeof input.i === 'string') {
    const items = presetItemsById.get(input.i) || []
    items.push(input)
    presetItemsById.set(input.i, items)
  }
  Object.values(input).forEach(indexPresetItems)
}

presetThemes.forEach(indexPresetItems)

const countTemplateRepairs = (current: unknown, template: unknown): number => {
  if (isLegacyBackgroundFallback(current)) {
    return typeof template === 'string' && template.includes('url(') ? 1 : 0
  }
  if (Array.isArray(current) && Array.isArray(template)) {
    return current.reduce((count, item, index) => count + countTemplateRepairs(item, template[index]), 0)
  }
  if (isObject(current) && isObject(template)) {
    return Object.entries(current).reduce(
      (count, [key, value]) => count + countTemplateRepairs(value, template[key]),
      0
    )
  }
  return 0
}

const repairFromTemplate = (current: unknown, template: unknown): NormalizedResult<unknown> => {
  if (isLegacyBackgroundFallback(current)) {
    if (typeof template === 'string' && template.includes('url(')) {
      return { value: template, changed: true }
    }
    return { value: current, changed: false }
  }

  if (Array.isArray(current)) {
    let changed = false
    const templateList = Array.isArray(template) ? template : []
    const value = current.map((item, index) => {
      const repaired = repairFromTemplate(item, templateList[index])
      changed ||= repaired.changed
      return repaired.value
    })
    return { value: changed ? value : current, changed }
  }

  if (isObject(current)) {
    let changed = false
    const templateObject = isObject(template) ? template : {}
    const value: Record<string, unknown> = {}
    Object.entries(current).forEach(([key, item]) => {
      const repaired = repairFromTemplate(item, templateObject[key])
      changed ||= repaired.changed
      value[key] = repaired.value
    })
    return { value: changed ? value : current, changed }
  }

  return { value: current, changed: false }
}

const repairPresetItems = <T>(input: T): NormalizedResult<T> => {
  if (Array.isArray(input)) {
    let changed = false
    const value = input.map((item) => {
      const repaired = repairPresetItems(item)
      changed ||= repaired.changed
      return repaired.value
    })
    return { value: (changed ? value : input) as T, changed }
  }

  if (!isObject(input)) return { value: input, changed: false }

  let current: Record<string, any> = input
  let changed = false
  if (typeof current.i === 'string') {
    const candidates = presetItemsById.get(current.i) || []
    const bestTemplate = candidates.reduce<{ template?: Record<string, any>; count: number }>(
      (best, template) => {
        const count = countTemplateRepairs(current, template)
        return count > best.count ? { template, count } : best
      },
      { count: 0 }
    )
    if (bestTemplate.template && bestTemplate.count) {
      const repaired = repairFromTemplate(current, bestTemplate.template)
      current = repaired.value as Record<string, any>
      changed = repaired.changed
    }
  }

  const value: Record<string, unknown> = {}
  Object.entries(current).forEach(([key, item]) => {
    const repaired = repairPresetItems(item)
    changed ||= repaired.changed
    value[key] = repaired.value
  })
  return { value: (changed ? value : input) as T, changed }
}

const collectItemIds = (input: unknown, ids = new Set<string>()) => {
  if (Array.isArray(input)) {
    input.forEach(item => collectItemIds(item, ids))
  } else if (isObject(input)) {
    if (typeof input.i === 'string') ids.add(input.i)
    Object.values(input).forEach(item => collectItemIds(item, ids))
  }
  return ids
}

const findMatchingPreset = (store: any) => {
  const storedIds = collectItemIds([store.list, store.affix, store.tabList])
  return presetThemes.reduce<{ theme?: any; score: number }>(
    (best, theme) => {
      const score = [...collectItemIds(theme)].filter(id => storedIds.has(id)).length
      return score > best.score ? { theme, score } : best
    },
    { score: 0 }
  ).theme
}

export const normalizeThemeAssets = <T>(input: T): T => normalizeValue(input).value

export const migrateLegacyThemeAssets = (store: any) => {
  const statePayloads: Array<{ key: string; value: unknown }> = []
  const persistedThemeKeys = ['list', 'affix', 'tabList']

  persistedThemeKeys.forEach((key) => {
    const repaired = repairPresetItems(store[key])
    const normalized = normalizeValue(repaired.value)
    if (repaired.changed || normalized.changed) {
      statePayloads.push({ key, value: normalized.value })
    }
  })

  if (statePayloads.length) store.updateStates(statePayloads)

  const normalizedGlobal = normalizeValue(store.global)
  let globalValue = normalizedGlobal.value as Record<string, any>
  let globalChanged = normalizedGlobal.changed
  if (isLegacyBackgroundFallback(globalValue.background)) {
    const matchingPreset = findMatchingPreset(store)
    const presetBackground = matchingPreset?.global?.background
    globalValue = {
      ...globalValue,
      background: typeof presetBackground === 'string' && presetBackground.includes('url(')
        ? presetBackground
        : defaultRecoveredBackground
    }
    globalChanged = true
  }

  if (globalChanged) store.updateGlobal(globalValue)
}
