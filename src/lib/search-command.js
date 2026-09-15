'use strict'

const IMAGE_SEARCH_REPLY = '圖片搜尋暫不支援，請自行到 Google 圖片搜尋。'

function parseSearchCommand(text) {
  const match = String(text || '').trim().match(/^(搜尋圖片|搜索圖片|收尋圖片|搜尋|搜索|收尋)(?:[\s：:]+|$)(.*)$/s)
  if (!match) return null
  const query = match[2].trim()
  return { query, image: match[1].includes('圖片') || /(?:圖片|照片|相片|一張.*圖|美女圖|帥哥圖)/.test(query) }
}

function isImageSearchRequest(text) {
  return /(?:搜尋|搜索|收尋|找|給我|提供|傳).*(?:圖片|照片|相片|美女圖|帥哥圖|一張.*圖)/.test(text)
}

module.exports = { IMAGE_SEARCH_REPLY, parseSearchCommand, isImageSearchRequest }
