// 這是第幾章（複製成新章節時要改）：用在過關紀錄、好朋友小老鼠、下載檔名
const CHAPTER = 3;
// 總共有幾章：破過的章節，牠的小老鼠會來別章的隊伍裡（圖在 assets/friends/chN.png）
const CHAPTER_COUNT = 5;

// 碰到自己的隊伍可以直接穿過去（true，比較簡單）；改成 false 的話撞到就要重來
const PASS_THROUGH = true;

// 四關設定（調難度只改這裡）
// blur：背景成果圖的模糊程度（以 640px 寬為準，畫面變大會等比放大），null = 素面底色
// seeds：這關要吃幾顆瓜子才過關
// speed：小老鼠每走一格要幾毫秒，數字越小越快
const LEVELS = [
  { blur: null, seeds: 8,  speed: 180 }, // 第1關 素面
  { blur: 20,   seeds: 12, speed: 150 },
  { blur: 10,   seeds: 16, speed: 120 },
  { blur: 4,    seeds: 20, speed: 100 }, // 第4關
];
