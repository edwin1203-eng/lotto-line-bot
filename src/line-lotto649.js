'use strict'

const crypto = require('crypto')
const {
  allKeywords,
  analyzeGame,
  excludedNumbersByGame,
  normalizedText,
  resolveGame
} = require('./lib/games')
const { aiModel, generateAIReply } = require('./lib/ai')
const { HELP_TEXT, tryFreeTool } = require('./lib/free-tools')
const { IMAGE_SEARCH_REPLY, parseSearchCommand, isImageSearchRequest } = require('./lib/search-command')

const VERSION = '2.3.2-cloudflare-search-command'
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply'
const DEFAULT_GROUP_ID_COMMAND = '取得群組ID'
const IMAGE_TTL_MS = 10 * 60 * 1000
const CHAT_TTL_MS = 20 * 60 * 1000
const recentImages = new Map()
const recentChats = new Map()

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify(body)
})

function groupIdCommand() {
  return normalizedText(process.env.BOT_GROUP_ID_COMMAND || DEFAULT_GROUP_ID_COMMAND)
}

function allowedGroupIds() {
  return [...new Set(
    `${process.env.ALLOWED_GROUP_ID || ''},${process.env.ALLOWED_GROUP_IDS || ''}`
      .split(/[\s,，;；]+/)
      .map(value => value.trim())
      .filter(Boolean)
  )]
}

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  const actualBuffer = Buffer.from(String(signature))
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

async function replyMessage(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('尚未設定LINE_CHANNEL_ACCESS_TOKEN')
  const response = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: String(text).slice(0, 5000) }] })
  })
  if (!response.ok) throw new Error(`LINE回覆失敗：HTTP ${response.status} ${await response.text()}`)
}

function isBotMentioned(message) {
  return Boolean(message?.mention?.mentionees?.some(item => item?.isSelf === true))
}

function removeBotMention(message) {
  let text = String(message?.text || '')
  const mentions = (message?.mention?.mentionees || [])
    .filter(item => item?.isSelf === true && Number.isInteger(item.index) && Number.isInteger(item.length))
    .sort((a, b) => b.index - a.index)
  for (const mention of mentions) {
    text = text.slice(0, mention.index) + text.slice(mention.index + mention.length)
  }
  return text.replace(/^\s*[,，:：、-]?\s*/, '').trim()
}

function imageKey(event) {
  return `${event.source?.groupId || ''}:${event.source?.userId || ''}`
}

function rememberImage(event) {
  const value = { messageId: event.message?.id, savedAt: Date.now() }
  recentImages.set(imageKey(event), value)
  recentImages.set(`${event.source?.groupId || ''}:`, value)
}

function recentImageFor(event) {
  const personal = recentImages.get(imageKey(event))
  const group = recentImages.get(`${event.source?.groupId || ''}:`)
  const value = personal || group
  if (!value || Date.now() - value.savedAt > IMAGE_TTL_MS) return null
  return value
}

function wantsImage(text) {
  return /照片|相片|圖片|這張|圖中|看圖|外表|長得|穿搭|髮型|影像/.test(String(text || ''))
}

function chatKey(event) {
  return `${event.source?.groupId || ''}:${event.source?.userId || ''}`
}

function chatHistoryFor(event) {
  const value = recentChats.get(chatKey(event))
  if (!value || Date.now() - value.savedAt > CHAT_TTL_MS) return []
  return value.items.slice(-6)
}

function rememberChat(event, userText, modelText) {
  const key = chatKey(event)
  const items = [...chatHistoryFor(event), { role: 'user', text: userText }, { role: 'model', text: modelText }].slice(-6)
  recentChats.set(key, { savedAt: Date.now(), items })
}

async function handleMessage(event) {
  if (event.type !== 'message' || !event.replyToken) return
  if (event.source?.type !== 'group' || !event.source.groupId) return

  const groupId = event.source.groupId
  const allowedGroups = allowedGroupIds()
  const isAllowedGroup = allowedGroups.includes(groupId)

  if (event.message?.type === 'image') {
    if (isAllowedGroup && event.message.id) rememberImage(event)
    return
  }
  if (event.message?.type !== 'text') return

  const rawText = String(event.message.text || '')
  const text = normalizedText(rawText)

  if (text === groupIdCommand()) {
    const message = allowedGroups.length
      ? (isAllowedGroup ? '這個群組已完成綁定。' : `這不是目前綁定的群組。\n若要加入多個群組，請把群組ID填入ALLOWED_GROUP_IDS並用逗號隔開。`)
      : `尚未綁定群組。\n請把以下ID複製到Cloudflare的ALLOWED_GROUP_ID：\n${groupId}`
    await replyMessage(event.replyToken, message)
    return
  }

  const mentioned = isBotMentioned(event.message)
  const prompt = mentioned ? removeBotMention(event.message) : rawText.trim()
  const search = parseSearchCommand(prompt)
  const game = resolveGame(normalizedText(prompt))
  if (!game && !mentioned && !search) return
  if (!allowedGroups.length) {
    await replyMessage(event.replyToken, `尚未綁定群組。\n請先輸入「${groupIdCommand()}」取得群組ID。`)
    return
  }
  if (!isAllowedGroup) return

  try {
    if (search?.image || isImageSearchRequest(prompt)) {
      await replyMessage(event.replyToken, IMAGE_SEARCH_REPLY)
      return
    }
    if (search && !search.query) {
      await replyMessage(event.replyToken, '請在「搜尋」後輸入問題，例如：搜尋 今天台中天氣')
      return
    }
    if (game) {
      const result = await analyzeGame(game)
      await replyMessage(event.replyToken, result.text)
      return
    }

    if (!prompt) {
      await replyMessage(event.replyToken, HELP_TEXT)
      return
    }

    const freeToolAnswer = search ? null : await tryFreeTool(prompt)
    if (freeToolAnswer) {
      await replyMessage(event.replyToken, freeToolAnswer)
      return
    }

    const savedImage = !search && wantsImage(prompt) ? recentImageFor(event) : null
    if (!search && wantsImage(prompt) && !savedImage) {
      await replyMessage(event.replyToken, '請先傳一張圖片，再於10分鐘內 @我 提問，例如「@機器人 這張圖片有什麼？」')
      return
    }
    const answer = await generateAIReply({
      text: search ? `請使用 Google 搜尋查證以下問題，依搜尋結果回答並提供來源。若沒有搜尋結果，明確說明未能查證，不要假裝已搜尋。問題：${search.query}` : prompt,
      imageMessageId: savedImage?.messageId || '',
      history: chatHistoryFor(event)
    })
    rememberChat(event, prompt, answer)
    await replyMessage(event.replyToken, answer)
  } catch (error) {
    const detail = String(error.message || error)
    if (detail === 'AI_NOT_CONFIGURED') {
      await replyMessage(event.replyToken, 'AI對話尚未啟用，請先在Cloudflare加入GEMINI_API_KEY。原本四種彩券分析仍可正常使用。')
    } else if (game) {
      await replyMessage(event.replyToken, `${game.title}資料更新失敗，請稍後再試。\n${detail.slice(0, 300)}`)
    } else {
      console.error('AI reply failed:', detail)
      await replyMessage(event.replyToken, `AI暫時無法回答，請稍後再試。\n${detail.slice(0, 180)}`)
    }
  }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' },
      body: ''
    }
  }

  if (event.httpMethod === 'GET') {
    return json(200, {
      ok: true,
      service: '四合一樂透LINE群組機器人',
      version: VERSION,
      channelSecretConfigured: Boolean(process.env.LINE_CHANNEL_SECRET),
      accessTokenConfigured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      groupBound: allowedGroupIds().length > 0,
      groupCount: allowedGroupIds().length,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      aiProvider: 'Google Gemini',
      aiModel: aiModel(),
      mentionMode: true,
      visionEnabled: true,
      webSearchEnabled: true,
      freeWeatherEnabled: true,
      fastMode: true,
      shortMemoryMinutes: 20,
      triggerKeywords: allKeywords(),
      groupIdCommand: groupIdCommand(),
      outputCount: 5,
      analysisWindow: 50,
      excludedNumbers: excludedNumbersByGame()
    })
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return json(503, { error: '尚未設定LINE_CHANNEL_SECRET' })
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8')
  const signature = event.headers['x-line-signature'] || event.headers['X-Line-Signature']
  if (!verifySignature(rawBody, signature, secret)) return json(401, { error: 'LINE簽章驗證失敗' })

  let body
  try {
    body = JSON.parse(rawBody.toString('utf8'))
  } catch (_) {
    return json(400, { error: 'JSON格式錯誤' })
  }
  for (const webhookEvent of body.events || []) await handleMessage(webhookEvent)
  return json(200, { ok: true })
}

exports._test = {
  verifySignature,
  normalizedText,
  resolveGame,
  isBotMentioned,
  removeBotMention,
  wantsImage,
  recentImages,
  recentChats,
  allowedGroupIds,
  chatHistoryFor
}
