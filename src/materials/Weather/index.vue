<template>
  <div
    class="wrapper material-weather"
    :style="{
      padding: componentSetting.padding + 'px'
    }"
  >
    <iframe
      :key="refreshKey"
      class="weather-frame"
      :src="weatherFrameURL"
      :title="`METAR / TAF ${icaoCode}`"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { publicPath } from '@/global'

const props = defineProps({
  componentSetting: {
    type: Object,
    required: true
  }
})

const icaoCode = computed(() => {
  const value = String(props.componentSetting.icaoCode || 'ZBAA').trim().toUpperCase()
  return /^[A-Z0-9]{3,4}$/.test(value) ? value : 'ZBAA'
})

const refreshKey = ref(0)
const weatherFrameURL = computed(() => {
  const params = new URLSearchParams({
    icao: icaoCode.value,
    refresh: String(refreshKey.value)
  })
  return `${publicPath}weather-frame.html?${params}`
})

watch(icaoCode, () => {
  refreshKey.value += 1
})

let timer: number | null = null
const refreshTimer = () => {
  if (timer) {
    window.clearInterval(timer)
    timer = null
  }

  const duration = Math.max(Number(props.componentSetting.duration) || 60, 60)
  timer = window.setInterval(() => {
    refreshKey.value += 1
  }, duration * 60 * 1000)
}

watch(
  () => props.componentSetting.duration,
  refreshTimer,
  { immediate: true }
)

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style lang="scss" scoped>
.wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  box-sizing: border-box;
  overflow: hidden;
}

.weather-frame {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: inherit;
  background: transparent;
}
</style>
