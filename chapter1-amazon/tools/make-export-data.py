# 產生 assets/export-data.js：把下載用的圖轉成 base64。
# 雙擊開 index.html（file://）時，Canvas 畫了本機圖檔就不能匯出，用 base64 版才能下載。
# reveal.png 或 mouse.png 換圖之後，重跑一次：python tools/make-export-data.py
import base64, pathlib

assets = pathlib.Path(__file__).resolve().parent.parent / 'assets'
items = {'reveal': 'reveal.png', 'mouse': 'mouse.png'}
lines = ['// 自動產生，不要手改。來源：tools/make-export-data.py', 'window.EXPORT_IMG = {']
for key, name in items.items():
    b64 = base64.b64encode((assets / name).read_bytes()).decode('ascii')
    lines.append(f"  {key}: 'data:image/png;base64,{b64}',")
lines.append('};')
(assets / 'export-data.js').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('wrote', assets / 'export-data.js')
