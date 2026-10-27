// LEVELS 來自 levels.js（index.html 先載入它）
(function(){
// 測試用：網址後面加 ?test，每關只要吃 1 顆就過關
const TEST = /[?&]test\b/.test(location.search);
const need = i => TEST ? 1 : LEVELS[i].seeds;
const COLS = 20, ROWS = 12;
const DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const $ = id => document.getElementById(id);
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
};
// ---- 語言：中文 / English，文字都在 i18n.js ----
let lang = store.get('boommouse-lang') || 'en'; // 還沒選過語言時預設英文
const T = () => TEXT[lang];

// 防快取：assets/versions.js（../tools/sync-chapters.py 產生）記著每個檔案的版本，網址後面加 ?v=版本，
// 換了圖之後瀏覽器才不會抓到舊的
const asset = p => p + (window.ASSET_V && window.ASSET_V[p] ? '?v=' + window.ASSET_V[p] : '');
const load = src => { const im = new Image(); im.src = asset(src); return im; };
const img = { mouse: load('assets/mouse.png'), dizzy: load('assets/mouse-dizzy.png') };

// ---- 好朋友小老鼠：破過的別章，牠的小老鼠會來排隊 ----
// 過關紀錄存在 localStorage boommouse-amazon-chN-cleared
const clearedKey = n => 'boommouse-amazon-ch' + n + '-cleared';
let friends = [];
function loadFriends(){
  friends = [];
  for(let n = 1; n <= CHAPTER_COUNT; n++)
    if(n !== CHAPTER && store.get(clearedKey(n))) friends.push(load('assets/friends/ch' + n + '.png'));
}
// 每關吃到第 1 顆瓜子時，好朋友照章節順序一起來排隊（之後每走一步出來一隻）；
// 之後每吃一顆多一隻，從本章和好朋友裡隨機挑
function randomBaby(){
  const pool = [img.mouse, ...friends];
  return pool[Math.floor(Math.random()*pool.length)];
}

const board = $('board'), cv = $('game'), g = cv.getContext('2d'), bg = $('bg');
let W = 640, H = 384, cs = 32, ox = 0, oy = 0;

// ---- 背景圖：不畫進 Canvas，用 CSS 控制 <img> 的模糊 ----
let bgMode = 'plain', bgBlur = null; // plain 素面 / blur 模糊 / clear 完全清楚
function applyBg(){
  const s = bg.style;
  if(bgMode === 'plain'){ s.opacity = '0'; s.filter = 'blur(20px)'; s.transform = 'scale(1.08)'; }
  else if(bgMode === 'blur'){ s.opacity = '.72'; s.filter = 'blur(' + (bgBlur * W / 640).toFixed(1) + 'px)'; s.transform = 'scale(1.06)'; }
  else { s.opacity = '1'; s.filter = 'blur(0px)'; s.transform = 'scale(1)'; }
}
function setBg(blur){ bgMode = blur == null ? 'plain' : 'blur'; bgBlur = blur; applyBg(); }

function fit(){
  W = board.clientWidth; H = board.clientHeight;
  if(!W) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cs = Math.min(W / COLS, H / ROWS); ox = (W - cs*COLS) / 2; oy = (H - cs*ROWS) / 2;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  g.setTransform(dpr,0,0,dpr,ox*dpr,oy*dpr);
  applyBg();
}
if(window.ResizeObserver) new ResizeObserver(fit).observe(board); else window.addEventListener('resize', fit);

// ---- state ----
let S = null, level = 0, playerName = '', soundOn = true;
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

function freshState(){
  return {
    body:[{x:3,y:6}], kinds:[null], joining:[], prev:null, dir:{x:1,y:0}, face:1, queue:[],
    seed:null, eaten:0,
    running:false, waiting:true, paused:false, over:false, done:false,
    last:0, overAt:0, pops:[], squeakAt:0, nextSqueak:0, chirps:{}
  };
}

const eq = (a,b) => a && b && a.x===b.x && a.y===b.y;
const onBody = p => S.body.some(b => eq(b,p));
const near = (a,b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y);

function placeSeed(){
  for(let k=0;k<400;k++){
    const p = { x: Math.floor(Math.random()*COLS), y: Math.floor(Math.random()*ROWS) };
    if(onBody(p) || near(p, S.body[0]) < 3) continue;
    S.seed = p; return;
  }
}

function updatePills(){
  $('nLevel').textContent = level + 1;
  $('nSeeds').textContent = S.eaten;
  $('nNeed').textContent = '/ ' + need(level);
  $('nParade').textContent = S.body.length - 1;
}
function bump(id){ const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function addPop(t, p){ S.pops.push({ t, x:p.x, y:p.y, at: performance.now() }); }
function hideOverlays(){ ['pauseOv','failOv','clearOv'].forEach(id => $(id).hidden = true); }

function enterLevel(i){
  clearTimers();
  level = i; S = freshState(); placeSeed();
  board.classList.remove('reveal');
  $('medalLayer').hidden = true; $('medalCard').hidden = true; $('dpad').hidden = false;
  $('pauseBtn').disabled = false; $('pauseBtn').textContent = T().pause;
  setBg(LEVELS[i].blur);
  hideOverlays(); updatePills();
  S.running = true; // 等小朋友選方向才開始走
}

function step(){
  const was = S.dir;
  while(S.queue.length){
    const d = S.queue.shift();
    if(!isReverse(d, S.dir)){ S.dir = d; break; }
  }
  // 走路時「吱吱」：主角出發、轉彎時叫一聲，直走時每 1.5～3 秒叫一聲
  const now = performance.now(), babies = S.body.length - 1;
  if(now >= S.nextSqueak || (S.dir !== was && now - S.squeakAt > 400)){
    sfx.squeak(1, 0.07); S.chirps[0] = now; S.squeakAt = now;
    S.nextSqueak = now + 1500 + Math.random()*1500;
  }
  // 隊伍裡的寶寶隨機自己叫，每隻聲音不一樣；寶寶越多越熱鬧
  // （每隻平均約 4 秒叫一次，整隊每秒最多約 3 聲）
  const perStep = Math.min(babies / 4, 3) * LEVELS[level].speed / 1000;
  if(babies && Math.random() < perStep){
    const i = 1 + Math.floor(Math.random()*babies);
    sfx.squeak(1.25 + (i*0.37 % 1)*0.35, 0.035, Math.random()*0.08); S.chirps[i] = now;
  }
  if(S.dir.x) S.face = S.dir.x;
  const h = S.body[0];
  // 走出邊緣會從另一邊回來
  const nh = { x:(h.x+S.dir.x+COLS)%COLS, y:(h.y+S.dir.y+ROWS)%ROWS };
  const grow = eq(nh, S.seed), join = !grow && S.joining.length > 0;
  // 沒長大時尾巴會讓開，所以尾巴那格可以走
  const n = grow || join ? S.body.length : S.body.length - 1;
  if(!PASS_THROUGH) for(let i=0;i<n;i++) if(eq(S.body[i], nh)) return fail();

  S.prev = S.body.map(c => ({x:c.x,y:c.y}));
  S.body.unshift(nh);
  // 還有好朋友在等：尾巴不讓開，多出來那格就是下一隻好朋友
  if(join){ S.kinds.push(S.joining.shift()); bump('pParade'); updatePills(); return; }
  if(!grow){ S.body.pop(); return; }
  // 新寶寶排在隊伍最後面；kinds[i] 是隊伍第 i 隻用的圖
  // 好朋友還沒出來完又吃到瓜子時，新寶寶排在好朋友後面
  S.joining.push(...(S.eaten === 0 && friends.length ? friends : [randomBaby()]));
  S.kinds.push(S.joining.shift());
  S.eaten++; sfx.munch(); addPop('+1', nh);
  bump('pSeeds'); bump('pParade'); updatePills();
  if(S.eaten >= need(level)){ S.seed = null; clearLevel(); }
  else placeSeed();
}
const isReverse = (d, cur) => d.x === -cur.x && d.y === -cur.y && S.body.length > 1;

function fail(){
  S.running = false; S.over = true; S.overAt = performance.now(); S.prev = null;
  sfx.bonk();
  $('pauseBtn').disabled = true;
  later(() => {
    renderFail();
    $('failOv').hidden = false;
    $('retryBtn').focus({ preventScroll:true });
  }, 1100);
}

function clearLevel(){
  S.running = false; S.done = true;
  $('pauseBtn').disabled = true;
  if(level === LEVELS.length - 1) return reveal();
  sfx.ding();
  later(() => {
    setBg(LEVELS[level+1].blur); // 過關當下就讓背景變清楚一點
    renderClear();
    $('clearOv').hidden = false;
    $('nextBtn').focus({ preventScroll:true });
  }, 800);
}

// 會帶數字或名字的字，換語言時也要重畫
function renderFail(){ $('failDetail').textContent = T().failDetail(level + 1); }
function renderClear(){
  const t = T();
  $('clearTitle').textContent = t.clearTitle(level + 1);
  $('clearDetail').textContent = level === 0 ? t.clearFirst : t.clearMore;
}
function renderMedal(){
  const t = T(), h = $('medalText');
  if(playerName){
    const who = document.createElement('span'); who.className = 'who'; who.textContent = playerName;
    h.replaceChildren(t.medalWith[0], who, t.medalWith[1]);
  } else h.textContent = t.medalNoName;
  $('buddyTag').textContent = playerName || t.buddyNoName;
  $('saveBtn').textContent = t.save;
  renderChapters();
}
// 勳章卡下方：連到其他章節，標出哪幾章還沒完成
function renderChapters(){
  const t = T(), list = $('chList');
  list.replaceChildren();
  for(let n = 1; n <= CHAPTER_COUNT; n++){
    if(n === CHAPTER) continue;
    const done = !!store.get(clearedKey(n));
    const a = document.createElement('a');
    a.className = 'chLink' + (done ? ' done' : '');
    a.href = '../chapter' + n + '-amazon/index.html';
    const im = document.createElement('img'); im.src = asset('assets/friends/ch' + n + '.png'); im.alt = '';
    const b = document.createElement('b'); b.textContent = t.chName(n);
    const s = document.createElement('small'); s.textContent = done ? t.chDone : t.chNotDone;
    a.append(im, b, s); list.append(a);
  }
}

// ---- 下載破關圖：成果圖＋勳章＋戴名牌的小老鼠 ----
// 雙擊開啟（file://）時，Canvas 畫了本機圖檔就不能匯出，所以這裡用 base64 版的圖
// （assets/export-data.js，用 tools/make-export-data.py 產生，第一次下載時才載入）
function loadExportData(){
  if(window.EXPORT_IMG) return Promise.resolve(window.EXPORT_IMG);
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = asset('assets/export-data.js'); sc.onload = () => res(window.EXPORT_IMG); sc.onerror = rej;
    document.head.append(sc);
  });
}
const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

// 跟 index.html 裡勳章的 SVG 同一個圖形；x,y 是左上角，w 是寬
function drawMedal(c, x, y, w){
  const P = (d, fill, lw) => { const p = new Path2D(d); c.fillStyle = fill; c.fill(p); c.lineWidth = lw; c.stroke(p); };
  c.save(); c.translate(x, y); c.scale(w/100, w/100);
  c.strokeStyle = '#2B2233'; c.lineJoin = 'round';
  P('M28 2 L46 2 L60 64 L42 64 Z', '#3E9A5A', 3.5);
  P('M72 2 L54 2 L40 64 L58 64 Z', '#E2453C', 3.5);
  c.save(); c.shadowColor = 'rgba(255,236,160,.9)'; c.shadowBlur = 10 * w/100;
  P('M10 94 A40 40 0 1 0 90 94 A40 40 0 1 0 10 94 Z', '#F6C445', 4);
  c.restore();
  c.setLineDash([5,4]); c.strokeStyle = '#C98A00'; c.lineWidth = 3;
  c.beginPath(); c.arc(50, 94, 31, 0, Math.PI*2); c.stroke(); c.setLineDash([]);
  c.strokeStyle = '#2B2233'; c.translate(30, 74); c.scale(.8, .8);
  P('M25 3 L31.5 17 L47 18.6 L35.4 29 L38.8 44.5 L25 36.6 L11.2 44.5 L14.6 29 L3 18.6 L18.5 17 Z', '#FFFFFF', 4);
  c.restore();
}

async function makePicture(){
  const data = await loadExportData();
  const [pic, mouse] = await Promise.all([loadImg(data.reveal), loadImg(data.mouse)]);
  if(document.fonts) await document.fonts.ready;
  const K = 2, w = 640*K, h = 384*K; // 640×384 的兩倍，名牌字比較清楚
  const cnv = document.createElement('canvas'); cnv.width = w; cnv.height = h;
  const c = cnv.getContext('2d');
  c.drawImage(pic, 0, 0, w, h);
  drawMedal(c, w*0.02, h*0.03, w*0.13); // 左上角，位置和畫面上的 .medal 一樣
  // 小老鼠站在大老鼠後面的小路上，位置和畫面上的 .buddy 一樣
  const mh = h*0.15, mw = mh * mouse.naturalWidth / mouse.naturalHeight, mx = w*0.453, my = h*0.781;
  c.save(); c.globalAlpha = 0.55; c.fillStyle = '#FFFFFF';
  c.beginPath(); c.ellipse(mx, my + mh*0.42, mw*0.42, mh*0.1, 0, 0, Math.PI*2); c.fill(); c.restore();
  c.drawImage(mouse, mx - mw/2, my - mh/2, mw, mh);
  // 名牌
  const fs = 15*K, name = playerName || T().buddyNoName;
  c.font = '700 ' + fs + 'px ' + (lang === 'en' ? '"Baloo 2",' : '') + '"LXGW WenKai TC","PingFang TC",sans-serif';
  const tw = c.measureText(name).width, pw = tw + fs*1.2, ph = fs*1.5, bx = mx - pw/2, by = my - mh/2 - ph - 2*K;
  c.fillStyle = '#FFFFFF'; c.strokeStyle = '#2B2233'; c.lineWidth = 2*K;
  c.beginPath(); c.roundRect ? c.roundRect(bx, by, pw, ph, ph/2) : c.rect(bx, by, pw, ph); c.fill(); c.stroke();
  c.fillStyle = '#2B2233'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(name, mx, by + ph/2 + K);
  return cnv;
}

async function savePicture(){
  const b = $('saveBtn'), t = T();
  b.disabled = true; b.textContent = t.saving;
  try{
    const cnv = await makePicture();
    const blob = await new Promise((res, rej) => cnv.toBlob(bl => bl ? res(bl) : rej(new Error('toBlob')), 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'BooMMouse-Amazon-Ch' + CHAPTER +(playerName ? '-' + playerName.replace(/[\\/:*?"<>|]/g, '') : '') + '.png';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    b.textContent = T().save;
  }catch(e){
    console.error(e);
    b.textContent = T().saveFail;
  }
  b.disabled = false;
}

// 第 4 關吃完：blur 1 秒變清楚 → 停 1.5 秒 → 遮罩＋勳章落下 → 勳章卡
function reveal(){
  store.set(clearedKey(CHAPTER), '1');
  sfx.ding();
  later(() => { board.classList.add('reveal'); bgMode = 'clear'; applyBg(); }, 400);
  later(() => { $('medalLayer').hidden = false; }, 400 + 1000 + 1500);
  later(() => sfx.fanfare(), 400 + 1000 + 1500 + 1100);
  later(() => {
    renderMedal();
    $('dpad').hidden = true; $('medalCard').hidden = false;
    $('againBtn').focus({ preventScroll:true });
  }, 400 + 1000 + 1500 + 1500);
}

function pause(){
  if(!S || !S.running || S.paused) return;
  S.paused = true; $('pauseOv').hidden = false; $('pauseBtn').textContent = T().cont;
}
function resume(){
  if(!S || !S.paused) return;
  S.paused = false; $('pauseOv').hidden = true; $('pauseBtn').textContent = T().pause;
  S.last = performance.now();
}

function queueDir(name){
  const d = DIRS[name];
  if(!d || !S || !S.running || S.paused) return;
  if(S.waiting){
    S.dir = d; if(d.x) S.face = d.x;
    S.waiting = false; S.last = performance.now() - LEVELS[level].speed;
    return;
  }
  const last = S.queue.length ? S.queue[S.queue.length-1] : S.dir;
  if((d.x===last.x && d.y===last.y) || isReverse(d, last)) return;
  if(S.queue.length < 2) S.queue.push(d);
}

// ---- screens ----
function startGame(){
  sfx.unlock();
  playerName = $('nameInput').value.trim();
  store.set('boommouse-name', playerName);
  $('startScreen').hidden = true; $('playScreen').hidden = false;
  loadFriends(); // 每次開始都重新看一次：可能剛在別的分頁破了另一章
  fit();
  enterLevel(0);
  window.scrollTo({ top:0 });
}
function goHome(){
  clearTimers();
  if(S){ S.running = false; S.paused = false; }
  $('playScreen').hidden = true; $('startScreen').hidden = false;
}

// ---- drawing ----
const lerp = (a,b,t) => a + (b-a)*t;
// 穿越邊緣那一步不做補間，直接跳到另一邊
const lp = (p, q, t) => p && Math.abs(p.x-q.x) <= 1 && Math.abs(p.y-q.y) <= 1 ? { x: lerp(p.x,q.x,t), y: lerp(p.y,q.y,t) } : { x:q.x, y:q.y };
function sprite(im, cx, cy, h, flip, rot){
  if(!im.complete || !im.naturalWidth) return;
  const w = h * im.naturalWidth / im.naturalHeight;
  g.save(); g.translate(cx, cy); if(rot) g.rotate(rot); if(flip) g.scale(-1,1);
  g.drawImage(im, -w/2, -h/2, w, h); g.restore();
}
function drawSeed(c, cx, cy, r, ang){
  c.save(); c.translate(cx, cy); c.rotate(ang);
  c.beginPath(); c.ellipse(0, 0, r*0.62, r, 0, 0, Math.PI*2);
  c.fillStyle = '#F4A9BA'; c.fill();
  c.save(); c.clip();
  c.strokeStyle = '#FFFFFF'; c.lineWidth = r*0.22;
  for(const x of [-r*0.3, 0, r*0.3]){ c.beginPath(); c.moveTo(x, -r); c.lineTo(x, r); c.stroke(); }
  c.restore();
  c.beginPath(); c.ellipse(0, 0, r*0.62, r, 0, 0, Math.PI*2);
  c.lineWidth = Math.max(2, r*0.16); c.strokeStyle = '#2B2233'; c.stroke();
  c.restore();
}
drawSeed($('seedIcon').getContext('2d'), 34, 34, 24, 0.5);

function bubble(x, y, text){
  const fs = Math.max(15, cs*0.6);
  g.save();
  g.font = '700 ' + fs + 'px ' + (lang === 'en' ? '"Baloo 2",' : '') + '"LXGW WenKai TC","PingFang TC",sans-serif';
  const tw = g.measureText(text).width, pw = tw + fs*1.0, ph = fs*1.6;
  const bx = Math.min(Math.max(4, x - pw/2), cs*COLS - pw - 4), by = Math.max(4, y - ph);
  g.fillStyle = '#FFFFFF'; g.strokeStyle = '#2B2233'; g.lineWidth = 3;
  g.beginPath(); g.roundRect ? g.roundRect(bx, by, pw, ph, ph/2.4) : g.rect(bx, by, pw, ph); g.fill(); g.stroke();
  g.fillStyle = '#2B2233'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, bx + pw/2, by + ph/2 + 1);
  g.restore();
}
function outlined(text, x, y, size, color){
  g.save();
  g.font = '800 ' + size + 'px "Baloo 2","LXGW WenKai TC",sans-serif'; g.textAlign = 'center';
  g.lineWidth = Math.max(4, size*0.16); g.strokeStyle = '#FFFFFF'; g.lineJoin = 'round';
  g.fillStyle = color; g.strokeText(text, x, y); g.fillText(text, x, y);
  g.restore();
}

function draw(now){
  const tickMs = LEVELS[level].speed;
  const moving = S.running && !S.paused && !S.waiting;
  const t = moving ? Math.max(0, Math.min(1, (now - S.last) / tickMs)) : 1;
  g.clearRect(-ox, -oy, W, H);
  const C = p => ({ x: (p.x+0.5)*cs, y: (p.y+0.5)*cs });

  // 瓜子（白色光暈讓它在圖上也看得清楚）
  if(S.seed){
    const c = C(S.seed), y = c.y + Math.sin(now/260)*cs*0.05;
    g.save(); g.globalAlpha = 0.55 + 0.15*Math.sin(now/200);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(c.x, y, cs*0.52, 0, Math.PI*2); g.fill(); g.restore();
    drawSeed(g, c.x, y, cs*0.36, 0.5);
  }

  // 小老鼠寶寶（從尾巴往前畫）
  const body = S.body, prev = S.prev, chirpLabels = [];
  for(let i = body.length-1; i >= 1; i--){
    const p = lp(prev && prev[i], body[i], t);
    let dx = body[i-1].x - body[i].x; if(Math.abs(dx) > 1) dx = -Math.sign(dx);
    const c = C(p), bob = Math.sin(now/110 + i*0.9) * cs*0.06;
    g.save(); g.globalAlpha = 0.6; g.fillStyle = '#FFFFFF';
    g.beginPath(); g.ellipse(c.x, c.y + cs*0.34, cs*0.4, cs*0.14, 0, 0, Math.PI*2); g.fill(); g.restore();
    sprite(S.kinds[i] || img.mouse, c.x, c.y + cs*0.02 + bob, cs*0.9, dx < 0);
    if(now - (S.chirps[i] || -1e9) < 600) chirpLabels.push({ x:c.x + cs*0.3, y:c.y - cs*0.5, at:S.chirps[i], size:cs*0.5 });
  }

  // 主角
  const hc = C(lp(prev && prev[0], body[0], t));
  if(S.over){
    // 在邊邊被撞到時往內挪一點，暈倒圖才不會被邊框切掉
    const k = Math.min(1, (now - S.overAt)/260);
    hc.x = Math.min(Math.max(hc.x, cs), cs*(COLS-1)); hc.y = Math.min(Math.max(hc.y, cs*0.75), cs*(ROWS-0.75));
    sprite(img.dizzy, hc.x, hc.y, cs*1.5*(0.8+0.2*k), S.face < 0, Math.sin(now/90)*0.04*(1-k));
    bubble(hc.x, hc.y - cs*0.8, T().cvOuch);
  } else {
    const bob = S.done ? Math.abs(Math.sin(now/120)) * -cs*0.25
      : moving ? Math.abs(Math.sin(now/95)) * -cs*0.07 : Math.sin(now/300)*cs*0.04;
    const tilt = S.dir.y && !S.waiting ? S.dir.y * 0.25 * S.face : 0;
    g.save(); g.globalAlpha = 0.75 + 0.2*Math.sin(now/180);
    g.fillStyle = '#F6C445'; g.strokeStyle = '#2B2233'; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(hc.x, hc.y + cs*0.5, cs*0.62, cs*0.22, 0, 0, Math.PI*2); g.fill(); g.stroke();
    g.restore();
    sprite(img.mouse, hc.x, hc.y - cs*0.2 + bob, cs*1.6, S.face < 0, tilt);
    if(now - (S.chirps[0] || -1e9) < 600) chirpLabels.push({ x:hc.x + cs*0.55*S.face, y:hc.y - cs*1.0, at:S.chirps[0], size:cs*0.62 });
  }

  if(S.waiting && S.running){
    outlined(T().cvLevel(level+1), cs*COLS/2, cs*2.2, cs*1.3, '#E2453C');
    if(!S.paused) bubble(hc.x, hc.y - cs*1.0, T().cvGo);
  }

  // 誰在叫，頭上就冒一個小小的「吱」（英文版是 eek）
  chirpLabels.forEach(l => {
    const k = (now - l.at) / 600;
    g.save(); g.globalAlpha = 1 - k*k;
    outlined(T().cvSqueak, l.x, l.y - k*cs*0.4, l.size, '#2B2233');
    g.restore();
  });

  S.pops = S.pops.filter(pp => now - pp.at < 750);
  S.pops.forEach(pp => {
    const k = (now - pp.at)/750, c = C(pp);
    g.save(); g.globalAlpha = 1 - k*k;
    outlined(pp.t, c.x, c.y - cs*0.8 - k*cs*1.1, cs*0.85, '#E2453C');
    g.restore();
  });
}

function frame(now){
  if(S && S.running && !S.paused && !S.waiting){
    const tickMs = LEVELS[level].speed;
    let guard = 0;
    while(now - S.last >= tickMs && S.running && guard++ < 4){ S.last += tickMs; step(); }
    if(now - S.last > tickMs*4) S.last = now;
  }
  if(S && W && !$('playScreen').hidden) draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- input ----
let sw = null;
board.addEventListener('pointerdown', e => { if(e.target !== cv) return; sw = { x:e.clientX, y:e.clientY, id:e.pointerId }; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
board.addEventListener('pointermove', e => {
  if(!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y, th = Math.max(22, cs*0.7);
  if(Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
  queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  sw.x = e.clientX; sw.y = e.clientY;
});
const endSwipe = () => { sw = null; };
board.addEventListener('pointerup', endSwipe); board.addEventListener('pointercancel', endSwipe);

document.querySelectorAll('.dbtn').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); queueDir(b.dataset.d); b.classList.add('on'); });
  const off = () => b.classList.remove('on');
  b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  b.addEventListener('click', e => { if(e.detail === 0) queueDir(b.dataset.d); });
});
const KEYS = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right' };
document.addEventListener('keydown', e => {
  if(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if(KEYS[e.key] && S && S.running){ e.preventDefault(); queueDir(KEYS[e.key]); return; }
  if(e.key === ' ' && S && S.running){ e.preventDefault(); S.paused ? resume() : pause(); }
});
document.addEventListener('visibilitychange', () => { if(document.hidden) pause(); });

$('nameInput').value = store.get('boommouse-name') || '';
$('nameInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); startGame(); } });
$('startBtn').addEventListener('click', startGame);
$('retryBtn').addEventListener('click', () => enterLevel(level));
$('nextBtn').addEventListener('click', () => enterLevel(level + 1));
$('againBtn').addEventListener('click', () => enterLevel(0));
$('saveBtn').addEventListener('click', savePicture);
$('resumeBtn').addEventListener('click', resume);
$('pauseBtn').addEventListener('click', () => S && S.paused ? resume() : pause());
$('homeBtn').addEventListener('click', goHome);
$('soundBtn').addEventListener('click', e => {
  soundOn = !soundOn;
  e.currentTarget.setAttribute('aria-pressed', String(soundOn));
  e.currentTarget.textContent = T().sound(soundOn);
});

function applyLang(){
  const t = T();
  document.documentElement.lang = t.htmlLang; document.title = t.docTitle;
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t[el.dataset.i18n]);
  document.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t[el.dataset.i18nPh]);
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t[el.dataset.i18nAria]));
  $('pauseBtn').textContent = S && S.paused ? t.cont : t.pause;
  $('soundBtn').textContent = t.sound(soundOn);
  if(S){ renderFail(); renderClear(); renderMedal(); }
}
document.querySelectorAll('.langBtn').forEach(b => b.addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  store.set('boommouse-lang', lang);
  applyLang();
}));
applyLang();

// ---- sound（Web Audio 即時合成）----
let ac = null;
function ctx(){
  if(!soundOn) return null;
  if(!ac){ try{ ac = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; } }
  if(ac.state === 'suspended') ac.resume();
  return ac;
}
function env(gn, t, peak, a, d){
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(peak, t + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(type, freq, at, peak, dur){
  const a = ctx(); if(!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), gn = a.createGain();
  o.type = type; o.frequency.value = freq;
  env(gn, t, peak, 0.01, dur);
  o.connect(gn).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  unlock(){ ctx(); },
  munch(){
    const a = ctx(); if(!a) return;
    [0, 0.07].forEach((dt, k) => {
      const t = a.currentTime + dt, o = a.createOscillator(), gn = a.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(k ? 520 : 380, t);
      o.frequency.exponentialRampToValueAtTime(k ? 300 : 220, t + 0.05);
      env(gn, t, 0.09, 0.005, 0.055);
      o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.08);
    });
  },
  // 撞到時軟軟的「咚～」，不要嚇人
  bonk(){
    const a = ctx(); if(!a) return;
    const t = a.currentTime, o = a.createOscillator(), gn = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.32);
    env(gn, t, 0.2, 0.01, 0.4);
    o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.45);
  },
  // 小老鼠「吱吱」：高音快速上滑再下滑，有時叫兩聲
  // pitch：主角 1，寶寶比較高；vol：寶寶比較小聲；delay：稍微錯開
  squeak(pitch = 1, vol = 0.07, delay = 0){
    const a = ctx(); if(!a) return;
    const n = Math.random() < 0.45 ? 2 : 1, p = pitch * (0.92 + Math.random()*0.16);
    for(let k=0;k<n;k++){
      const t = a.currentTime + delay + k*0.11, o = a.createOscillator(), gn = a.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(2100*p, t);
      o.frequency.exponentialRampToValueAtTime(3200*p, t + 0.03);
      o.frequency.exponentialRampToValueAtTime(2500*p, t + 0.08);
      env(gn, t, vol, 0.006, 0.08);
      o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.1);
    }
  },
  ding(){ [1318.5, 1975.5, 2637].forEach((fr, k) => tone('sine', fr, k*0.07, 0.16, 0.45)); },
  fanfare(){
    [523.25, 659.25, 783.99, 1046.5].forEach((fr, k) => tone('triangle', fr, k*0.13, 0.18, 0.22));
    [523.25, 659.25, 783.99, 1046.5].forEach(fr => tone('triangle', fr, 0.55, 0.1, 1.0));
  }
};
})();
