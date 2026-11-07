// アプリのアイコン（icon-192.png・icon-512.png）を作る。投票箱に、投票用紙を入れるところ。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#eceff3"/>
      <rect x="30" y="14" width="40" height="34" rx="2" fill="#ffffff" stroke="#1b2433" stroke-width="2.5"/>
      <line x1="37" y1="24" x2="63" y2="24" stroke="#1b243355" stroke-width="3" stroke-linecap="round"/>
      <line x1="37" y1="33" x2="56" y2="33" stroke="#1b243355" stroke-width="3" stroke-linecap="round"/>
      <rect x="14" y="44" width="72" height="44" rx="5" fill="#1f4a7a" stroke="#12304f" stroke-width="2.5"/>
      <rect x="28" y="44" width="44" height="6" rx="2" fill="#12304f"/>
      <text x="50" y="77" font-size="18" text-anchor="middle" fill="#ffffff" font-family="'Noto Sans CJK JP',sans-serif" font-weight="900">投票</text></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
