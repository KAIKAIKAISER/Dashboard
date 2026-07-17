<template>
  <div
    class="wrapper material-weather"
    :style="{
      padding: componentSetting.padding + 'px',
      fontSize: (componentSetting.baseFontSize || 16) + 'px',
      color: componentSetting.textColor || '#fff',
      textShadow: componentSetting.textShadow || '0 0 1px #464646',
      fontFamily: componentSetting.fontFamily || undefined
    }"
  >
    <section class="weather-card">
      <button
        type="button"
        class="weather-card-trigger"
        aria-label="点击搜索并选择机场"
        title="点击搜索并选择机场"
        @pointerdown.stop
        @pointerup.stop
        @mousedown.stop
        @mouseup.stop
        @click.stop="openAirportSearch"
      />
      <div v-if="loading && !hasData" class="state-message">
        正在获取航空天气…
      </div>

      <div v-else-if="!hasData" class="state-message state-error">
        <strong>暂时无法获取 {{ icaoCode }} 天气</strong>
        <span>{{ errorMessage || '该机场目前没有可用的 METAR / TAF。' }}</span>
        <a :href="detailURL" target="_blank" rel="noopener noreferrer" @pointerup.stop @click.stop>
          前往 metar-taf.com 查看
        </a>
      </div>

      <template v-else>
        <div class="weather-overview">
          <div class="weather-icon-wrapper">
            <img
              :src="weatherIcon"
              :alt="weatherCondition"
              :style="{
                filter: `drop-shadow(${componentSetting.iconShadow || '0 0 1px #464646'})`
              }"
            >
          </div>
          <div class="weather-primary">
            <div class="temperature">
              {{ temperatureText }}°
            </div>
            <div class="weather-location" :title="`${cityLabel} · ${weatherCondition}`">
              <span class="city">{{ cityLabel }}</span>
              <span class="location-separator" aria-hidden="true">·</span>
              <span class="condition">{{ weatherCondition }}</span>
            </div>
          </div>
          <div class="weather-essentials">
            <span>
              <small>湿度</small>
              <strong>{{ humidityText }}</strong>
            </span>
            <span>
              <small>降水</small>
              <strong>{{ precipitationText }}</strong>
            </span>
          </div>
          <span class="select-cue" aria-hidden="true">⌄</span>
        </div>

        <div class="weather-stats">
          <span v-if="windText"><small>风</small>{{ windText }}</span>
          <span v-if="metar?.visib"><small>能见度</small>{{ metar.visib }} SM</span>
          <span v-if="metar?.altim != null"><small>气压</small>{{ formatNumber(metar.altim) }} hPa</span>
          <span v-if="metar?.dewp != null"><small>露点</small>{{ formatNumber(metar.dewp) }}°C</span>
        </div>

        <div class="reports">
          <article class="report">
            <div class="report-title">
              <strong>METAR</strong>
              <time v-if="metarTime">{{ metarTime }}</time>
            </div>
            <p>{{ metar?.rawOb || '暂无 METAR' }}</p>
          </article>

          <article class="report">
            <div class="report-title">
              <strong>TAF</strong>
              <time v-if="tafTime">{{ tafTime }}</time>
            </div>
            <p>{{ taf?.rawTAF || '暂无 TAF' }}</p>
          </article>
        </div>

        <footer>
          <span>
            数据：Aviation Weather Center
            <template v-if="refreshing"> · 更新中…</template>
            <template v-else-if="errorMessage"> · 部分数据更新失败</template>
          </span>
          <button type="button" :disabled="refreshing" @pointerup.stop @click.stop="loadWeather">
            刷新
          </button>
        </footer>
      </template>
    </section>

    <easy-dialog
      v-model="searchVisible"
      title="搜索并选择机场"
      width="min(580px, 94vw)"
      height="min(560px, 82vh)"
      :close-on-click-outside="true"
      custom-class="weather-search-dialog"
    >
      <div class="airport-search" @click.stop>
        <form class="search-form" @submit.prevent="runAirportSearch">
          <input
            ref="searchInput"
            v-model.trim="searchKeyword"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="输入 ICAO、IATA、机场或城市，如 ZBAA / PEK / Beijing"
            aria-label="机场搜索关键词"
          >
          <button type="submit" :disabled="stationIndexLoading">搜索</button>
        </form>

        <p class="search-tip">
          天气数据与机场索引来自 Aviation Weather Center；机场和城市名称使用官方英文名称。
        </p>

        <div v-if="stationIndexLoading" class="search-state">正在载入全球机场索引…</div>
        <div v-else-if="stationIndexError" class="search-state search-state-error">
          <span>{{ stationIndexError }}</span>
          <button type="button" @click="retryStationIndex">重试</button>
        </div>
        <div v-else-if="!airportResults.length" class="search-state">
          没有匹配结果，请尝试 ICAO、IATA 或英文城市名。
        </div>
        <div v-else class="airport-results" role="listbox" aria-label="机场搜索结果">
          <button
            v-for="airport in airportResults"
            :key="airport.icaoId"
            type="button"
            class="airport-result"
            :class="{ selected: airport.icaoId === icaoCode }"
            role="option"
            :aria-selected="airport.icaoId === icaoCode"
            @click="selectAirport(airport)"
          >
            <span class="airport-code">{{ airport.icaoId }}</span>
            <span class="airport-info">
              <strong>{{ airport.site || 'Unnamed station' }}</strong>
              <small>{{ airportLocation(airport) }}</small>
            </span>
            <span v-if="airport.iataId" class="iata-code">{{ airport.iataId }}</span>
          </button>
        </div>

        <div class="search-footer">
          <span>当前：{{ icaoCode }} · {{ stationName }}</span>
          <a :href="detailURL" target="_blank" rel="noopener noreferrer">
            在 METAR-TAF 查看详情 ↗
          </a>
        </div>
      </div>
    </easy-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { getWeatherIconURL } from './icon-map'

interface MetarReport {
  icaoId?: string
  name?: string
  reportTime?: string
  temp?: number
  dewp?: number
  wdir?: number | string
  wspd?: number
  wgst?: number
  visib?: string
  altim?: number
  fltCat?: string
  cover?: string
  wxString?: string
  precip?: number
  pcp3hr?: number
  pcp6hr?: number
  pcp24hr?: number
  rawOb?: string
}

interface TafReport {
  icaoId?: string
  name?: string
  issueTime?: string
  rawTAF?: string
}

interface AirportStation {
  id?: string
  icaoId: string
  iataId?: string | null
  faaId?: string | null
  site?: string
  state?: string
  country?: string
  priority?: number
  siteType?: string[]
}

const props = defineProps({
  componentSetting: {
    type: Object,
    required: true
  }
})

const API_BASE = import.meta.env.DEV
  ? '/awc-api'
  : 'https://aviationweather.gov/api/data'
const STATION_INDEX_URL = import.meta.env.DEV
  ? '/awc-cache/stations.cache.json'
  : 'https://aviationweather.gov/data/cache/stations.cache.json'

const icaoCode = computed(() => {
  const value = String(props.componentSetting.icaoCode || 'ZBAA').trim().toUpperCase()
  return /^[A-Z0-9]{3,4}$/.test(value) ? value : 'ZBAA'
})

const metar = ref<MetarReport | null>(null)
const taf = ref<TafReport | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
const searchVisible = ref(false)
const searchKeyword = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const stationIndex = ref<AirportStation[]>([])
const stationIndexLoading = ref(false)
const stationIndexError = ref('')
const airportResults = ref<AirportStation[]>([])

const hasData = computed(() => Boolean(metar.value || taf.value))
const stationName = computed(() => metar.value?.name || taf.value?.name || '航空天气')
const detailURL = computed(() => `https://metar-taf.com/en/${icaoCode.value}`)

const CHINESE_CITY_NAMES: Record<string, string> = {
  ZBAA: '北京',
  ZBAD: '北京',
  ZSPD: '上海',
  ZSSS: '上海',
  ZGGG: '广州',
  ZGSZ: '深圳',
  ZUUU: '成都',
  ZUTF: '成都',
  ZUCK: '重庆',
  ZPPP: '昆明',
  ZSHC: '杭州',
  ZSNJ: '南京',
  ZSAM: '厦门',
  ZSFZ: '福州',
  ZSQD: '青岛',
  ZYTL: '大连',
  ZYTX: '沈阳',
  ZYHB: '哈尔滨',
  ZYCC: '长春',
  ZHCC: '郑州',
  ZHHH: '武汉',
  ZGHA: '长沙',
  ZSCN: '南昌',
  ZSOF: '合肥',
  ZLXY: '西安',
  ZLLL: '兰州',
  ZLXN: '西宁',
  ZBHH: '呼和浩特',
  ZBTJ: '天津',
  ZWWW: '乌鲁木齐',
  ZUGY: '贵阳',
  ZULS: '拉萨',
  ZJHK: '海口',
  ZJSY: '三亚'
}

const extractCityName = (name: string) => {
  const firstPart = name
    .replace(/\b(international|intl|airport|aerodrome|air base|apt)\b.*$/i, '')
    .split(/[/,—-]/)[0]
    .trim()
  return firstPart || icaoCode.value
}

const cityLabel = computed(() => (
  CHINESE_CITY_NAMES[icaoCode.value] || extractCityName(stationName.value)
))

const weatherCondition = computed(() => {
  const weather = (metar.value?.wxString || '').toUpperCase()
  if (weather.includes('TS')) return '雷阵雨'
  if (weather.includes('FZRA') || weather.includes('PL')) return '雨夹雪'
  if (weather.includes('SN') || weather.includes('SG')) return '雪'
  if (weather.includes('RA') || weather.includes('DZ')) {
    if (weather.includes('+')) return '大雨'
    return '小雨'
  }
  if (weather.includes('FG')) return '大雾'
  if (weather.includes('BR') || weather.includes('HZ') || weather.includes('FU')) return '小雾'
  if (weather.includes('FC') || weather.includes('SQ')) return '风'

  const cover = (metar.value?.cover || '').toUpperCase()
  if (cover === 'OVC') return '阴'
  if (cover === 'BKN') return '多云'
  if (cover === 'SCT') return '晴间多云'
  if (cover === 'FEW') return '少云'
  if (['CLR', 'SKC', 'CAVOK', 'NSC', 'NCD'].includes(cover)) return '晴'
  return '未知'
})

const weatherIcon = computed(() => getWeatherIconURL(
  weatherCondition.value,
  props.componentSetting.animationIcon !== false
))

const temperatureText = computed(() => (
  metar.value?.temp == null ? '--' : formatNumber(metar.value.temp)
))

const humidity = computed(() => {
  if (metar.value?.temp == null || metar.value.dewp == null) return null
  const temperature = metar.value.temp
  const dewPoint = metar.value.dewp
  const relativeHumidity = 100 * Math.exp(
    (17.625 * dewPoint) / (243.04 + dewPoint)
    - (17.625 * temperature) / (243.04 + temperature)
  )
  return Math.round(Math.min(100, Math.max(0, relativeHumidity)))
})

const humidityText = computed(() => humidity.value == null ? '--' : `${humidity.value}%`)

const precipitationText = computed(() => {
  const weather = (metar.value?.wxString || '').toUpperCase()
  if (weather.includes('TS')) return '雷雨'
  if (weather.includes('FZRA') || weather.includes('PL')) return '冻雨'
  if (weather.includes('SN') || weather.includes('SG')) return '降雪'
  if (weather.includes('RA') || weather.includes('DZ')) return weather.includes('+') ? '大雨' : '有雨'

  const precipitation = metar.value?.precip
  if (precipitation != null && precipitation > 0) {
    const millimeters = precipitation * 25.4
    return `${millimeters < 0.1 ? '<0.1' : millimeters.toFixed(1)} mm`
  }
  return '无'
})

const searchableText = (airport: AirportStation) => [
  airport.icaoId,
  airport.iataId,
  airport.faaId,
  airport.site,
  airport.state,
  airport.country
].filter(Boolean).join(' ').toUpperCase()

const resultScore = (airport: AirportStation, keyword: string) => {
  const icao = airport.icaoId.toUpperCase()
  const iata = airport.iataId?.toUpperCase() || ''
  const site = airport.site?.toUpperCase() || ''
  if (icao === keyword) return 0
  if (iata === keyword) return 1
  if (icao.startsWith(keyword) || iata.startsWith(keyword)) return 2
  if (site.startsWith(keyword)) return 3
  if (site.includes(keyword)) return 4
  return 5
}

const updateAirportResults = () => {
  const keyword = searchKeyword.value.trim().toUpperCase()
  if (!keyword || !stationIndex.value.length) {
    airportResults.value = stationIndex.value
      .filter(airport => airport.icaoId === icaoCode.value)
      .slice(0, 1)
    return
  }

  airportResults.value = stationIndex.value
    .filter(airport => searchableText(airport).includes(keyword))
    .sort((a, b) => {
      const score = resultScore(a, keyword) - resultScore(b, keyword)
      if (score) return score
      return (a.priority ?? 99) - (b.priority ?? 99)
    })
    .slice(0, 40)
}

const loadStationIndex = async (force = false) => {
  if (stationIndex.value.length && !force) return
  stationIndexLoading.value = true
  stationIndexError.value = ''
  try {
    const response = await fetch(STATION_INDEX_URL, {
      cache: force ? 'reload' : 'force-cache'
    })
    if (!response.ok) throw new Error(`机场索引请求失败 (${response.status})`)
    const stations = await response.json()
    if (!Array.isArray(stations)) throw new Error('机场索引格式无效')
    stationIndex.value = stations.filter((airport: AirportStation) => (
      airport.icaoId && airport.siteType?.some(type => type === 'METAR' || type === 'TAF')
    ))
    updateAirportResults()
  } catch (error) {
    stationIndexError.value = error instanceof Error ? error.message : '无法载入机场索引'
  } finally {
    stationIndexLoading.value = false
  }
}

const runAirportSearch = async () => {
  await loadStationIndex()
  updateAirportResults()
}

const openAirportSearch = async () => {
  if (searchVisible.value) return
  searchKeyword.value = icaoCode.value
  searchVisible.value = true
  await nextTick()
  searchInput.value?.select()
  await runAirportSearch()
}

const retryStationIndex = () => loadStationIndex(true)

const selectAirport = (airport: AirportStation) => {
  props.componentSetting.icaoCode = airport.icaoId
  searchVisible.value = false
}

const airportLocation = (airport: AirportStation) => (
  [airport.state, airport.country].filter(Boolean).join(' · ') || '位置未提供'
)

let searchTimer: number | null = null
watch(searchKeyword, () => {
  if (!searchVisible.value || !stationIndex.value.length) return
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(updateAirportResults, 120)
})

const windText = computed(() => {
  if (metar.value?.wspd == null) return ''
  const direction = metar.value.wdir ?? 'VRB'
  const directionText = typeof direction === 'number' ? `${direction}°` : direction
  const gust = metar.value.wgst != null ? ` G${metar.value.wgst}` : ''
  return `${directionText} ${metar.value.wspd}${gust} kt`
})

const formatNumber = (value: number) => Number.isInteger(value) ? value : value.toFixed(1)

const formatTime = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(date)} UTC`
}

const metarTime = computed(() => formatTime(metar.value?.reportTime))
const tafTime = computed(() => formatTime(taf.value?.issueTime))

const fetchReport = async <T,>(product: 'metar' | 'taf', signal: AbortSignal) => {
  const params = new URLSearchParams({
    ids: icaoCode.value,
    format: 'json'
  })
  const response = await fetch(`${API_BASE}/${product}?${params}`, {
    cache: 'no-store',
    signal
  })

  if (response.status === 204) return null
  if (!response.ok) throw new Error(`${product.toUpperCase()} 请求失败 (${response.status})`)

  const reports = await response.json()
  return Array.isArray(reports) && reports.length ? reports[0] as T : null
}

let requestId = 0
let controller: AbortController | null = null

const loadWeather = async () => {
  const currentRequest = ++requestId
  controller?.abort()
  controller = new AbortController()

  loading.value = !hasData.value
  refreshing.value = hasData.value
  errorMessage.value = ''

  const results = await Promise.allSettled([
    fetchReport<MetarReport>('metar', controller.signal),
    fetchReport<TafReport>('taf', controller.signal)
  ])

  if (currentRequest !== requestId) return

  if (results[0].status === 'fulfilled') metar.value = results[0].value
  if (results[1].status === 'fulfilled') taf.value = results[1].value

  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .filter(result => result.reason?.name !== 'AbortError')

  if (failures.length) {
    errorMessage.value = failures
      .map(result => result.reason instanceof Error ? result.reason.message : '天气请求失败')
      .join('；')
  }

  loading.value = false
  refreshing.value = false
}

watch(icaoCode, () => {
  metar.value = null
  taf.value = null
  loadWeather()
}, { immediate: true })

let timer: number | null = null
const refreshTimer = () => {
  if (timer) window.clearInterval(timer)

  const duration = Math.max(Number(props.componentSetting.duration) || 60, 60)
  timer = window.setInterval(loadWeather, duration * 60 * 1000)
}

watch(
  () => props.componentSetting.duration,
  refreshTimer,
  { immediate: true }
)

onUnmounted(() => {
  controller?.abort()
  if (timer) window.clearInterval(timer)
  if (searchTimer) window.clearTimeout(searchTimer)
})
</script>

<style lang="scss" scoped>
.wrapper {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  container-type: size;
}

.weather-card {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  padding: 10px;
  overflow: auto;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: inherit;
  box-shadow: none;
}

.weather-card-trigger {
  position: absolute;
  inset: 0;
  z-index: 3;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: -2px;
  }
}

.weather-overview {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.weather-icon-wrapper {
  width: 58px;
  height: 58px;
  flex: none;
  display: grid;
  place-items: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.weather-primary {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.temperature {
  font-size: 2.35em;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.weather-location {
  width: 100%;
  min-width: 0;
  margin-top: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 0.76em;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.city,
.condition {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.city {
  flex: none;
  max-width: 48%;
}

.condition {
  flex: 0 1 auto;
}

.location-separator {
  flex: none;
  color: rgba(255, 255, 255, 0.58);
  font-weight: 400;
}

.weather-essentials {
  min-width: 66px;
  display: grid;
  gap: 4px;
  margin-left: auto;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.22);

  > span {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  small {
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.74em;
    font-weight: 500;
  }

  strong {
    overflow: hidden;
    font-size: 0.76em;
    font-weight: 700;
    text-align: right;
    text-overflow: ellipsis;
  }
}

.select-cue {
  flex: none;
  color: rgba(255, 255, 255, 0.56);
  font-size: 11px;
}

.weather-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  > span {
    padding: 6px 8px;
    background: rgba(15, 23, 42, 0.32);
    border-radius: 7px;
    font-size: 0.76em;
    white-space: nowrap;
  }

  small {
    margin-right: 5px;
    color: rgba(255, 255, 255, 0.58);
    font-weight: 400;
  }
}

.weather-header,
.report-title,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.station {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  overflow: hidden;

  strong {
    flex: none;
    font-size: 20px;
    letter-spacing: 0.08em;
  }

  span {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.68);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.choose-hint,
.state-message a {
  flex: none;
  color: #7dd3fc;
}

.choose-hint {
  font-size: 12px;
  white-space: nowrap;
}

.choose-compact {
  display: none;
}

.weather-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;

  > span {
    min-width: 70px;
    padding: 8px 10px;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-weight: 600;
  }

  small {
    display: block;
    margin-bottom: 2px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 10px;
    font-weight: 400;
  }
}

.weather-summary .flight-category {
  min-width: 54px;
  display: grid;
  place-items: center;
  background: #15803d;

  &[data-category='MVFR'] { background: #1d4ed8; }
  &[data-category='IFR'] { background: #dc2626; }
  &[data-category='LIFR'] { background: #a21caf; }
}

.reports {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
  gap: 8px;
}

.report {
  min-width: 0;
  padding: 10px;
  background: rgba(2, 6, 23, 0.42);
  border-radius: 8px;

  time {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
  }

  p {
    margin: 7px 0 0;
    color: rgba(255, 255, 255, 0.82);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
}

.state-message {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.72);
  text-align: center;
}

.state-error span {
  max-width: 480px;
  font-size: 12px;
}

footer {
  margin-top: auto;
  color: rgba(255, 255, 255, 0.48);
  font-size: 10px;

  button {
    padding: 4px 9px;
    color: #e0f2fe;
    background: rgba(14, 165, 233, 0.18);
    border: 1px solid rgba(125, 211, 252, 0.28);
    border-radius: 6px;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.5;
  }
}

.state-message a,
footer button {
  position: relative;
  z-index: 4;
}

.airport-search {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  padding: 4px 4px 8px;
  color: #1f2937;
}

.search-form {
  display: flex;
  gap: 8px;

  input {
    min-width: 0;
    flex: 1;
    padding: 10px 12px;
    color: #111827;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    outline: none;

    &:focus {
      border-color: #0ea5e9;
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.14);
    }
  }

  button {
    padding: 0 16px;
    color: #fff;
    background: #0284c7;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
  }
}

.search-tip {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.search-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #64748b;
  text-align: center;
}

.search-state-error {
  color: #b91c1c;

  button {
    padding: 5px 10px;
    color: #b91c1c;
    background: #fff;
    border: 1px solid #fecaca;
    border-radius: 6px;
    cursor: pointer;
  }
}

.airport-results {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.airport-result {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  color: #1f2937;
  background: #fff;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  text-align: left;

  &:last-child { border-bottom: 0; }
  &:hover { background: #f0f9ff; }
  &.selected { background: #e0f2fe; }
}

.airport-code {
  flex: none;
  width: 48px;
  color: #0369a1;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.airport-info {
  min-width: 0;
  flex: 1;

  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong { font-size: 14px; }
  small { margin-top: 2px; color: #64748b; font-size: 11px; }
}

.iata-code {
  flex: none;
  padding: 3px 6px;
  color: #475569;
  background: #f1f5f9;
  border-radius: 5px;
  font-size: 11px;
}

.search-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 11px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a {
    flex: none;
    color: #0284c7;
    text-decoration: none;
  }
}

@container (max-height: 140px) {
  .weather-card {
    gap: 6px;
    padding: 8px 10px;
    overflow: hidden;
  }

  .weather-overview {
    min-height: 0;
    flex: 1;
  }

  .weather-stats,
  .reports,
  footer {
    display: none;
  }
}

@container (max-width: 220px) {
  .weather-card {
    padding: 4px 6px;
  }

  .weather-overview {
    gap: 4px;
  }

  .weather-icon-wrapper {
    width: 34px;
    height: 34px;
  }

  .weather-primary {
    min-width: 0;
  }

  .temperature {
    font-size: 1.75em;
  }

  .weather-location {
    margin-top: 1px;
    gap: 2px;
    font-size: 0.66em;
  }

  .weather-essentials {
    min-width: 50px;
    gap: 3px;
    padding-left: 5px;

    > span { gap: 4px; }
    small,
    strong { font-size: 0.66em; }
  }

  .select-cue {
    display: none;
  }
}

@container (max-width: 155px) {
  .weather-card {
    padding-inline: 4px;
  }

  .weather-icon-wrapper {
    width: 34px;
    height: 34px;
  }

  .weather-primary {
    min-width: 0;
  }

  .weather-essentials {
    min-width: 48px;
  }
}

@container (max-height: 64px) {
  .weather-card {
    padding-block: 3px;
  }

  .weather-overview {
    gap: 2px;
  }

  .weather-icon-wrapper {
    width: 28px;
    height: 28px;
  }

  .temperature {
    font-size: 1.65em;
  }

  .weather-location {
    font-size: 0.6em;
  }

  .weather-essentials {
    width: 50px;
    min-width: 50px;
    box-sizing: border-box;
    padding-left: 4px;

    > span { gap: 3px; }
    small,
    strong { font-size: 0.6em; }
  }

  .state-message {
    align-items: center;
    font-size: 10px;

    strong,
    span,
    a {
      display: none;
    }
  }
}
</style>
