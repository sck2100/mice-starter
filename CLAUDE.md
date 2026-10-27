# 爆鼠闖天下 BooMMouse Goes Wild

給小朋友玩的網頁遊戲系列，一章一個資料夾。角色和圖全部來自 BooMMouse 親手畫的作品。
目標裝置是平板，以手指觸控為主，也要能用電腦玩。純 HTML/CSS/JS，沒有建置工具，直接雙擊 html 就能玩。

## 檔案結構
```
hope-mice-starter/
├── CLAUDE.md          # 本檔：整個系列共通的規則
├── index.html         # 章節選單，只放各章的連結
├── tools/sync-chapters.py  # 改了任何圖或程式後跑一次（好朋友圖、下載圖、防快取版本號）
├── chapter1-amazon/   # 第一章：亞馬遜吃瓜子（細節見 chapter1-amazon/CLAUDE.md）
├── chapter2-amazon/   # 第二章～第五章：從第一章複製，玩法相同，只換圖
├── chapter3-amazon/
├── chapter4-amazon/
├── chapter5-amazon/
└── _archive/          # 舊的雛型，不再連結
    ├── games/seed-parade/   # 老鼠吃瓜子雛型（第一章的參考來源）
    └── assets/
        ├── sprites/         # 去背角色圖：mouse.png、mouse-dizzy.png、cat.png
        └── originals-*      # BooMMouse 的原圖。不要修改，也不要刪除。
```

## 章節規則
- 每章資料夾命名 `chapterN-主題`，自己有一份 CLAUDE.md 寫該章的玩法與設定。
- 每章要能獨立運作：用到的圖都複製到該章的 `assets/`，不要用 `../` 去讀別章或 `_archive` 的檔案（回首頁的連結 `../index.html` 除外）。
- 新增一章時：在根目錄 `index.html` 把該章的「即將推出」卡片改成 `<a class="ch" href="chapterN-xxx/index.html">`，並在 `TEXT` 裡補上中英文章名。
- 每章開始畫面左上角、遊戲區最上面的狀態列都放「← 所有章節」連回 `../index.html`。
- 破關的勳章卡下方列出其他章節（連到 `../chapterN-amazon/index.html`，標出已完成／還沒完成）；資料夾名稱一定要是 `chapterN-amazon` 這個格式，改名的話要改 `game.js` 的 `renderChapters()`。
- 開新章節建議從 chapter1-amazon 複製一份再改：`index.html`、`style.css`、`i18n.js`（文字）、`levels.js`（關卡）、`game.js`、`assets/`，並把 CLAUDE.md 改寫成該章的內容。
- 好朋友小老鼠：破過的章節，牠的 `mouse.png` 會在別章每關吃到第 1 顆瓜子時一起來排隊（各章 `assets/friends/chN.png` 是複製來的）。
  換了任何一章的 `mouse.png` 或 `reveal.png` 後，在根目錄跑 `python tools/sync-chapters.py`，會更新每章的 friends 圖和下載用 base64 圖。
  新增第 6 章時：`levels.js` 的 `CHAPTER` 改成 6，所有章的 `CHAPTER_COUNT` 改成 6，再跑一次 sync。
- 每章都支援 `?test` 測試模式（例如每關只要吃 1 顆就過關），方便快速看到結局。

## 共通
- 中文／英文兩種介面，切換按鈕在畫面右上角。
- localStorage 全系列共用的 key：`boommouse-lang`（語言 `en`／`zh`）、`boommouse-name`（玩家名字）。各章自己的資料用 `boommouse-章節-xxx` 命名，避免互相蓋掉。
- 音效用 Web Audio 即時合成，不依賴外部音檔。
- 視覺風格：方格筆記紙背景、粗黑描邊、圓角貼紙感按鈕。字型是 LXGW WenKai TC（中文標題、內文）和 Baloo 2（數字、英文）。
- 防快取：html 裡引用的 css／js／圖片網址後面有 `?v=版本號`，JS 載入的圖用 `game.js` 的 `asset()` 查 `assets/versions.js`。
  版本號由 `python tools/sync-chapters.py` 依檔案內容自動算，**改了任何檔案（圖、css、js）之後都要跑一次**再上傳；新增 `<script>`／`<img>` 不用手寫 `?v=`，跑一次就會補上。
- 不用 ES modules（`file://` 會擋 `import`），多個 js 檔用一般 `<script>` 依序載入。
- 要從 Canvas 匯出圖片（下載）時，`file://` 下畫了本機圖檔會被禁止匯出，改用 base64 版的圖（做法見 chapter1-amazon）。

## 開發原則
- 介面文字一律預設英文（第一次開啟、還沒選過語言時顯示英文），中文用台灣用語，讓小朋友看得懂。
- 觸控範圍要大，不要依賴 hover。
- 對小朋友友善：失敗畫面要溫和，不要嚇人的音效或字眼。
- 新角色圖片的去背：BooMMouse 的畫多半有彩色背景，請用 Python 處理：
  1. 先裁出角色所在的區域，放大 2 倍
  2. 用 rembg 的 `isnet-general-use` 模型去背（`isnet-anime` 對她的畫效果很差，不要用）
  3. 用 OpenCV GrabCut 收邊：rembg 的 alpha 當初始遮罩，再用顏色補強（例如貓的橘色、衣服的藍色設為前景）
  4. 只保留最大的連通區塊，輸出最長邊 440px 的透明 PNG 到該章的 `assets/`
- 每次改完都要能在瀏覽器直接打開測試。
