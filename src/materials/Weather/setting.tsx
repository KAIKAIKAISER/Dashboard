import pick from '../base'

export default {
  formData: {
    icaoCode: 'ZBAA',
    duration: 60,
    padding: 0
  },
  formConf(formData: any) {
    return {
      icaoCode: {
        label: '机场 ICAO 码',
        type: 'input',
        attrs: {
          placeholder: '例如 ZBAA、KJFK、EGLL',
          maxlength: 4,
          clearable: true
        },
        tips: '使用机场 ICAO 码获取 METAR / TAF，并可跳转到 metar-taf.com 查看详情。',
        rules: [{
          required: true,
          validator: (_rule: any, value: any, callback: any) => {
            if (!/^[A-Za-z0-9]{3,4}$/.test(String(value || '').trim())) {
              callback(new Error('请输入 3–4 位机场 ICAO 码'))
              return
            }
            callback()
          }
        }]
      },
      duration: {
        label: '刷新频率',
        type: 'input-number',
        attrs: {
          'controls-position': 'right',
          min: 60,
          max: 12 * 60,
          step: 10,
          style: 'width: 100px'
        },
        unit: 'min',
        tips: '航空天气数据来自 Aviation Weather Center，最短每 60 分钟刷新。'
      },
      ...pick(formData, ['padding'])
    }
  }
}
