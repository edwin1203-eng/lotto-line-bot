'use strict'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const LINE_CONTENT_BASE_URL = 'https://api-data.line.me/v2/bot/message'
const DEFAULT_MODEL = 'gemini-3-flash-preview'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function aiModel() {
  return DEFAULT_MODEL
}

function extractResponseText(payload) {
  return (payload?.candidates?.[0]?.content?.parts || [])
    .filter(part => typeof part?.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

function extractGroundingSources(payload) {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  const seen = new Set()
  return chunks
    .map(chunk => chunk?.web)
    .filter(web => web?.uri && !seen.has(web.uri) && seen.add(web.uri))
    .slice(0, 3)
    .map(web => ({ title: String(web.title || '網路資料'), uri: String(web.uri) }))
}

async function fetchWithTimeout(url, options, timeoutMs = 45000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function downloadLineImage(messageId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('尚未設定LINE_CHANNEL_ACCESS_TOKEN')
  const response = await fetchWithTimeout(
    `${LINE_CONTENT_BASE_URL}/${encodeURIComponent(messageId)}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
    20000
  )
  if (!response.ok) throw new Error(`讀取LINE圖片失敗：HTTP ${response.status}`)
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > MAX_IMAGE_BYTES) throw new Error('圖片超過8MB，請縮小後再傳')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('圖片超過8MB，請縮小後再傳')
  return {
    mimeType: String(response.headers.get('content-type') || 'image/jpeg').split(';')[0],
    data: buffer.toString('base64')
  }
}

async function requestGemini(apiKey, requestBody) {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(aiModel())}:generateContent`
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(requestBody)
  })
}

async function generateAIReply({ text, imageMessageId = '', history = [] }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) throw new Error('AI_NOT_CONFIGURED')

  const parts = [{ text: text || '請描述這張圖片中可見的內容。' }]
  if (imageMessageId) {
    const image = await downloadLineImage(imageMessageId)
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } })
  }

  const requestBody = {
    system_instruction: {
      parts: [{ text: [
        '你是LINE群組內的繁體中文助理。',
        '回答簡短、直接、有結論，以台灣時間與台灣用語為準。',
        '不要討好、不要空泛安慰、不要為了看起來中立而兩邊都說；有明確證據時就清楚判斷。',
        '遇到錯誤觀念、不合理要求或明顯問題，要直接指出問題在哪裡並說明理由。',
        '如果使用者直接辱罵、挑釁或嘲諷你，可以自己判斷並用一句短、有梗、略帶酸度的話反擊，之後回到問題本身。',
        '反擊只針對對方剛才的說法或行為，不攻擊外貌、家人、疾病、身分與其他敏感特徵，不威脅、不洩露個資、不連續追罵。',
        '如果使用者要求你主動攻擊或羞辱另一位真實人物，不照做；可改成不傷人的玩笑或針對具體行為提出尖銳批評。',
        '沒有把握時坦白說不確定。',
        '笑話可直接創作；計算要先確認結果。',
        '遇到新聞、價格、賽事、人物職位、產品規格或其他可能變動的資訊時，使用Google搜尋確認，不要靠印象猜測。',
        '不需要最新資料的一般聊天不要搜尋，避免浪費搜尋額度。',
        '只描述圖片中可見內容，不辨識真實人物身分，也不根據外表推測敏感特徵。',
        '若使用者要彩券分析，提醒可輸入大樂透分析、539分析、天天樂分析或香港六合分析；不要自行改寫彩券號碼。',
        '不要聲稱已替使用者操作手機、傳訊息、付款或執行未連接的外部動作。'
      ].join('\n') }]
    },
    contents: [
      ...history.map(item => ({ role: item.role, parts: [{ text: item.text }] })),
      { role: 'user', parts }
    ],
    tools: [{ google_search: {} }],
    generationConfig: {
      maxOutputTokens: 350,
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: 'minimal' }
    }
  }

  const response = await requestGemini(apiKey, requestBody)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`
    throw new Error(`Gemini回覆失敗：${detail}`)
  }
  const answer = extractResponseText(payload)
  if (!answer) throw new Error('Gemini沒有傳回文字內容')
  const sources = extractGroundingSources(payload)
  if (!sources.length) return answer
  return `${answer}\n\n資料來源：\n${sources.map(source => `• ${source.title}\n${source.uri}`).join('\n')}`
}

module.exports = { aiModel, downloadLineImage, extractGroundingSources, extractResponseText, generateAIReply }
