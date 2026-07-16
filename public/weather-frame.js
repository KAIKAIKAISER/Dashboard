(function loadMetarTafWidget() {
  const params = new URLSearchParams(window.location.search)
  const rawIcao = String(params.get('icao') || 'ZBAA').trim().toUpperCase()
  const icao = /^[A-Z0-9]{3,4}$/.test(rawIcao) ? rawIcao : 'ZBAA'
  const target = document.getElementById('metartaf-weather')

  target.href = `https://metar-taf.com/en/${icao}`
  target.textContent = `METAR / TAF ${icao}`

  const script = document.createElement('script')
  script.async = true
  script.defer = true
  script.crossOrigin = 'anonymous'
  script.src = `https://metar-taf.com/en/embed-js/${icao}?layout=landscape&target=weather`
  script.onerror = () => {
    target.textContent = `Open METAR / TAF ${icao}`
  }
  document.head.appendChild(script)
})()
