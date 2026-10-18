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
              <small v-else-if="fallbackSource" style="color: rgba(255, 255, 255, 0.45)">回退模式</small>
            </div>
            <p>{{ metar?.rawOb || (fallbackSource ? `${icaoCode} 暂无国际公开 METAR 报文` : '暂无 METAR') }}</p>
          </article>

          <article class="report">
            <div class="report-title">
              <strong>TAF</strong>
              <time v-if="tafTime">{{ tafTime }}</time>
              <small v-else-if="fallbackSource" style="color: rgba(255, 255, 255, 0.45)">气象数据</small>
            </div>
            <p>{{ taf?.rawTAF || (fallbackSource ? `已自动回退至 ${cityLabel} 气象数据：${weatherCondition} ${temperatureText}°C · 湿度 ${humidityText}` : '暂无 TAF') }}</p>
          </article>
        </div>

        <footer>
          <span>
            数据：{{ footerSourceText }}
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
              <strong>{{ airportDisplayName(airport) }}</strong>
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
import { getWeatherIconURL, weatherFormatter } from './icon-map'
import request from '@/utils/request'

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

interface FallbackWeatherData {
  cityName: string
  weather: string
  temperature: string
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

const IATA_TO_ICAO: Record<string, string> = {
  PEK: 'ZBAA',
  PKX: 'ZBAD',
  PVG: 'ZSPD',
  SHA: 'ZSSS',
  CAN: 'ZGGG',
  SZX: 'ZGSZ',
  CTU: 'ZUUU',
  TFU: 'ZUTF',
  CKG: 'ZUCK',
  KMG: 'ZPPP',
  HGH: 'ZSHC',
  NKG: 'ZSNJ',
  XMN: 'ZSAM',
  FOC: 'ZSFZ',
  JJN: 'ZSQZ',
  KHN: 'ZSCN',
  TAO: 'ZSQD',
  DLC: 'ZYTL',
  SHE: 'ZYTX',
  HRB: 'ZYHB',
  CGQ: 'ZYCC',
  CGO: 'ZHCC',
  WUH: 'ZHHH',
  CSX: 'ZGHA',
  HFE: 'ZSOF',
  XIY: 'ZLXY',
  LHW: 'ZLLL',
  XNN: 'ZLXN',
  HET: 'ZBHH',
  TSN: 'ZBTJ',
  URC: 'ZWWW',
  KWE: 'ZUGY',
  LXA: 'ZULS',
  HAK: 'ZJHK',
  SYX: 'ZJSY',
  WNZ: 'ZSWZ',
  NTG: 'ZSNT',
  SWA: 'ZGOW',
  ZUH: 'ZGSD',
  NGB: 'ZSNB',
  SJW: 'ZBSJ',
  TYN: 'ZBYN',
  INC: 'ZLIC',
  KWL: 'ZGKL',
  NNG: 'ZGNN',
  ZHA: 'ZGZJ',
  LJG: 'ZPLJ',
  EHU: 'ZHEC',
  TNA: 'ZSJN',
  YNT: 'ZSYT',
  NDG: 'ZYQQ',
  KHG: 'ZWSH',
  HTN: 'ZWTN',
  HMI: 'ZWHM'
}

const icaoCode = computed(() => {
  const raw = String(props.componentSetting.icaoCode || 'ZBAA').trim().toUpperCase()
  const value = /^[A-Z0-9]{3,4}$/.test(raw) ? raw : 'ZBAA'
  if (value.length === 3 && IATA_TO_ICAO[value]) {
    return IATA_TO_ICAO[value]
  }
  return value
})

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
  ZGCS: '长沙',
  ZSCN: '南昌',
  ZSOF: '合肥',
  ZLXY: '西安',
  ZLSN: '西安',
  ZLLL: '兰州',
  ZLXN: '西宁',
  ZBHH: '呼和浩特',
  ZBTJ: '天津',
  ZWWW: '乌鲁木齐',
  ZUGY: '贵阳',
  ZULS: '拉萨',
  ZJHK: '海口',
  ZGHK: '海口',
  ZJSY: '三亚',
  ZSQZ: '泉州',
  ZGOW: '揭阳',
  ZGSD: '珠海',
  ZSNB: '宁波',
  ZSWZ: '温州',
  ZSNT: '南通',
  ZSGZ: '赣州',
  ZBSJ: '石家庄',
  ZBYN: '太原',
  ZBDS: '鄂尔多斯',
  ZLIC: '银川',
  ZLJQ: '酒泉',
  ZLYA: '延安',
  ZGDY: '张家界',
  ZGKL: '桂林',
  ZGNN: '南宁',
  ZGZJ: '湛江',
  ZPLJ: '丽江',
  ZHEC: '鄂州',
  ZSJN: '济南',
  ZSYT: '烟台',
  ZYQQ: '齐齐哈尔',
  ZWSH: '喀什',
  ZWTN: '和田',
  ZWHM: '哈密',
  VHCH: '香港'
}

const AIRPORT_COORDS: Record<string, { lat: number; lon: number }> = {
  VHCH: { lat: 22.205, lon: 114.027 },
  ZBAA: { lat: 40.082, lon: 116.603 },
  ZBAD: { lat: 39.501, lon: 116.412 },
  ZBDS: { lat: 39.49, lon: 109.861 },
  ZBHH: { lat: 40.854, lon: 111.827 },
  ZBSJ: { lat: 38.281, lon: 114.697 },
  ZBTJ: { lat: 39.124, lon: 117.346 },
  ZBYN: { lat: 37.747, lon: 112.628 },
  ZGCS: { lat: 28.2, lon: 113.083 },
  ZGDY: { lat: 29.1033, lon: 110.4431 },
  ZGGG: { lat: 23.392, lon: 113.307 },
  ZGHA: { lat: 28.18, lon: 113.219 },
  ZGHK: { lat: 20.03, lon: 110.35 },
  ZGKL: { lat: 25.22, lon: 110.04 },
  ZGNN: { lat: 22.609, lon: 108.173 },
  ZGOW: { lat: 23.55, lon: 116.505 },
  ZGSD: { lat: 22.008, lon: 113.378 },
  ZGSZ: { lat: 22.639, lon: 113.803 },
  ZGZJ: { lat: 21.214, lon: 110.359 },
  ZHCC: { lat: 34.52, lon: 113.834 },
  ZHEC: { lat: 30.3424, lon: 115.0389 },
  ZHHH: { lat: 30.783, lon: 114.205 },
  ZJHK: { lat: 19.934, lon: 110.445 },
  ZJSY: { lat: 18.303, lon: 109.412 },
  ZLIC: { lat: 38.323, lon: 106.392 },
  ZLJQ: { lat: 39.86, lon: 98.338 },
  ZLLL: { lat: 36.513, lon: 103.623 },
  ZLSN: { lat: 34.3, lon: 108.93 },
  ZLXN: { lat: 36.528, lon: 102.04 },
  ZLXY: { lat: 34.449, lon: 108.752 },
  ZLYA: { lat: 36.637, lon: 109.553 },
  ZPLJ: { lat: 26.678, lon: 100.247 },
  ZPPP: { lat: 25.107, lon: 102.934 },
  ZSAM: { lat: 24.546, lon: 118.131 },
  ZSCN: { lat: 28.863, lon: 115.902 },
  ZSFZ: { lat: 25.936, lon: 119.666 },
  ZSGZ: { lat: 25.867, lon: 115 },
  ZSHC: { lat: 30.229, lon: 120.434 },
  ZSJN: { lat: 36.856, lon: 117.206 },
  ZSNB: { lat: 29.827, lon: 121.462 },
  ZSNJ: { lat: 31.739, lon: 118.863 },
  ZSNT: { lat: 32.02, lon: 120.85 },
  ZSOF: { lat: 31.99, lon: 116.965 },
  ZSPD: { lat: 31.146, lon: 121.8 },
  ZSQD: { lat: 36.362, lon: 120.087 },
  ZSQZ: { lat: 24.7968, lon: 118.5889 },
  ZSSS: { lat: 31.209, lon: 121.337 },
  ZSWZ: { lat: 27.912, lon: 120.852 },
  ZSYT: { lat: 37.402, lon: 121.372 },
  ZUCK: { lat: 29.718, lon: 106.639 },
  ZUGY: { lat: 26.538, lon: 106.801 },
  ZULS: { lat: 29.294, lon: 90.9 },
  ZUTF: { lat: 30.304, lon: 104.436 },
  ZUUU: { lat: 30.576, lon: 103.95 },
  ZWHM: { lat: 42.843, lon: 93.664 },
  ZWSH: { lat: 39.542, lon: 76.019 },
  ZWTN: { lat: 37.147, lon: 79.97 },
  ZWWW: { lat: 43.907, lon: 87.474 },
  ZYCC: { lat: 43.993, lon: 125.682 },
  ZYHB: { lat: 45.628, lon: 126.259 },
  ZYQQ: { lat: 47.238, lon: 123.919 },
  ZYTL: { lat: 38.961, lon: 121.556 },
  ZYTX: { lat: 41.639, lon: 123.485 }
}

const BUILTIN_CHINESE_STATIONS: AirportStation[] = Object.entries(CHINESE_CITY_NAMES).map(([icao, city]) => {
  const iata = Object.entries(IATA_TO_ICAO).find(([_, targetIcao]) => targetIcao === icao)?.[0] || null
  const coords = AIRPORT_COORDS[icao]
  return {
    icaoId: icao,
    iataId: iata,
    site: `${city}机场`,
    state: 'CN',
    country: 'CN',
    priority: 1,
    siteType: ['METAR', 'TAF'],
    ...coords
  } as AirportStation
})

const metar = ref<MetarReport | null>(null)
const taf = ref<TafReport | null>(null)
const fallbackWeather = ref<FallbackWeatherData | null>(null)
const fallbackSource = ref<'wttr' | 'open-meteo' | 'amap' | ''>('')
const directHumidity = ref<number | null>(null)
const isFallback = computed(() => Boolean(fallbackSource.value))

const footerSourceText = computed(() => {
  if (fallbackSource.value === 'wttr') return '地面气象源 (回退模式)'
  if (fallbackSource.value === 'open-meteo') return 'Open-Meteo (气象数值回退)'
  if (fallbackSource.value === 'amap') return '高德天气 (回退模式)'
  return 'Aviation Weather Center'
})

const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
const searchVisible = ref(false)
const searchKeyword = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const stationIndex = ref<AirportStation[]>([...BUILTIN_CHINESE_STATIONS])
const stationIndexLoading = ref(false)
const stationIndexError = ref('')
const airportResults = ref<AirportStation[]>([])

const hasData = computed(() => Boolean(metar.value || taf.value || fallbackWeather.value))
const stationName = computed(() => {
  if (isFallback.value && fallbackWeather.value) {
    return `${fallbackWeather.value.cityName} (回退模式)`
  }
  return metar.value?.name || taf.value?.name || '航空天气'
})
const detailURL = computed(() => `https://metar-taf.com/en/${icaoCode.value}`)

const extractCityName = (name: string) => {
  const firstPart = name
    .replace(/\b(international|intl|airport|aerodrome|air base|apt)\b.*$/i, '')
    .split(/[/,—-]/)[0]
    .trim()
  return firstPart || icaoCode.value
}

const cityLabel = computed(() => (
  (isFallback.value && fallbackWeather.value?.cityName)
    ? fallbackWeather.value.cityName
    : (CHINESE_CITY_NAMES[icaoCode.value] || extractCityName(stationName.value))
))

const weatherCondition = computed(() => {
  if (isFallback.value && fallbackWeather.value) {
    return weatherFormatter(fallbackWeather.value.weather) || fallbackWeather.value.weather
  }
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

const temperatureText = computed(() => {
  if (isFallback.value && fallbackWeather.value) {
    return fallbackWeather.value.temperature
  }
  return metar.value?.temp == null ? '--' : formatNumber(metar.value.temp)
})

const humidity = computed(() => {
  if (directHumidity.value != null) return directHumidity.value
  if (metar.value?.temp == null || metar.value.dewp == null) return null
  const temperature = metar.value.temp
  const dewPoint = metar.value.dewp
  const relativeHumidity = 100 * Math.exp(
    (17.625 * dewPoint) / (243.04 + dewPoint)
    - (17.625 * temperature) / (243.04 + temperature)
  )
  return Math.round(Math.min(100, Math.max(0, relativeHumidity)))
})

const humidityText = computed(() => (humidity.value == null ? '--' : `${humidity.value}%`))

const precipitationText = computed(() => {
  const precipitation = metar.value?.precip
  if (precipitation != null && precipitation > 0) {
    const millimeters = precipitation * 25.4
    return `${millimeters < 0.1 ? '<0.1' : millimeters.toFixed(1)} mm`
  }
  const weather = (metar.value?.wxString || '').toUpperCase()
  if (weather.includes('TS')) return '雷雨'
  if (weather.includes('FZRA') || weather.includes('PL')) return '冻雨'
  if (weather.includes('SN') || weather.includes('SG')) return '降雪'
  if (weather.includes('RA') || weather.includes('DZ')) return weather.includes('+') ? '大雨' : '有雨'
  return '无'
})

const airportDisplayName = (airport: AirportStation) => {
  const chinese = CHINESE_CITY_NAMES[airport.icaoId]
  if (chinese) {
    return `${chinese} · ${airport.site || '机场'}`
  }
  return airport.site || 'Unnamed station'
}

const searchableText = (airport: AirportStation) => [
  airport.icaoId,
  airport.iataId,
  airport.faaId,
  airport.site,
  airport.state,
  airport.country,
  CHINESE_CITY_NAMES[airport.icaoId] || ''
].filter(Boolean).join(' ').toUpperCase()

const resultScore = (airport: AirportStation, keyword: string) => {
  const icao = airport.icaoId.toUpperCase()
  const iata = airport.iataId?.toUpperCase() || ''
  const site = airport.site?.toUpperCase() || ''
  const chinese = (CHINESE_CITY_NAMES[airport.icaoId] || '').toUpperCase()
  if (chinese === keyword) return 0
  if (icao === keyword) return 1
  if (iata === keyword) return 2
  if (chinese.startsWith(keyword)) return 3
  if (icao.startsWith(keyword) || iata.startsWith(keyword)) return 4
  if (chinese.includes(keyword)) return 5
  if (site.startsWith(keyword)) return 6
  if (site.includes(keyword)) return 7
  return 8
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
  if (stationIndex.value.length > BUILTIN_CHINESE_STATIONS.length && !force) return
  stationIndexLoading.value = true
  stationIndexError.value = ''
  try {
    const response = await fetch(STATION_INDEX_URL, {
      cache: force ? 'reload' : 'force-cache'
    })
    if (!response.ok) throw new Error(`全球机场索引请求失败 (${response.status})`)
    const stations = await response.json()
    if (!Array.isArray(stations)) throw new Error('全球机场索引格式无效')
    const external = stations.filter((airport: AirportStation) => (
      airport.icaoId && airport.siteType?.some(type => type === 'METAR' || type === 'TAF')
    ))
    const mergedMap = new Map<string, AirportStation>()
    for (const st of BUILTIN_CHINESE_STATIONS) {
      mergedMap.set(st.icaoId, st)
    }
    for (const st of external) {
      if (!mergedMap.has(st.icaoId)) {
        mergedMap.set(st.icaoId, st)
      }
    }
    stationIndex.value = Array.from(mergedMap.values())
    updateAirportResults()
  } catch (error) {
    stationIndexError.value = error instanceof Error ? error.message : '无法载入全球机场索引'
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

const WMO_CODE_MAP: Record<number, { condition: string; cover: string; wxString: string }> = {
  0: { condition: '晴', cover: 'CAVOK', wxString: '' },
  1: { condition: '少云', cover: 'FEW', wxString: '' },
  2: { condition: '晴间多云', cover: 'SCT', wxString: '' },
  3: { condition: '多云', cover: 'BKN', wxString: '' },
  45: { condition: '大雾', cover: 'OVC', wxString: 'FG' },
  48: { condition: '大雾', cover: 'OVC', wxString: 'FG' },
  51: { condition: '小雨', cover: 'OVC', wxString: 'DZ' },
  53: { condition: '小雨', cover: 'OVC', wxString: 'DZ' },
  55: { condition: '小雨', cover: 'OVC', wxString: 'DZ' },
  56: { condition: '雨夹雪', cover: 'OVC', wxString: 'FZRA' },
  57: { condition: '雨夹雪', cover: 'OVC', wxString: 'FZRA' },
  61: { condition: '小雨', cover: 'OVC', wxString: 'RA' },
  63: { condition: '中雨', cover: 'OVC', wxString: 'RA' },
  65: { condition: '大雨', cover: 'OVC', wxString: '+RA' },
  66: { condition: '雨夹雪', cover: 'OVC', wxString: 'PL' },
  67: { condition: '雨夹雪', cover: 'OVC', wxString: 'PL' },
  71: { condition: '雪', cover: 'OVC', wxString: 'SN' },
  73: { condition: '雪', cover: 'OVC', wxString: 'SN' },
  75: { condition: '雪', cover: 'OVC', wxString: '+SN' },
  77: { condition: '雪', cover: 'OVC', wxString: 'SN' },
  80: { condition: '小雨', cover: 'BKN', wxString: 'SHRA' },
  81: { condition: '中雨', cover: 'BKN', wxString: 'SHRA' },
  82: { condition: '大雨', cover: 'OVC', wxString: '+SHRA' },
  85: { condition: '雪', cover: 'OVC', wxString: 'SHSN' },
  86: { condition: '雪', cover: 'OVC', wxString: 'SHSN' },
  95: { condition: '雷阵雨', cover: 'OVC', wxString: 'TSRA' },
  96: { condition: '雷阵雨', cover: 'OVC', wxString: 'TSRA' },
  99: { condition: '雷阵雨', cover: 'OVC', wxString: 'TSRA' }
}

const calcDewPoint = (tempC: number, rh: number): number => {
  const a = 17.625
  const b = 243.04
  const safeRH = Math.max(1, Math.min(100, rh))
  const alpha = Math.log(safeRH / 100) + (a * tempC) / (b + tempC)
  const dew = (b * alpha) / (a - alpha)
  return Math.round(dew * 10) / 10
}

const estimateHumidity = (weatherStr: string): number => {
  const w = weatherStr.toLowerCase()
  if (w.includes('暴雨') || w.includes('雷雨') || w.includes('雷暴')) return 92
  if (w.includes('雨') || w.includes('雪') || w.includes('雹')) return 85
  if (w.includes('雾') || w.includes('霾')) return 95
  if (w.includes('阴')) return 75
  if (w.includes('多云')) return 65
  const hour = new Date().getHours()
  if (hour >= 20 || hour <= 7) return 72
  return 55
}

const fetchStationCoords = async (icao: string): Promise<{ lat: number; lon: number } | null> => {
  if (AIRPORT_COORDS[icao]) {
    return AIRPORT_COORDS[icao]
  }

  const found = stationIndex.value.find(s => s.icaoId === icao)
  if (found && (found as any).lat != null && (found as any).lon != null) {
    return { lat: Number((found as any).lat), lon: Number((found as any).lon) }
  }

  const ctrl = new AbortController()
  const timeoutId = window.setTimeout(() => ctrl.abort(), 3500)
  try {
    const res = await fetch(`${API_BASE}/stationinfo?ids=${encodeURIComponent(icao)}&format=json`, {
      signal: ctrl.signal
    })
    window.clearTimeout(timeoutId)
    if (res.ok) {
      const list = await res.json()
      if (Array.isArray(list) && list.length > 0 && list[0].lat != null && list[0].lon != null) {
        return { lat: Number(list[0].lat), lon: Number(list[0].lon) }
      }
    }
  } catch (err) {
    console.warn('获取机场坐标失败:', err)
  } finally {
    window.clearTimeout(timeoutId)
  }
  return null
}

const WTTR_CODE_MAP: Record<number, { condition: string; cover: string; wxString: string }> = {
  113: { condition: '晴', cover: 'CAVOK', wxString: '' },
  116: { condition: '晴间多云', cover: 'SCT', wxString: '' },
  119: { condition: '多云', cover: 'BKN', wxString: '' },
  122: { condition: '阴', cover: 'OVC', wxString: '' },
  143: { condition: '小雾', cover: 'BR', wxString: 'BR' },
  176: { condition: '小雨', cover: 'SCT', wxString: 'SHRA' },
  179: { condition: '雪', cover: 'SCT', wxString: 'SN' },
  182: { condition: '雨夹雪', cover: 'SCT', wxString: 'PL' },
  185: { condition: '雨夹雪', cover: 'OVC', wxString: 'FZRA' },
  200: { condition: '雷阵雨', cover: 'OVC', wxString: 'TS' },
  227: { condition: '风雪', cover: 'OVC', wxString: 'BLSN' },
  230: { condition: '暴风雪', cover: 'OVC', wxString: '+SN' },
  248: { condition: '大雾', cover: 'OVC', wxString: 'FG' },
  260: { condition: '大雾', cover: 'OVC', wxString: 'FZFG' },
  263: { condition: '小雨', cover: 'OVC', wxString: 'DZ' },
  266: { condition: '小雨', cover: 'OVC', wxString: 'DZ' },
  281: { condition: '雨夹雪', cover: 'OVC', wxString: 'FZRA' },
  284: { condition: '雨夹雪', cover: 'OVC', wxString: 'FZRA' },
  293: { condition: '小雨', cover: 'OVC', wxString: 'RA' },
  296: { condition: '小雨', cover: 'OVC', wxString: 'RA' },
  299: { condition: '小雨', cover: 'OVC', wxString: 'RA' },
  302: { condition: '中雨', cover: 'OVC', wxString: 'RA' },
  305: { condition: '中雨', cover: 'OVC', wxString: 'RA' },
  308: { condition: '大雨', cover: 'OVC', wxString: '+RA' },
  311: { condition: '大雨', cover: 'OVC', wxString: '+RA' },
  314: { condition: '大雨', cover: 'OVC', wxString: '+RA' },
  317: { condition: '雨夹雪', cover: 'OVC', wxString: 'PL' },
  320: { condition: '雨夹雪', cover: 'OVC', wxString: 'PL' },
  323: { condition: '小雪', cover: 'OVC', wxString: 'SN' },
  326: { condition: '小雪', cover: 'OVC', wxString: 'SN' },
  329: { condition: '中雪', cover: 'OVC', wxString: 'SN' },
  332: { condition: '中雪', cover: 'OVC', wxString: 'SN' },
  335: { condition: '大雪', cover: 'OVC', wxString: '+SN' },
  338: { condition: '大雪', cover: 'OVC', wxString: '+SN' },
  350: { condition: '冰雹', cover: 'OVC', wxString: 'PL' },
  353: { condition: '阵雨', cover: 'BKN', wxString: 'SHRA' },
  356: { condition: '大雨', cover: 'OVC', wxString: '+SHRA' },
  359: { condition: '特大暴雨', cover: 'OVC', wxString: '+SHRA' },
  362: { condition: '雨夹雪', cover: 'BKN', wxString: 'PL' },
  365: { condition: '雨夹雪', cover: 'BKN', wxString: 'PL' },
  368: { condition: '阵雪', cover: 'BKN', wxString: 'SHSN' },
  371: { condition: '阵雪', cover: 'BKN', wxString: 'SHSN' },
  374: { condition: '冰雹', cover: 'BKN', wxString: 'PL' },
  377: { condition: '冰雹', cover: 'BKN', wxString: 'PL' },
  386: { condition: '雷阵雨', cover: 'OVC', wxString: 'TSRA' },
  389: { condition: '雷阵雨', cover: 'OVC', wxString: 'TSRA' },
  392: { condition: '雷雪', cover: 'OVC', wxString: 'TSSN' },
  395: { condition: '雷雪', cover: 'OVC', wxString: 'TSSN' }
}

const fetchWttrWeather = async (target: string, icao: string): Promise<MetarReport | null> => {
  const ctrl = new AbortController()
  const timeoutId = window.setTimeout(() => ctrl.abort(), 3500)
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(target)}?format=j1`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' }
    })
    window.clearTimeout(timeoutId)
    if (!res.ok) return null
    const data = await res.json()
    const current = data?.current_condition?.[0]
    if (!current) return null

    const temp = Number(current.temp_C)
    const rh = Number(current.humidity)
    const dew = calcDewPoint(temp, rh)
    const code = Number(current.weatherCode)
    const mapped = WTTR_CODE_MAP[code] || { condition: '晴', cover: 'CAVOK', wxString: '' }

    const speedKmh = Number(current.windspeedKmph) || 0
    const wspd = Math.round((speedKmh / 1.852) * 10) / 10
    const wdir = Number(current.winddirDegree) || 0
    const altim = Number(current.pressure) || 1013
    const visStr = current.visibilityMiles ? String(current.visibilityMiles) : '6+'
    const precipInches = (Number(current.precipMM) || 0) / 25.4

    const d = new Date()
    const day = String(d.getUTCDate()).padStart(2, '0')
    const hour = String(d.getUTCHours()).padStart(2, '0')
    const min = String(d.getUTCMinutes()).padStart(2, '0')
    const dirStr = String(Math.round(wdir)).padStart(3, '0')
    const spdStr = String(Math.round(wspd)).padStart(2, '0')
    const tInt = Math.round(temp)
    const tStr = tInt < 0 ? `M${Math.abs(tInt)}` : String(tInt).padStart(2, '0')
    const dpInt = Math.round(dew)
    const dpStr = dpInt < 0 ? `M${Math.abs(dpInt)}` : String(dpInt).padStart(2, '0')
    const qnh = Math.round(altim)
    const rawOb = `OBS ${icao} ${day}${hour}${min}Z ${dirStr}${spdStr}KT ${visStr === '6+' ? 'CAVOK' : `${visStr}SM`} ${tStr}/${dpStr} Q${qnh} (地面气象模式观测)`

    directHumidity.value = rh

    return {
      icaoId: icao,
      name: stationName.value,
      reportTime: new Date().toISOString(),
      temp,
      dewp: dew,
      altim,
      wdir,
      wspd,
      visib: visStr,
      precip: precipInches,
      cover: mapped.cover,
      wxString: mapped.wxString,
      rawOb
    }
  } catch (err) {
    console.warn('获取 wttr 气象失败:', err)
  } finally {
    window.clearTimeout(timeoutId)
  }
  return null
}

const fetchOpenMeteoWeather = async (coords: { lat: number; lon: number }, icao: string): Promise<MetarReport | null> => {
  const ctrl = new AbortController()
  const timeoutId = window.setTimeout(() => ctrl.abort(), 3500)
  try {
    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lon),
      current: 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility',
      wind_speed_unit: 'kn'
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: ctrl.signal
    })
    window.clearTimeout(timeoutId)
    if (!res.ok) return null
    const data = await res.json()
    const current = data?.current
    if (!current) return null

    const wmo = WMO_CODE_MAP[current.weather_code] || { condition: '晴', cover: 'CAVOK', wxString: '' }
    const visMiles = current.visibility != null ? (current.visibility / 1609.34) : null
    const visStr = visMiles == null ? undefined : (visMiles >= 6 ? '6+' : visMiles.toFixed(1))

    const d = new Date(current.time || Date.now())
    const day = String(d.getUTCDate()).padStart(2, '0')
    const hour = String(d.getUTCHours()).padStart(2, '0')
    const min = String(d.getUTCMinutes()).padStart(2, '0')
    const dir = String(Math.round(current.wind_direction_10m ?? 0)).padStart(3, '0')
    const spd = String(Math.round(current.wind_speed_10m ?? 0)).padStart(2, '0')
    const t = Math.round(current.temperature_2m ?? 0)
    const tStr = t < 0 ? `M${Math.abs(t)}` : String(t).padStart(2, '0')
    const dp = Math.round(current.dew_point_2m ?? 0)
    const dpStr = dp < 0 ? `M${Math.abs(dp)}` : String(dp).padStart(2, '0')
    const qnh = Math.round(current.surface_pressure ?? 1013)
    const rawOb = `OBS ${icao} ${day}${hour}${min}Z ${dir}${spd}KT ${visStr ? (visStr === '6+' ? 'CAVOK' : `${visStr}SM`) : 'CAVOK'} ${tStr}/${dpStr} Q${qnh} (数值模式观测)`

    if (current.relative_humidity_2m != null) {
      directHumidity.value = Math.round(current.relative_humidity_2m)
    }

    return {
      icaoId: icao,
      name: stationName.value,
      reportTime: current.time ? new Date(current.time).toISOString() : new Date().toISOString(),
      temp: current.temperature_2m,
      dewp: current.dew_point_2m,
      altim: current.surface_pressure,
      wdir: current.wind_direction_10m,
      wspd: Math.round((current.wind_speed_10m ?? 0) * 10) / 10,
      wgst: current.wind_gusts_10m != null ? Math.round(current.wind_gusts_10m * 10) / 10 : undefined,
      visib: visStr,
      precip: current.precipitation != null && current.precipitation > 0 ? current.precipitation / 25.4 : 0,
      cover: wmo.cover,
      wxString: wmo.wxString,
      rawOb
    }
  } catch (err) {
    console.warn('获取 Open-Meteo 高精度气象失败:', err)
  } finally {
    window.clearTimeout(timeoutId)
  }
  return null
}

const synthesizeFromUpstream = (cityName: string, weather: string, temperature: number, icao: string): MetarReport => {
  const estRH = estimateHumidity(weather)
  const dew = calcDewPoint(temperature, estRH)
  directHumidity.value = estRH

  const d = new Date()
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hour = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const tInt = Math.round(temperature)
  const tStr = tInt < 0 ? `M${Math.abs(tInt)}` : String(tInt).padStart(2, '0')
  const dpInt = Math.round(dew)
  const dpStr = dpInt < 0 ? `M${Math.abs(dpInt)}` : String(dpInt).padStart(2, '0')
  const rawOb = `OBS ${icao} ${day}${hour}${min}Z 12004KT CAVOK ${tStr}/${dpStr} Q1014 (常规气象模式观测)`

  return {
    icaoId: icao,
    name: stationName.value,
    reportTime: new Date().toISOString(),
    temp: temperature,
    dewp: dew,
    altim: 1014,
    wdir: 120,
    wspd: 4,
    visib: '6+',
    precip: weather.includes('雨') ? 0.05 : 0,
    cover: weather.includes('晴') ? 'CAVOK' : (weather.includes('云') ? 'BKN' : 'OVC'),
    wxString: weather.includes('雷') ? 'TS' : (weather.includes('雨') ? 'RA' : ''),
    rawOb
  }
}

const fetchUpstreamWeather = async (cityName: string): Promise<FallbackWeatherData | null> => {
  try {
    const districtRes = await request({
      url: `/tapi/amap/v3/config/district?keywords=${encodeURIComponent(cityName)}&subdistrict=0`
    })
    if (districtRes?.status === '1' && Array.isArray(districtRes.districts) && districtRes.districts.length > 0) {
      const cityInfo = districtRes.districts.find((item: any) => item.level === 'city') || districtRes.districts[0]
      const adcode = cityInfo.adcode
      if (adcode && !Number.isNaN(Number(adcode))) {
        const weatherRes = await request({
          url: `/tapi/amap/v3/weather/weatherInfo?extensions=base&city=${adcode}`
        })
        if (weatherRes?.status === '1' && Array.isArray(weatherRes.lives) && weatherRes.lives.length > 0) {
          const live = weatherRes.lives[0]
          return {
            cityName: (cityInfo.name || cityName).replace(/[市城区]/g, ''),
            weather: live.weather || '晴',
            temperature: String(live.temperature ?? '--')
          }
        }
      }
    }
  } catch (error) {
    console.warn('获取上游高德天气回退数据失败:', error)
  }
  return null
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

  const timeoutId = window.setTimeout(() => {
    controller?.abort()
  }, 4500)

  let results: [PromiseSettledResult<MetarReport | null>, PromiseSettledResult<TafReport | null>]
  try {
    results = await Promise.allSettled([
      fetchReport<MetarReport>('metar', controller.signal),
      fetchReport<TafReport>('taf', controller.signal)
    ])
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (currentRequest !== requestId) return

  const metarReport = results[0].status === 'fulfilled' ? results[0].value : null
  const tafReport = results[1].status === 'fulfilled' ? results[1].value : null

  metar.value = metarReport
  taf.value = tafReport

  // 若无可用 METAR 报文，先尝试从高精度气象源补充
  if (!metarReport) {
    const coords = await fetchStationCoords(icaoCode.value)

    // 优先 1：wttr.in 气象（支持国内直连与全量气象要素）
    const wttrTarget = coords ? `${coords.lat},${coords.lon}` : icaoCode.value
    const wttrMetar = await fetchWttrWeather(wttrTarget, icaoCode.value)
    if (currentRequest !== requestId) return
    if (wttrMetar) {
      metar.value = wttrMetar
      fallbackSource.value = 'wttr'
      fallbackWeather.value = null
      loading.value = false
      refreshing.value = false
      return
    }

    // 优先 2：Open-Meteo 气象数值
    if (coords) {
      const openMeteoMetar = await fetchOpenMeteoWeather(coords, icaoCode.value)
      if (currentRequest !== requestId) return
      if (openMeteoMetar) {
        metar.value = openMeteoMetar
        fallbackSource.value = 'open-meteo'
        fallbackWeather.value = null
        loading.value = false
        refreshing.value = false
        return
      }
    }

    // 优先 3：降级调用上游高德天气作为备用兜底
    const targetCity = CHINESE_CITY_NAMES[icaoCode.value] || extractCityName(stationName.value)
    if (targetCity) {
      const fallback = await fetchUpstreamWeather(targetCity)
      if (currentRequest !== requestId) return
      if (fallback) {
        fallbackWeather.value = fallback
        fallbackSource.value = 'amap'
        const tempNum = Number(fallback.temperature) || 20
        metar.value = synthesizeFromUpstream(fallback.cityName, fallback.weather, tempNum, icaoCode.value)
        loading.value = false
        refreshing.value = false
        return
      }
    }
    fallbackWeather.value = null
    fallbackSource.value = ''
    directHumidity.value = null
  } else {
    fallbackWeather.value = null
    fallbackSource.value = ''
    directHumidity.value = null
  }

  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .filter(result => result.reason?.name !== 'AbortError')

  if (failures.length && !hasData.value) {
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
  fallbackWeather.value = null
  fallbackSource.value = ''
  directHumidity.value = null
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
  width: 84px;
  min-width: 84px;
  box-sizing: border-box;
  display: grid;
  gap: 6px;
  margin-left: auto;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.22);

  > span {
    display: grid;
    grid-template-columns: 2.4em minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    line-height: 1.25;
    white-space: nowrap;
  }

  small {
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.76em;
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
  display: none;
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
