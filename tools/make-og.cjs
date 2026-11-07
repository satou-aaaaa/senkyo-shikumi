// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題（答え）は入れず、遊び方の例だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:56px 80px;background:#eceff3;background-image:radial-gradient(#1b243314 2px,transparent 3px);background-size:32px 32px;color:#1b2433;position:relative">
    <div style="font-size:34px;color:#7f2414;letter-spacing:.12em;font-weight:700">公職選挙法と総務省の説明から</div>
    <div style="font-size:104px;font-weight:900;margin-top:6px;letter-spacing:.06em;color:#12304f">選挙の<span style="color:#b23a24">しくみ</span></div>
    <div style="font-size:38px;margin-top:4px">投票のきまり、ちゃんと知ってる？</div>
    <div style="display:flex;gap:22px;margin-top:40px;align-items:flex-start">
      <div style="font-size:70px;width:110px;height:110px;border-radius:50%;background:#e6edf6;border:5px solid #1f4a7a;display:grid;place-items:center">🧑</div>
      <div style="flex:1;max-width:720px;background:#fff;border:5px solid #1b2433;border-radius:28px;padding:22px 30px;font-size:38px;line-height:1.5">入場券を忘れても、<br>投票できるのかな…</div>
    </div>
    <div style="position:absolute;right:90px;bottom:70px;width:170px;height:170px;border-radius:50%;border:9px solid #b23a24;color:#b23a24;display:grid;place-items:center;font-size:44px;font-weight:900;transform:rotate(-12deg);text-align:center;line-height:1.1">投<br>票</div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
