'use strict'

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'

const TAIWAN_CITIES = [
  ['新北', 25.012, 121.465], ['台北', 25.038, 121.564], ['桃園', 24.993, 121.301],
  ['新竹', 24.813, 120.967], ['苗栗', 24.565, 120.821], ['台中', 24.147, 120.674],
  ['彰化', 24.075, 120.545], ['南投', 23.915, 120.684], ['雲林', 23.709, 120.431],
  ['嘉義', 23.480, 120.449], ['台南', 22.999, 120.227], ['高雄', 22.627, 120.301],
  ['屏東', 22.676, 120.494], ['宜蘭', 24.757, 121.753], ['花蓮', 23.992, 121.611],
  ['台東', 22.755, 121.150], ['澎湖', 23.571, 119.579], ['金門', 24.449, 118.376],
  ['馬祖', 26.160, 119.951]
]

const WEATHER_TEXT = {
  0: '晴朗', 1: '大致晴朗', 2: '局部多雲', 3: '陰天', 45: '有霧', 48: '霧淞',
  51: '細雨', 53: '細雨', 55: '較強細雨', 56: '凍雨', 57: '較強凍雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '凍雨', 67: '較強凍雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '局部陣雨', 81: '陣雨', 82: '強陣雨', 85: '陣雪', 86: '強陣雪',
  95: '雷雨', 96: '雷雨伴隨冰雹', 99: '強雷雨伴隨冰雹'
}

const HELP_TEXT = [
  '【免費功能】',
  '• 大樂透分析／539分析／天天樂分析／香港六合分析',
  '• 台北明天天氣',
  '• 現在幾點／今天日期',
  '• 計算 125×38',
  '• 擲骰子／丟硬幣／猜拳',
  '• 抽籤 小明、小華、小美',
  '• 1到100抽一個數字',
  '• 聊天、笑話、翻譯、整理文字',
  '• 先傳圖片，再問「這張圖片有什麼？」'
].join('\n')

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000000) / 1000000)
}

function calculate(text) {
  const match = String(text).match(/(?:計算|算一下|等於|幫我算)\s*([0-9+\-*/().×÷xX\s]+)/)
  if (!match) return null
  const expression = match[1].replace(/[×xX]/g, '*').replace(/÷/g, '/').trim()
  if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) return null
  try {
    const result = evaluateExpression(expression)
    if (!Number.isFinite(result)) return '這個算式無法計算。'
    return `${match[1].trim()} = ${formatNumber(result)}`
  } catch (_) {
    return '我看不懂這個算式，範例：@機器人 計算125×38'
  }
}

function evaluateExpression(input) {
  const tokens = String(input).match(/\d+(?:\.\d+)?|[()+\-*/]/g) || []
  const compact = String(input).replace(/\s+/g, '')
  if (tokens.join('') !== compact) throw new Error('算式格式錯誤')
  let index = 0

  function primary() {
    const token = tokens[index++]
    if (token === '(') {
      const value = addition()
      if (tokens[index++] !== ')') throw new Error('括號錯誤')
      return value
    }
    if (token === '+') return primary()
    if (token === '-') return -primary()
    const value = Number(token)
    if (!Number.isFinite(value)) throw new Error('數字錯誤')
    return value
  }

  function multiplication() {
    let value = primary()
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++]
      const right = primary()
      value = operator === '*' ? value * right : value / right
    }
    return value
  }

  function addition() {
    let value = multiplication()
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++]
      const right = multiplication()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }

  const result = addition()
  if (index !== tokens.length) throw new Error('算式未完成')
  return result
}

function randomTool(text) {
  const value = String(text).trim()
  if (/擲骰|丟骰|骰子/.test(value)) return `🎲 骰到：${Math.floor(Math.random() * 6) + 1}`
  if (/丟硬幣|擲硬幣|硬幣正反/.test(value)) return `🪙 結果：${Math.random() < 0.5 ? '正面' : '反面'}`
  if (/猜拳/.test(value)) return `✊ 猜拳：${['剪刀', '石頭', '布'][Math.floor(Math.random() * 3)]}`

  const range = value.match(/(-?\d+)\s*(?:到|至|~|～)\s*(-?\d+).*(?:抽|選|隨機).*(?:數字|號碼|一個)/)
    || value.match(/(?:抽|選|隨機).*(-?\d+)\s*(?:到|至|~|～)\s*(-?\d+)/)
  if (range) {
    const low = Math.min(Number(range[1]), Number(range[2]))
    const high = Math.max(Number(range[1]), Number(range[2]))
    if (high - low > 1000000) return '範圍太大，請設定在100萬以內。'
    return `🎯 隨機數字：${Math.floor(Math.random() * (high - low + 1)) + low}`
  }

  const draw = value.match(/抽籤[：:\s]*(.+)/)
  if (draw) {
    const items = draw[1].split(/[、,，/|\s]+/).map(item => item.trim()).filter(Boolean)
    if (items.length < 2) return '請提供至少兩個選項，例如：@機器人 抽籤 小明、小華、小美'
    if (items.length > 50) return '一次最多抽50個選項。'
    return `🎉 抽中：${items[Math.floor(Math.random() * items.length)]}`
  }
  return null
}

function taiwanDateTime(text) {
  if (!/(現在幾點|現在時間|幾點了|今天日期|今天幾號|今天星期幾)/.test(String(text))) return null
  const now = new Date()
  const date = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long'
  }).format(now)
  const time = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now)
  return `台灣時間：${date} ${time}`
}

function findCity(text) {
  return TAIWAN_CITIES.find(([name]) => String(text).includes(name)) || null
}

async function weather(text) {
  if (!/(天氣|氣溫|溫度|下雨|降雨)/.test(String(text))) return null
  const city = findCity(text)
  if (!city) return '目前免費天氣支援台灣縣市，請這樣問：@機器人 台北明天天氣'
  const day = String(text).includes('後天') ? 2 : String(text).includes('明天') ? 1 : 0
  const params = new URLSearchParams({
    latitude: city[1], longitude: city[2],
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Asia/Taipei', forecast_days: '3'
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(`${WEATHER_URL}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const daily = data.daily || {}
    if (!daily.time?.[day]) throw new Error('沒有預報資料')
    const label = day === 2 ? '後天' : day === 1 ? '明天' : '今天'
    return [
      `【${city[0]}${label}天氣】`,
      `${daily.time[day]}｜${WEATHER_TEXT[daily.weather_code?.[day]] || '天氣代碼' + daily.weather_code?.[day]}`,
      `溫度：${daily.temperature_2m_min?.[day]}～${daily.temperature_2m_max?.[day]}°C`,
      `最高降雨機率：${daily.precipitation_probability_max?.[day]}%`,
      '資料來源：Open-Meteo'
    ].join('\n')
  } catch (_) {
    return '目前天氣資料暫時讀取失敗，請稍後再試。'
  } finally {
    clearTimeout(timer)
  }
}

async function tryFreeTool(text) {
  const value = String(text || '').trim()
  if (/^(功能|幫助|說明|指令|你會什麼|可以做什麼)[？?]?$/.test(value)) return HELP_TEXT
  const result = taiwanDateTime(value) || calculate(value) || randomTool(value)
  if (result) return result
  return weather(value)
}

module.exports = { HELP_TEXT, calculate, randomTool, taiwanDateTime, tryFreeTool, weather }
