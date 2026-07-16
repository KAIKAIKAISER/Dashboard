<template>
  <div
    class="wrapper material-weather"
    :style="{
      padding: componentSetting.padding + 'px'
    }"
  >
    <section class="weather-card">
      <header class="weather-header">
        <div class="station">
          <strong>{{ icaoCode }}</strong>
          <span>{{ stationName }}</span>
        </div>
        <a
          class="detail-link"
          :href="detailURL"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="detail-full">METAR-TAF</span>
          <span class="detail-compact">详情</span>
          ↗
        </a>
      </header>

      <div v-if="loading && !hasData" class="state-message">
        正在获取航空天气…
      </div>

      <div v-else-if="!hasData" class="state-message state-error">
        <strong>暂时无法获取 {{ icaoCode }} 天气</strong>
        <span>{{ errorMessage || '该机场目前没有可用的 METAR / TAF。' }}</span>
        <a :href="detailURL" target="_blank" rel="noopener noreferrer">
          前往 metar-taf.com 查看
        </a>
      </div>

      <template v-else>
        <div class="weather-summary">
          <span
            v-if="metar?.fltCat"
            class="flight-category"
            :data-category="metar.fltCat"
          >
            {{ metar.fltCat }}
          </span>
          <span v-if="metar?.temp != null" class="summary-temp">
            <small>温度</small>{{ formatNumber(metar.temp) }}°C
          </span>
          <span v-if="metar?.dewp != null" class="summary-dewpoint">
            <small>露点</small>{{ formatNumber(metar.dewp) }}°C
          </span>
          <span v-if="windText" class="summary-wind">
            <small>风</small>{{ windText }}
          </span>
          <span v-if="metar?.visib" class="summary-visibility">
            <small>能见度</small>{{ metar.visib }} SM
          </span>
          <span v-if="metar?.altim != null" class="summary-qnh">
            <small>QNH</small>{{ formatNumber(metar.altim) }} hPa
          </span>
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
          <button type="button" :disabled="refreshing" @click="loadWeather">
            刷新
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue'

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
  rawOb?: string
}

interface TafReport {
  icaoId?: string
  name?: string
  issueTime?: string
  rawTAF?: string
}

const props = defineProps({
  componentSetting: {
    type: Object,
    required: true
  }
})

const API_BASE = 'https://aviationweather.gov/api/data'

const icaoCode = computed(() => {
  const value = String(props.componentSetting.icaoCode || 'ZBAA').trim().toUpperCase()
  return /^[A-Z0-9]{3,4}$/.test(value) ? value : 'ZBAA'
})

const metar = ref<MetarReport | null>(null)
const taf = ref<TafReport | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')

const hasData = computed(() => Boolean(metar.value || taf.value))
const stationName = computed(() => metar.value?.name || taf.value?.name || '航空天气')
const detailURL = computed(() => `https://metar-taf.com/en/${icaoCode.value}`)

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
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  padding: 14px;
  overflow: auto;
  color: #f7f9fc;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(30, 41, 59, 0.72));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: inherit;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
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

.detail-link,
.state-message a {
  flex: none;
  color: #7dd3fc;
  text-decoration: none;
}

.detail-compact {
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

@container (max-height: 140px) {
  .weather-card {
    gap: 6px;
    padding: 8px 10px;
    overflow: hidden;
  }

  .station strong {
    font-size: 18px;
  }

  .detail-link {
    font-size: 11px;
  }

  .weather-summary {
    flex-wrap: nowrap;
    gap: 5px;
    overflow: hidden;

    > span {
      min-width: 0;
      flex: none;
      padding: 5px 7px;
      font-size: 12px;
      white-space: nowrap;
    }

    small {
      display: none;
    }
  }

  .weather-summary .flight-category {
    min-width: 34px;
    padding-inline: 6px;
  }

  .reports,
  footer {
    display: none;
  }
}

@container (max-width: 220px) {
  .station span,
  .detail-full,
  .summary-dewpoint,
  .summary-visibility,
  .summary-qnh {
    display: none;
  }

  .detail-compact {
    display: inline;
  }
}

@container (max-width: 155px) {
  .weather-card {
    padding-inline: 7px;
  }

  .weather-header {
    gap: 6px;
  }

  .summary-wind {
    max-width: 58px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@container (max-height: 64px) {
  .weather-card {
    justify-content: center;
  }

  .weather-summary {
    display: none;
  }
}
</style>
