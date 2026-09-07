'use strict'

const LOTTO649_FALLBACK = require('../lotto649-fallback.json')

const WINDOW_SIZE = 50
const TREND_URL = 'http://www.9800.com.tw/trend.asp'
const DROP_URL = 'http://www.9800.com.tw/drop.asp'

const GAMES = {
  lotto649: {
    id: 'lotto649',
    title: '大樂透',
    keywords: ['大樂透分析'],
    maxNumber: 49,
    drawSize: 6,
    periodSource: '1\\d{5}',
    gameUrl: 'http://www.9800.com.tw/lotto649/trend.html',
    type: '1',
    historyUrl: DROP_URL,
    hasSpecial: true,
    drawWeekdays: [2, 5],
    excludedEnv: 'BOT_LOTTO649_EXCLUDED_NUMBERS'
  },
  lotto539: {
    id: 'lotto539',
    title: '今彩539',
    keywords: ['539分析', '今彩539分析'],
    maxNumber: 39,
    drawSize: 5,
    periodSource: '1\\d{5}',
    gameUrl: 'http://www.9800.com.tw/lotto539/trend.html',
    type: '5',
    historyUrl: TREND_URL,
    drawWeekdays: [1, 2, 3, 4, 5, 6],
    excludedEnv: 'BOT_539_EXCLUDED_NUMBERS'
  },
  fantasy5: {
    id: 'fantasy5',
    title: '天天樂',
    keywords: ['天天樂分析'],
    maxNumber: 39,
    drawSize: 5,
    periodSource: '0\\d{5}',
    gameUrl: 'http://www.9800.com.tw/fantasy5/trend.html',
    type: '15',
    historyUrl: TREND_URL,
    drawWeekdays: [1, 2, 3, 4, 5, 6],
    excludedEnv: 'BOT_FANTASY5_EXCLUDED_NUMBERS'
  },
  marksix: {
    id: 'marksix',
    title: '香港六合彩',
    keywords: ['香港六合分析', '香港六合彩分析'],
    maxNumber: 49,
    drawSize: 6,
    periodSource: '0\\d{5}',
    gameUrl: 'http://www.9800.com.tw/lotto6/trend.html',
    type: '6',
    historyUrl: DROP_URL,
    hasSpecial: true,
    drawWeekdays: [2, 4, 6],
    excludedEnv: 'BOT_MARKSIX_EXCLUDED_NUMBERS'
  }
}

const gameCache = new Map()
const pad2 = value => String(parseInt(value, 10)).padStart(2, '0')

function taipeiDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) }
}

function nextDrawDate(game, date) {
  if (!isValidDate(date)) return '下期日期未提供'
  const weekdays = game.drawWeekdays || []
  const cursor = new Date(`${date}T00:00:00Z`)
  const labels = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  for (let offset = 1; offset <= 7; offset += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (!weekdays.includes(cursor.getUTCDay())) continue
    const nextDate = cursor.toISOString().slice(0, 10)
    return `${nextDate}${labels[cursor.getUTCDay()]}`
  }
  return '下期日期未提供'
}

function normalizedText(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

const keywordMap = new Map()
for (const game of Object.values(GAMES)) {
  for (const keyword of game.keywords) keywordMap.set(normalizedText(keyword), game)
}

function resolveGame(text) {
  return keywordMap.get(normalizedText(text)) || null
}

function allKeywords() {
  return Object.values(GAMES).flatMap(game => game.keywords)
}

function stripHTML(input) {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[｜|]/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isValidDate(value) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(String(value || ''))
}

function normalizeDraw(draw) {
  return {
    period: String(draw?.period || '').replace(/\D/g, ''),
    date: String(draw?.date || ''),
    nums: (draw?.nums || draw?.numbers || []).map(pad2).sort((a, b) => +a - +b),
    special: draw?.special == null ? null : pad2(draw.special)
  }
}

function validDraw(draw, game) {
  if (!draw || !(new RegExp(`^${game.periodSource}$`)).test(draw.period) || !isValidDate(draw.date)) return false
  if (draw.nums.length !== game.drawSize || new Set(draw.nums).size !== game.drawSize) return false
  if (!draw.nums.every(num => +num >= 1 && +num <= game.maxNumber)) return false
  if (!game.hasSpecial) return true
  return +draw.special >= 1 && +draw.special <= game.maxNumber && !draw.nums.includes(draw.special)
}

function mergeDraws(game, ...lists) {
  const merged = new Map()
  for (const item of lists.flat()) {
    const draw = normalizeDraw(item)
    if (validDraw(draw, game)) merged.set(draw.period, draw)
  }
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || +b.period - +a.period)
}

function decodedPeriodCount(text, game) {
  return (stripHTML(text).match(new RegExp(`\\b${game.periodSource}\\b`, 'g')) || []).length
}

async function requestText(game, url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(process.env.BOT_FETCH_TIMEOUT_MS || 16000)))
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      body: options.body || undefined,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        ...(options.headers || {})
      }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const variants = []
    for (const encoding of ['utf-8', 'big5']) {
      try {
        const text = new TextDecoder(encoding).decode(buffer)
        variants.push({ text, periods: decodedPeriodCount(text, game) })
      } catch (_) {}
    }
    variants.sort((a, b) => b.periods - a.periods)
    return variants[0]?.text || Buffer.from(buffer).toString('utf8')
  } finally {
    clearTimeout(timeout)
  }
}

async function postForm(game, url, body) {
  return requestText(game, url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': game.gameUrl
    }
  })
}

async function latestPeriod(game) {
  const html = await requestText(game, game.gameUrl)
  const periods = stripHTML(html).match(new RegExp(`\\b${game.periodSource}\\b`, 'g')) || []
  if (!periods.length) throw new Error(`${game.title}最新期號解析失敗`)
  return periods.reduce((best, current) => +current > +best ? current : best)
}

function parseTableHistory(html, game) {
  const rows = []
  const periodPattern = new RegExp(`\\b(${game.periodSource})\\b\\s+(20\\d{2}-\\d{2}-\\d{2})\\s+[^0-9]*?((?:\\d{1,2}\\s+){5}\\d{1,2})\\s*\\+\\s*(\\d{1,2})`)
  for (const block of String(html).match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const match = stripHTML(block).match(periodPattern)
    if (!match) continue
    const draw = {
      period: match[1],
      date: match[2],
      nums: match[3].trim().split(/\s+/).map(pad2).sort((a, b) => +a - +b),
      special: pad2(match[4])
    }
    if (validDraw(draw, game)) rows.push(draw)
  }
  return mergeDraws(game, rows)
}

function parseFiveNumberHistory(html, game) {
  const text = stripHTML(html)
  const rows = []
  const regex = new RegExp(`(${game.periodSource})\\s+(\\d{1,2}[-/]\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})`, 'g')
  let match
  while ((match = regex.exec(text))) {
    const nums = [match[3], match[4], match[5], match[6], match[7]].map(pad2)
    if (nums.length !== 5 || new Set(nums).size !== 5 || !nums.every(n => +n >= 1 && +n <= 39)) continue
    rows.push({ period: match[1], md: match[2], nums: nums.sort((a, b) => +a - +b) })
  }
  rows.sort((a, b) => +b.period - +a.period)
  const taipeiToday = taipeiDateParts()
  let year = taipeiToday.year
  let previousMonth = null
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const [month, day] = row.md.split(/[-/]/).map(Number)
    if (game.id === 'lotto539') {
      year = Number(row.period.slice(0, 3)) + 1911
    } else {
      if (index === 0 && month > taipeiToday.month + 1) year--
      if (previousMonth !== null && month > previousMonth + 4) year--
    }
    row.date = `${year}-${pad2(month)}-${pad2(day)}`
    delete row.md
    previousMonth = month
  }
  return mergeDraws(game, rows)
}

async function fetchLotto649(game) {
  const latest = await latestPeriod(game)
  const rocYear = Number(latest.slice(0, 3))
  const p1 = `${rocYear - 1}001`
  const html = await postForm(game, game.historyUrl, `p1=${encodeURIComponent(p1)}&p2=${encodeURIComponent(latest)}&l=0&type=${game.type}`)
  return parseTableHistory(html, game)
}

async function fetchLotto539(game) {
  const html = await postForm(game, game.historyUrl, `l=70&type=${game.type}`)
  return parseFiveNumberHistory(html, game).slice(0, 70)
}

async function fetchFantasy5(game) {
  const latest = await latestPeriod(game)
  const p1 = String(Math.max(1, +latest - 800)).padStart(latest.length, '0')
  const html = await postForm(game, game.historyUrl, `p1=${encodeURIComponent(p1)}&p2=${encodeURIComponent(latest)}&l=0&type=${game.type}`)
  return parseFiveNumberHistory(html, game)
}

async function fetchMarkSix(game) {
  const latest = await latestPeriod(game)
  const p1 = String(Math.max(1, +latest - 120)).padStart(latest.length, '0')
  const html = await postForm(game, game.historyUrl, `p1=${encodeURIComponent(p1)}&p2=${encodeURIComponent(latest)}&l=0&type=${game.type}`)
  return parseTableHistory(html, game)
}

async function fetchLiveDraws(game) {
  if (game.id === 'lotto649') return fetchLotto649(game)
  if (game.id === 'lotto539') return fetchLotto539(game)
  if (game.id === 'fantasy5') return fetchFantasy5(game)
  if (game.id === 'marksix') return fetchMarkSix(game)
  throw new Error('未知彩種')
}

async function getDraws(game) {
  const cacheMinutes = Math.max(1, Number(process.env.BOT_CACHE_MINUTES || 20))
  const cached = gameCache.get(game.id)
  if (cached?.draws?.length && Date.now() - cached.fetchedAt < cacheMinutes * 60000) return cached
  try {
    const live = await fetchLiveDraws(game)
    const draws = game.id === 'lotto649' ? mergeDraws(game, live, LOTTO649_FALLBACK) : mergeDraws(game, live)
    if (draws.length < WINDOW_SIZE + 1) throw new Error(`僅解析到${draws.length}期，至少需要${WINDOW_SIZE + 1}期`)
    const result = { draws, fetchedAt: Date.now(), source: '樂透堂9800最新資料' }
    gameCache.set(game.id, result)
    return result
  } catch (error) {
    if (game.id !== 'lotto649') throw error
    const fallback = mergeDraws(game, LOTTO649_FALLBACK)
    const newest = fallback[0]
    const age = newest ? Math.abs(Date.now() - new Date(`${newest.date}T12:00:00+08:00`).getTime()) / 86400000 : Infinity
    if (!newest || age > Number(process.env.BOT_FALLBACK_MAX_DAYS || 7)) throw error
    const result = { draws: fallback, fetchedAt: Date.now(), source: '內建備用資料' }
    gameCache.set(game.id, result)
    return result
  }
}

function excludedNumbers(game) {
  const legacy = game.id === 'lotto649' ? process.env.BOT_EXCLUDED_NUMBERS : ''
  return Array.from(new Set(String(process.env[game.excludedEnv] || legacy || '')
    .split(/[\s,，、]+/)
    .filter(Boolean)
    .map(pad2)
    .filter(num => +num >= 1 && +num <= game.maxNumber)))
    .sort((a, b) => +a - +b)
}

function analyzeAt(game, draws, sourceIndex = 0) {
  const source = draws[sourceIndex]
  const indexes = []
  for (let index = sourceIndex + 1; index < draws.length && indexes.length < WINDOW_SIZE; index++) indexes.push(index)
  if (!source || indexes.length < WINDOW_SIZE) throw new Error(`至少需要${WINDOW_SIZE + 1}期資料`)

  const current = new Set(source.nums)
  const excluded = new Set(excludedNumbers(game))
  const rows = []
  for (let value = 1; value <= game.maxNumber; value++) {
    const num = pad2(value)
    if (current.has(num) || excluded.has(num)) continue
    const leads = []
    let totalHits = 0
    let rateSum = 0
    for (const lead of source.nums) {
      let occurrences = 0
      let hits = 0
      for (const index of indexes) {
        const draw = draws[index]
        if (!draw.nums.includes(lead)) continue
        occurrences++
        if (draws[index - 1].nums.includes(num)) hits++
      }
      const rate = occurrences ? hits / occurrences : 0
      if (hits) leads.push({ lead, occurrences, hits, rate })
      totalHits += hits
      rateSum += rate
    }
    const support = leads.length
    const score = support * 1000 + totalHits * 10 + rateSum
    rows.push({ num, score, support, totalHits, leads: leads.sort((a, b) => b.hits - a.hits || b.rate - a.rate) })
  }
  rows.sort((a, b) => b.support - a.support || b.totalHits - a.totalHits || b.score - a.score || +a.num - +b.num)

  const selected = []
  for (const lead of source.nums) {
    const best = rows.map(row => ({ row, link: row.leads.find(item => item.lead === lead) }))
      .filter(item => item.link)
      .sort((a, b) => b.link.hits - a.link.hits || b.row.support - a.row.support || b.row.totalHits - a.row.totalHits || +a.row.num - +b.row.num)[0]
    if (!best) continue
    const duplicate = selected.find(item => item.num === best.row.num)
    if (duplicate) duplicate.primaryLeads.push(lead)
    else if (selected.length < 5) selected.push({ ...best.row, primaryLeads: [lead] })
  }
  for (const row of rows) {
    if (selected.length === 5) break
    if (!selected.some(item => item.num === row.num)) selected.push({ ...row, primaryLeads: [] })
  }
  return { latest: source, rows, selected, window: indexes.length }
}

function nextPeriod(period) {
  return String(Number(period) + 1).padStart(String(period).length, '0')
}

function formatAnalysis(game, analysis) {
  const chosen = analysis.selected.slice(0, 5).map(item => item.num)
  return [
    `【${game.title}下一期分析】`,
    `依據：${analysis.latest.period}期`,
    analysis.latest.nums.join('、'),
    '',
    nextDrawDate(game, analysis.latest.date),
    `分析${nextPeriod(analysis.latest.period)}期5支：`,
    chosen.join('、')
  ].join('\n')
}

async function analyzeGame(game) {
  const source = await getDraws(game)
  const analysis = analyzeAt(game, source.draws, 0)
  return { game, source: source.source, analysis, text: formatAnalysis(game, analysis) }
}

function excludedNumbersByGame() {
  return Object.fromEntries(Object.values(GAMES).map(game => [game.id, excludedNumbers(game)]))
}

module.exports = {
  GAMES,
  WINDOW_SIZE,
  allKeywords,
  analyzeAt,
  analyzeGame,
  excludedNumbersByGame,
  formatAnalysis,
  mergeDraws,
  nextDrawDate,
  nextPeriod,
  normalizedText,
  parseFiveNumberHistory,
  parseTableHistory,
  resolveGame
}
