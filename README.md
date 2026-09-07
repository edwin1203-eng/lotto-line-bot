# 四合一樂透＋Gemini AI Cloudflare Worker版 V2.3.1

原本四種彩券的抓取、近50期分析和輸出順序完全保留，新增群組內 `@機器人` AI自動判斷功能。沒有提及機器人的一般聊天不會回覆。

本版使用 `gemini-3-flash-preview` 免費層並設定最低思考量，縮短群組回覆時間；另外加入不消耗AI額度的免費工具。

## 群組指令

| 關鍵字 | 分析核心 |
| --- | --- |
| `大樂透分析` | 大樂透近50期隔期拖牌，固定原版5支 |
| `539分析`／`今彩539分析` | 今彩539 V5.8.11預設核心，50期，不加連莊與近期拖牌 |
| `天天樂分析` | 天天樂 V3.1.3近50期原版隔期拖牌，固定5支；日期以台灣時區判定 |
| `香港六合分析`／`香港六合彩分析` | 香港六合彩 V1.0.2近50期正碼隔期拖牌，固定5支 |

四個彩種共用同一個LINE官方帳號、Webhook及限定群組。其他群組與非指令聊天內容不回覆。
四個彩種的分析回覆都會在依據期號碼下方顯示下一期開獎日期及星期；分析結果與5支順序不受影響。

## 必要環境變數

| 名稱 | 說明 |
| --- | --- |
| `LINE_CHANNEL_SECRET` | LINE Developers 的 Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API 長效 Channel access token |
| `ALLOWED_GROUP_ID` | 指定群組 ID |
| `GEMINI_API_KEY` | Google AI Studio金鑰；只有AI聊天需要，原本彩券分析不需要 |

升級時原本三項LINE設定會保留，不需重新輸入，也不需修改LINE官方帳號；只要新增 `GEMINI_API_KEY`。

## 可選環境變數

| 名稱 | 預設 | 說明 |
| --- | --- | --- |
| `BOT_LOTTO649_EXCLUDED_NUMBERS` | 空白 | 大樂透排除號碼 |
| `BOT_539_EXCLUDED_NUMBERS` | 空白 | 今彩539排除號碼 |
| `BOT_FANTASY5_EXCLUDED_NUMBERS` | 空白 | 天天樂排除號碼 |
| `BOT_MARKSIX_EXCLUDED_NUMBERS` | 空白 | 香港六合彩排除號碼 |
| `BOT_GROUP_ID_COMMAND` | `取得群組ID` | 查詢群組ID指令 |
| `BOT_CACHE_MINUTES` | `20` | 成功抓取後的記憶體快取分鐘 |
| `BOT_FETCH_TIMEOUT_MS` | `16000` | 單次來源請求逾時毫秒 |
| `ALLOWED_GROUP_IDS` | 空白 | 多個群組ID，以逗號隔開；原本單一 `ALLOWED_GROUP_ID` 可繼續使用 |

舊版的 `BOT_EXCLUDED_NUMBERS` 仍可當作大樂透排除號碼使用。

## Cloudflare部署方式

1. 把解壓縮後的整個資料夾上傳至新的GitHub儲存庫。
2. 在Cloudflare Workers連接該GitHub儲存庫。
3. 根目錄指定本資料夾，組建命令留空，部署命令填 `npx wrangler deploy --config wrangler.toml`。
4. 在Variables and Secrets加入LINE與Gemini環境變數。
5. 部署後開啟Worker首頁並複製Webhook網址；格式為 `https://你的網址.workers.dev/webhook`。
6. 到LINE Developers的Messaging API設定Webhook URL，按Verify並啟用Use webhook。

## AI使用方式

- `@機器人 講個笑話`：AI直接回答。
- `@機器人 台北明天天氣`：使用Open-Meteo免費天氣資料，不消耗Gemini額度。
- `@機器人 現在幾點`：顯示台灣日期與時間。
- `@機器人 幫我算125×38`：自動計算。
- `@機器人 擲骰子`／`丟硬幣`／`猜拳`：免費隨機遊戲。
- `@機器人 抽籤 小明、小華、小美`：從選項中抽出一個。
- `@機器人 1到100抽一個數字`：產生指定範圍隨機數。
- `@機器人 539分析`：交給原本今彩539分析程式，不耗AI用量。
- 看圖片：先在限定群組傳圖，再於10分鐘內輸入 `@機器人 這張圖片有什麼？`。
- AI保留同一位使用者最近20分鐘的簡短對話；Cloudflare Worker重新啟動後記憶會清除。
- Gemini會在新聞、價格、賽事或其他可能變動的問題中自動使用Google搜尋，一般聊天不必搜尋。
- 搜尋回答會附上最多3個資料來源連結。
- 回答風格改為直接、有結論、敢指出問題；有人直接辱罵機器人時，可用一句短而有梗的話反擊。
- 反擊只針對當下說法或行為，不攻擊外貌、家人、疾病、身分或敏感特徵，也不威脅及連續追罵。
- Google Search Grounding需要Gemini API付費層；搜尋與文字用量依Google當期方案計費。

圖片暫存在Cloudflare Worker執行個體的記憶體；若Worker剛好重新啟動而找不到圖片，再傳一次即可。
天氣資料使用Open-Meteo免費非商業API並於回覆中標示來源。

首頁會自動顯示目前Cloudflare Worker的固定Webhook網址。
