// 選挙のしくみの検査。しくみのデータ（形・字数・出典・答えが選び肢にある）・議席の計算（別の数え方で解き直す）・
// 今日の5問と上級の組み方（3年分）・通しで遊ぶ・まちがい・ヒント・続きから・上級・練習・おさらい・とことん（何百回）・しくみ帳・実績・
// カレンダー・あとから・古いタブ・スマホ幅・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const G = createRequire(import.meta.url)(path.join(root, "data.js"));
const len = (s) => [...String(s)].length;

// ---- 1. 問題のデータ（ブラウザを使わない）----
{
  const bad = [], ids = new Set();
  for (const t of G.TE) {
    if (ids.has(t.id)) bad.push(t.id + " 同じid"); ids.add(t.id);
    if (!t.id || !t.name || !t.lead || !t.why || !G.CAT[t.cat] || !t.src.length || t.src.some((k) => !G.SRC[k])) bad.push(t.id + " 形");
    if (t.k === "q" && (!t.q || !t.ans || !t.w1 || !t.w2 || new Set([t.ans, t.w1, t.w2]).size !== 3)) bad.push(t.id + " 選び肢");
    if (t.k === "q" && (len(t.q) > 60 || [t.ans, t.w1, t.w2].some((x) => len(x) > 40))) bad.push(`${t.id} 長い（問い60字・選び肢40字まで）`);
    if (len(t.lead) > 45) bad.push(`${t.id} ひとこと${len(t.lead)}字`);
    if (t.k === "q" && !/[0-9０-９]|条|総務省/.test(t.why)) bad.push(t.id + " 解説に条文か総務省の出どころが無い");
  }
  const n = G.TE.filter((t) => t.k === "q").length, per = Object.keys(G.CAT).map((c) => G.TE.filter((t) => t.k === "q" && t.cat === c).length);
  check(`しくみは${n}（分類ごと ${per.join("・")}）。どれも問い・選び肢3つ・ひとこと・解説・出典があり、長すぎない`, n >= 75 && per.every((x) => x >= 8) && bad.length === 0, bad.join(","));
  check("上級のしくみが12以上", G.TE.filter((t) => t.k === "q" && t.h).length >= 12, G.TE.filter((t) => t.h).length);
}
{
  // 全部の札を作り、正解が選び肢にある・選び肢が重ならない・同じ札で同じ問題
  const bad = [];
  for (const t of [...G.pool("all"), ...G.pool("d"), "D:0", "D:5", "d:100000", "D:100000"]) {
    const P = G.make(t);
    if (!G.ok(t)) bad.push(t + " ok");
    if (!(P.ans >= 0 && P.ans < P.opts.length) || new Set(P.opts).size !== P.opts.length || P.opts.length !== 3) bad.push(t + " 選び肢");
    if (P.type === "q") { const w = G.BYTE[t.slice(2)]; if (P.opts[P.ans] !== w.ans || P.why !== w.why) bad.push(t + " しくみの正解"); }
    if (P.look.includes(P.opts[P.ans])) bad.push(t + " ヒントが答えを言う");
    if (JSON.stringify(G.make(t)) !== JSON.stringify(P)) bad.push(t + " 同じにならない");
    if (/undefined|NaN|null/.test(JSON.stringify([P.s, P.q, P.opts, P.why, P.look, P.title, P.nm, P.tbl || []]))) bad.push(t + " 空");
  }
  check("全部の問題で、正解が選び肢にあり・選び肢が3つで重ならず・ヒントが答えを言わない・同じ札で同じ問題", bad.length === 0, bad.slice(0, 5).join(","));
  const pos = [0, 0, 0], all = [...G.pool("all"), ...G.pool("d")]; all.forEach((t) => pos[G.make(t).ans]++);
  check("正解の位置がかたよらない（A・B・Cどれも2割以上）", pos.every((n) => n >= all.length * 0.2), pos.join(","));
  check("練習・とことんで出る問題が80種類以上", G.pool("all").length >= 80, G.pool("all").length);
}
{
  // 議席の計算（ドント式）：別の数え方（各党が次の1議席を取る商をくらべて1つずつ配る）で解き直し、答えと合うか。何千問も
  const bad = []; let kinds = new Set(), zero = 0;
  const redo = (votes, seats) => { const got = votes.map(() => 0); for (let i = 0; i < seats; i++) { let best = -1, bv = -1; votes.forEach((v, p) => { const x = v / (got[p] + 1); if (x > bv) { bv = x; best = p; } }); got[best]++; } return got; };
  for (let n = 0; n < 3000; n++) for (const hard of [false, true]) {
    const e = G.election(hard, n), P = G.make((hard ? "D:" : "d:") + n), names = G.PARTY.slice(0, e.np), g2 = redo(e.votes, e.seats);
    if (g2.join() !== e.got.join()) bad.push(n + " 数え方で合わない");
    if (e.got.reduce((a, b) => a + b, 0) !== e.seats || e.got[0] === e.seats) bad.push(n + " 議席の合計・1党が全部");
    if (e.votes.some((v) => v % 100 || v < 1000 || v > 10000) || new Set(e.votes).size !== e.np) bad.push(n + " 得票");
    if (P.tbl.length !== e.np || P.tbl.some((r, i) => r[0] !== names[i])) bad.push(n + " 表");
    const m = P.q.match(/(.)党は何議席/);
    if (m) { if (P.opts[P.ans] !== e.got[names.indexOf(m[1] + "党")] + "議席") bad.push(n + " 議席の数の答え"); }
    else { const last = e.q[e.seats - 1].p, c = e.q[e.seats].p; if (P.opts[P.ans] !== names[last]) bad.push(n + " 最後の議席の答え"); if (Math.abs(e.q[e.seats - 1].v - e.q[e.seats].v) < 1) bad.push(n + " 境目が近すぎる"); void c; }
    if (!P.why.includes(e.got.map((x, i) => names[i] + x).join("・"))) bad.push(n + " 解説の議席");
    kinds.add(e.np + ":" + e.got.join("-")); if (e.got.includes(0)) zero++;
  }
  check("議席の計算 6000問を別の数え方で解き直すと同じ議席になり、答え・表・解説が合う", bad.length === 0, bad.slice(0, 5).join(","));
  check("議席の分かれ方が30通り以上あり、0議席の党が出る問題もある", kinds.size >= 30 && zero > 100, `${kinds.size}・${zero}`);
}
{
  check("札の確かめ：形のちがう札・無いしくみ・数でない番号は通さない", ["q:zz", "q:dont", "d:-1", "d:1.5", "d:01", "D:x", "q:senkyoken:1", "d:1:2", "constructor", 5, "q:__proto__", "q:toString", "x:1"].every((t) => !G.ok(t)) && G.ok("q:senkyoken") && G.ok("d:0") && G.ok("D:100000"));
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], cover = new Set(); let sameAsPrev = 0, prev = "";
  const d0 = Date.parse("2026-11-07");
  for (let i = 0; i < 365 * 3; i++) {
    const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10), dl = G.dailyTags(d), hl = G.hardTags(d);
    const kinds = dl.map((t) => t[0]).join(""), ids = dl.map((t) => t.split(":")[1]);
    if (dl.length !== 5 || kinds !== "qqdqq" || new Set(ids).size !== 5 || !dl.every(G.ok)) bad.push(d + " 今日");
    const hids = hl.map((t) => t.split(":")[1]);
    if (hl.length !== 3 || hl.map((t) => t[0]).join("") !== "qDq" || !hl.every(G.ok) || hids[0] === hids[2] || [hids[0], hids[2]].some((x) => ids.includes(x) || !G.BYTE[x].h)) bad.push(d + " 上級");
    if (JSON.stringify(dl) !== JSON.stringify(G.dailyTags(d))) bad.push(d + " 同じにならない");
    if (dl.join() === prev) sameAsPrev++; prev = dl.join();
    if (i < 14) ids.forEach((x) => cover.add(x));
  }
  check("今日の5問（しくみ・しくみ・計算・しくみ・しくみ、重ねない）と上級（今日と重ねない上級のしくみ2つ・党の多い計算）を3年分作れる", bad.length === 0, bad.slice(0, 5).join(","));
  check("2週間のうちにしくみが50以上出る・前の日と同じ組の日が無い", cover.size >= 50 && sameAsPrev === 0, `${cover.size}・${sameAsPrev}`);
  const seen = []; let rep = 0;
  for (let i = 0; i < 365; i++) { const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10), a = G.dailyTags(d).filter((t) => t[0] === "q"); for (const t of a) { if (seen.slice(-40).includes(t)) rep++; } seen.push(...a); }
  check("しくみは10日のうちに同じものが戻らない", rep === 0, rep);
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), data = readFileSync(path.join(root, "data.js"), "utf8"), readme = readFileSync(path.join(root, "README.md"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$/.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("出典はすべて e-Gov 法令検索か総務省のページ", Object.values(G.SRC).every(([, u]) => /^https:\/\/(laws\.e-gov\.go\.jp|www\.soumu\.go\.jp)\//.test(u)));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんだけ（今日の5問・上級は日付の乱数。data.js には無い）", (html.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(data));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + data));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test(data.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("特定の政党・候補者を応援も評価もしない：計算の党は記号だけ・「このゲームについて」に書く・実在の政党名を出さない", /本物の政党ではありません/.test(html) && /応援したり、評価したりしません/.test(html) && /本物の政党ではありません/.test(readme) && G.PARTY.every((p) => /^[A-E]党$/.test(p)) && !/自民|立憲|維新|公明|共産|国民民主|れいわ|参政|社民|保守党|NHK党/.test(html + data));
check("チケット・回数制限・🔒で開くモードを入れない（好きなだけ遊べる）", !/🎫|チケット|🔒|すると開く|あとで開く|スタミナ|回復まで/.test(html));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）|ｗｗ/.test(html + data));
check("実在の会社名・人名・ブランドを出さない（人物は名字＋年代だけ）", !/株式会社|有限会社|Amazon|楽天|メルカリ|LINEヤフー/.test(data));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキーだけで読む", /<script src="transfer\.js" data-game="senkyo-shikumi" data-keys="senkyo-v1"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="data.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/senkyo-shikumi/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readme.replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const st = await checkSwStall(readFileSync(path.join(root, "sw.js"), "utf8"));
  check("PWA：本文の途中で通信が止まっても、4秒で保存した画面を返す（shared-workflows template/qa/sw-check.mjs）", st.ok, JSON.stringify(st)); }
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js も）、取り直して入れ、外へ何も送らない", ["./index.html", "./data.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && /cache: "reload"/.test(sw) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "選挙のしくみ" && mf.icons.length >= 2 && mf.start_url === "./"); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const closeHow = async (p) => { if (await p.locator("#howto[open]").count()) await p.click("#howto-ok"); };
const ansIdx = (p) => p.evaluate(() => __mb.cur().P.ans);
const wrongIdx = (p) => p.evaluate(() => { const c = __mb.cur(); return c.P.opts.findIndex((_, j) => j !== c.P.ans && !c.wrong.includes(j)); });
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("senkyo-v1") || "{}"));
async function solve(p, { wrong = 0 } = {}) {
  for (let i = 0; i < wrong; i++) await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  await p.click(`.ch[data-j="${await ansIdx(p)}"]`);
  await p.waitForSelector(".verdict");
}

try {
  {
    // 遊び方を Esc で閉じても覚える（okane-kihon で見つかった。shared-workflows #186）
    const q = await newPage();
    await q.keyboard.press("Escape"); await q.waitForTimeout(150);
    const closed = await q.locator("#howto[open]").count() === 0;
    await q.click("#go-p"); await q.goto(url); await q.waitForTimeout(200);
    check("遊び方を Esc で閉じたあと、開き直しても遊び方が出ない", closed && (await mem(q)).tut === true && await q.locator("#howto[open]").count() === 0);
    await q.context().close();
  }
  {
    // cancel（Esc）のその場で保存する。close を待たずに見る。保存に失敗したら close でもう一度保存する（CodeRabbit の指摘）
    const q = await newPage();
    const atCancel = await q.evaluate(() => { const d = document.getElementById("howto"); d.dispatchEvent(new Event("cancel")); return JSON.parse(localStorage.getItem("senkyo-v1") || "{}").tut === true; });
    check("遊び方を Esc で閉じたその場（close の前）に「見た」を保存する", atCancel);
    await q.context().close();
    const q2 = await newPage();
    const retried = await q2.evaluate(() => { const ls = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; const d = document.getElementById("howto"); d.dispatchEvent(new Event("cancel")); Storage.prototype.setItem = ls; const before = JSON.parse(localStorage.getItem("senkyo-v1") || "{}").tut === true; d.close(); return new Promise((res) => setTimeout(() => res(!before && JSON.parse(localStorage.getItem("senkyo-v1") || "{}").tut === true), 100)); });
    check("Esc のときの保存に失敗しても、閉じたときに「見た」を保存し直す", retried);
    await q2.context().close();
  }
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#howto[open]").count() === 1);
  await p.click("#howto-ok");
  check("ホームに今日の心得と、総務省「なるほど！選挙」へのリンク・選挙管理委員会で確かめる一言が出る", (await p.textContent("#tip")).includes("今日の心得") && (await p.textContent(".help")).includes("選挙管理委員会") && await p.locator(".help a[href*='soumu.go.jp']").count() === 1);
  check("はじめての日から上級・とことん・練習を押せる（鍵なし）", await p.locator("#go-h:not([disabled])").count() === 1 && await p.locator("#go-e:not([disabled])").count() === 1 && await p.locator("#go-p:not([disabled])").count() === 1);

  // 今日の5問：1問目はまちがえる、4問目はヒント2回、ほかはそのまま
  await p.click("#go-d");
  const tags = await p.evaluate(() => __mb.load().runs.d.list);
  check("今日の5問は日付から決まる（data.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  check("問題の画面：人・吹き出し・問い・選び肢3つ（高さ44px以上）", await p.locator(".ava").count() === 1 && (await p.textContent(".bubble")).length > 10 && await p.locator(".ch").count() === 3 && (await p.$$eval(".ch", (b) => b.every((x) => x.getBoundingClientRect().height >= 44))));
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  check("まちがえると ✕ の印（色だけで分けない）・知らせは role=status", await p.locator(".ch.ng").count() === 1 && (await p.textContent("#msg")).includes("✕") && (await p.getAttribute("#msg", "role")) === "status");
  check("まちがえた問題はおさらいに入る", (await mem(p)).miss.includes(tags[0]));
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（同じ問題・まちがえた印のまま）", await p.locator(".ch.ng").count() === 1 && await p.evaluate(() => __mb.cur().i) === 0);
  await solve(p);
  const why1 = await p.textContent(".verdict .why"), w1 = G.BYTE[tags[0].slice(2)];
  check("正解すると ✓ の印・条文などの解説・しくみのひとこと・★2（まちがい1回）", await p.locator(".ch.ok").count() === 1 && why1.includes(w1.why) && (await p.textContent(".verdict .te")).includes(w1.lead) && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  await p.click("#next");
  check("2問目もしくみの三択", await p.locator(".ch").count() === 3 && await p.locator("#votes").count() === 0);
  await solve(p); await p.click("#next");
  check("3問目は議席の計算：党の得票の表（見出しつき）と問い", await p.locator("#votes tbody tr").count() >= 3 && await p.locator("#votes th[scope=col]").count() === 2 && /議席/.test(await p.textContent("#q")));
  await solve(p); await p.click("#next");
  await p.click("#hint");
  check("ヒント1は見るところを言う（選び肢は消さない）", (await p.textContent("#hintbox")).includes("💡") && await p.locator(".ch.ng").count() === 0);
  await p.click("#hint");
  check("ヒント2はまちがいの選び肢を1つ消す・ヒントは2回まで", await p.locator(".ch.ng").count() === 1 && await p.locator("#hint:disabled").count() === 1);
  await solve(p);
  check("ヒント2回は★1", (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  check("答えたあとは、押せないヒントのボタンを隠し、空いた知らせの欄も場所を取らない", await p.locator("#hint").isHidden() && await p.locator("#hintbox").isHidden() && (await p.$eval("#msg", (e) => e.getBoundingClientRect().height)) === 0);
  await p.click("#next");
  await solve(p); await p.click("#next");
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい（1・0・0・2・0）", JSON.stringify(s1.days[TODAY]?.m) === "[1,0,0,2,0]");
  check("結果に星の合計（12/15）と一度で正解した数（3/5）を出す", /星 12 \/ 15/.test(await p.textContent("#score")) && /一度で正解 3 \/ 5/.test(await p.textContent("#score")), await p.textContent("#score"));
  check("今日の記録に解いた問題の札も残す（あとでしくみが増えても結果に元の問題を出す）", JSON.stringify(s1.days[TODAY]?.l) === JSON.stringify(tags));
  const share = await p.textContent(".share");
  check("シェアの文に問題・答えを出さない（印だけ）", /第\d+回/.test(share) && /🟢/.test(share) && !G.TE.some((t) => share.includes(t.name) || share.includes(t.lead)) && !/党|議席/.test(share), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「今日覚えたこと」・あと少しの実績・続けて遊ぶ・上級", await p.locator(".rlist div").count() === 5 && await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1);
  check("しくみ帳に正解したしくみが載る・議席の計算を数える", Object.keys(s1.dex).length === 5 && s1.co === 1);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」", (await p.textContent("#go-d")).includes("結果"));
  // 上級：ヒントなし・3問
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・3問", await p.locator("#hint").count() === 0 && (await p.evaluate(() => __mb.load().runs.h.list.length)) === 3);
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // 練習：記録を増やさない
  await p.click("#back"); await p.click("#go-p"); await p.click('.lv button[data-c="d"]');
  const before = await mem(p);
  check("練習の議席の計算は、計算の問題だけ", (await p.evaluate(() => __mb.load().runs.p.list)).every((t) => /^d:/.test(t)));
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const after = await mem(p);
  check("練習は今日の記録を増やさない（計算の数はふえる）", JSON.stringify(after.days) === JSON.stringify(before.days) && after.co === before.co + 5);
  // おさらい：一度で正解すると外れる
  await p.click("#back"); await p.click("#go-p");
  check("おさらいのボタンが出る", await p.locator('.lv button[data-c="miss"]').count() === 1);
  await p.click('.lv button[data-c="miss"]'); await solve(p);
  check("おさらいで一度で正解すると、おさらいから外れる", !(await mem(p)).miss.includes(tags[0]));
  // しくみ帳：説明と出典、そのしくみだけで練習
  await p.goto(url); await p.waitForTimeout(150); await p.click("#go-dex");
  { const dx = (await mem(p)).dex, want = Object.keys(G.CAT).map((c) => `${G.TE.filter((t) => t.cat === c && dx[t.id] > 0).length}/${G.TE.filter((t) => t.cat === c).length}`), got = await p.$$eval(".agrp .cnt", (e) => e.map((x) => x.textContent));
    check("しくみ帳の分類ごとに、集めた数／全部の数を出す（記録と同じ数）", JSON.stringify(got) === JSON.stringify(want) && want.some((w) => !w.startsWith("0/")), got.join(",")); }
  const te = await p.getAttribute(".book button", "data-t");
  await p.click(".book button");
  check("しくみ帳を押すと、ひとこと・くわしく・出典（e-Gov か総務省のリンク）", /ひとことで/.test(await p.textContent("#tecard")) && (await p.textContent("#tecard")).includes("くわしく") && await p.locator("#tecard a[href*='e-gov.go.jp'], #tecard a[href*='soumu.go.jp']").count() >= 1);
  await p.click("#go-tp");
  check("しくみ帳から、そのしくみだけで練習", await p.evaluate((te) => __mb.load().runs.p.list.every((t) => __mb.G.make(t).te === te), te));
  // とことん：まちがえても続く・ここで降りる・一度で正解した数が自己ベスト
  await p.goto(url); await p.waitForTimeout(150); await p.click("#go-e");
  check("とことんにチケット・残りの数が無い", !/🎫|のこり|残り/.test(await p.textContent("header")));
  await solve(p); await p.click("#next"); await solve(p); await p.click("#next");
  await solve(p, { wrong: 1 }); await p.click("#next");
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  check("とことんはまちがえても終わらない", await p.locator(".verdict").count() === 0 && await p.locator(".ch").count() >= 2 && await p.locator("#quit").count() === 1);
  await p.click("#quit"); await p.waitForTimeout(150);
  check("「ここで降りる」で終わり、一度で正解した数（2問）が自己ベスト", (await mem(p)).ebest === 2 && (await p.textContent("#eres")).includes("2問"));
  {
    // 古いタブで終えた回を、別のタブがもう一度終えても書き戻さない
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = __mb.load(); s.ebest = 2; s.edone = ["old1"]; s.runs.e = { mode: "e", date: __mb.todayKey(), list: __mb.endlessList(), res: [{ m: 0 }], cur: null, first: 9, miss: 0, id: "old1" }; localStorage.setItem("senkyo-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(150); await q.click("#go-e"); await q.click("#quit"); await q.waitForTimeout(150);
    check("別のタブで終えたとことんの回は、自己ベストに書き戻さない", (await mem(q)).ebest === 2);
    await q.context().close();
  }
  {
    // 記録の形を直す：数の所の文字・壊れた途中経過・札を HTML として出さない
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("senkyo-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.co = "x"; s.dex = { senkyoken: '"><b id="xss2">', zzz: 3, "Bad Key": 1 }; s.miss = ['"><i id="xss3">', "q:senkyoken"]; s.runs = { e: { mode: "e", id: "x", date: "2026-11-07", list: ['<b id="xss4">'], res: [] }, h: { list: "bad", res: [] }, d: { mode: "d", id: "z", date: "x", list: ["q:senkyoken"], res: [] }, p: { mode: "p", id: "y", date: "2026-11-07", list: ["q:senkyoken", "q:hi-shu"], res: [{ m: 0 }], cur: { i: 1, tag: "q:hi-shu", wrong: "x", hints: 0 } } }; s.days = { "2026-11-07": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] } }; localStorage.setItem("senkyo-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __mb.load());
    check("記録の形を直す：数の所の文字は0に・形のちがう id と壊れた途中経過・日ごとの記録は捨てる（新しい版の形の正しい id は残す）", st.ebest === 0 && st.co === 0 && st.dex.senkyoken === 0 && st.dex.zzz === 3 && !("Bad Key" in st.dex) && JSON.stringify(st.miss) === '["q:senkyoken"]' && !("e" in st.runs) && !("h" in st.runs) && !("d" in st.runs) && st.runs.p && st.runs.p.cur === null && Object.keys(st.days).length === 0);
    await q.click("#go-dex").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3, #xss4").count() === 0);
    // 新しい版で足したしくみの札が入った日の記録も、古い版では消さずに残し、結果はその日の問題で出す
    const dN = dayBefore(2), lN = [...G.dailyTags(dN).slice(0, 4), "q:mirai-shikumi"];
    await q.evaluate(([d, l]) => { const s = __mb.load(); s.days[d] = { m: [0, 0, 0, 0, 0], l }; s.dex["mirai-shikumi"] = 2; localStorage.setItem(__mb.KEY, JSON.stringify(s)); }, [dN, lN]);
    await q.reload(); await q.waitForTimeout(200);
    const stN = await q.evaluate(() => __mb.load());
    await q.evaluate((d) => __mb.result("d", d), dN); await q.waitForTimeout(100);
    const wantT = G.dailyTags(dN).map((t) => G.make(t).title), gotT = await q.locator(".rlist .w b").allTextContents();
    check("新しい版のしくみの札がある日の記録・しくみ帳の数を、古い版でも消さない（結果はその日の問題で出す）", JSON.stringify(stN.days[dN]?.l) === JSON.stringify(lN) && stN.dex["mirai-shikumi"] === 2 && JSON.stringify(gotT) === JSON.stringify(wantT), gotT.join("・"));
    // 新しい版の札が入ったおさらい・途中経過も、古い版の保存で消さない。集めた数と「ぜんぶ集めた」には知らないしくみを数えない
    const dex0 = await q.evaluate(() => __mb.load().dex), nk0 = G.TE.filter((t) => dex0[t.id] > 0).length; // zzz・mirai-shikumi は数えない
    await q.evaluate(() => { const s = __mb.load(); s.miss = ["q:mirai-shikumi", "q:senkyoken"]; s.runs.p = { mode: "p", id: "fut", date: "2026-11-07", list: ["q:mirai-shikumi", "q:senkyoken"], res: [], cur: null }; localStorage.setItem(__mb.KEY, JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(200);
    await q.evaluate(() => __mb.save(() => {}));
    const stF = await q.evaluate(() => __mb.load()), dexBtn = await q.locator("#go-dex").textContent();
    await q.click("#go-p"); await q.waitForTimeout(150);
    const missBtn = (await q.locator('[data-c="miss"]').textContent().catch(() => "")) || ""; // おさらいのボタンは練習の画面にある。読める札だけを数える（1問）
    check("新しい版の札のおさらい・途中経過を古い版の保存で消さず・集めた数に知らないしくみを入れない", JSON.stringify(stF.miss) === '["q:mirai-shikumi","q:senkyoken"]' && stF.runs.p?.id === "fut" && JSON.stringify(stF.runs.p.list) === '["q:mirai-shikumi","q:senkyoken"]' && missBtn.includes("（1問）") && dexBtn.includes(`${nk0}/${G.TE.length}`), `${dexBtn}・${missBtn}`);
    // 新しい版の札がある日の結果：その日の問題で出し、1問ごとの星は付けずに知らせる
    await q.evaluate((d) => __mb.result("d", d), dN); await q.waitForTimeout(100);
    const altStars = await q.locator(".rlist > div > span:first-child").allTextContents();
    check("新しい版の札がある日の結果は、別の問題に星を付けず「読み直すと出る」と知らせる", await q.locator("#altnote").count() === 1 && altStars.length === 5 && altStars.every((t) => t === "—"), altStars.join(""));
    // 新しい版で終えたあとからの回（読めない札）は、古い版で「続き」を押しても上書きしない（あとからの日がある 11/17 に時計を合わせる）
    {
      const qa = await newPage(); await closeHow(qa);
      await qa.clock.setFixedTime(new Date("2026-11-17T03:00:00Z"));
      const dA = "2026-11-14", futA = { mode: "a", date: dA, id: "a" + dA, list: [...G.dailyTags(dA).slice(0, 4), "q:mirai-shikumi"], res: [0, 1, 2, 0, 1].map((m) => ({ m })), cur: null };
      await qa.evaluate(([d, r]) => { const s = __mb.load(); s.runs["a:" + d] = r; localStorage.setItem(__mb.KEY, JSON.stringify(s)); }, [dA, futA]);
      const lateA = await qa.evaluate(() => __mb.lateDays(__mb.load()));
      await qa.evaluate((d) => __mb.startRun("a", d), dA); await qa.waitForTimeout(150);
      const sA = await qa.evaluate(() => __mb.load()), stA = sA.runs["a:" + dA], recA = sA.adays[dA]; // 上書きせず、そのまま残すか、その答えで記録する
      check("新しい版で終えたあとからの回は、古い版で開き直しても上書きしない（答えのまま記録する）", lateA.includes(dA) && (stA ? JSON.stringify(stA.list) === JSON.stringify(futA.list) && JSON.stringify(stA.res) === JSON.stringify(futA.res) : JSON.stringify(recA?.m) === "[0,1,2,0,1]" && JSON.stringify(recA?.l) === JSON.stringify(futA.list)), lateA.join(",") + JSON.stringify(stA || recA));
      await qa.context().close();
    }
    // 新しい版で終えて記録する前に閉じた今日の回（読めない札）：古い版で開いても先に記録し、翌日の今日の5問・あとからで上書き・二重記録しない
    {
      const qd = await newPage(); await closeHow(qd);
      await qd.clock.setFixedTime(new Date("2026-11-17T03:00:00Z"));
      const dD = "2026-11-16", futD = { mode: "d", date: dD, id: "D1", list: [...G.dailyTags(dD).slice(0, 4), "q:mirai-shikumi"], res: [0, 1, 0, 2, 0].map((m) => ({ m })), cur: null };
      await qd.evaluate((r) => { const s = __mb.load(); s.runs.d = r; localStorage.setItem(__mb.KEY, JSON.stringify(s)); }, futD);
      await qd.reload(); await qd.waitForTimeout(250);
      const stD = await qd.evaluate(() => __mb.load()), lateD = await qd.evaluate(() => __mb.lateDays(__mb.load()));
      check("新しい版で終えた記録前の回は、古い版で開いても先に記録して結果を出す（翌日に上書きしない・あとからに出さない）", JSON.stringify(stD.days[dD]?.l) === JSON.stringify(futD.list) && JSON.stringify(stD.days[dD]?.m) === "[0,1,0,2,0]" && !stD.runs.d && !lateD.includes(dD) && await qd.locator("#altnote").count() === 1, JSON.stringify(stD.days[dD]));
      await qd.context().close();
    }
    // 終えて記録前の前の日の回が残ったまま「今日の5問」を始めても、置きかえる前に記録する（ホームを開いたあとに別のタブで答えたとき）
    {
      const qb = await newPage(); await closeHow(qb);
      await qb.clock.setFixedTime(new Date("2026-11-17T03:00:00Z"));
      const dB = "2026-11-16", lB = G.dailyTags(dB), runB = { mode: "d", date: dB, id: "B1", list: lB, res: [0, 0, 1, 0, 0].map((m) => ({ m })), cur: null };
      await qb.evaluate((r) => { const s = __mb.load(); s.runs.d = r; localStorage.setItem(__mb.KEY, JSON.stringify(s)); __mb.startRun("d"); }, runB); await qb.waitForTimeout(150);
      const stB = await qb.evaluate(() => __mb.load());
      check("新しい回で置きかえる前に、終えて記録前の回を記録する", JSON.stringify(stB.days[dB]?.m) === "[0,0,1,0,0]" && JSON.stringify(stB.days[dB]?.l) === JSON.stringify(runB.list) && stB.runs.d?.date === "2026-11-17", JSON.stringify(stB.days[dB]));
      await qb.context().close();
    }
    // 別のタブで終えて記録前のあとからの回：カレンダーからその日を押すと、結果へ進めて記録する
    {
      const qc = await newPage(); await closeHow(qc);
      await qc.clock.setFixedTime(new Date("2026-11-17T03:00:00Z"));
      const dC = "2026-11-13", runC = { mode: "a", date: dC, id: "a" + dC, list: G.dailyTags(dC), res: [1, 0, 0, 0, 2].map((m) => ({ m })), cur: null };
      await qc.evaluate(([d, r]) => { const s = __mb.load(); s.runs["a:" + d] = r; localStorage.setItem(__mb.KEY, JSON.stringify(s)); __mb.startRun("a", d); }, [dC, runC]); await qc.waitForTimeout(150);
      const stC = await qc.evaluate(() => __mb.load()), resC = await qc.locator(".rlist > div").count();
      check("終えて記録前のあとからの回は、上書きせず結果へ進めて記録する", JSON.stringify(stC.adays[dC]?.m) === "[1,0,0,0,2]" && JSON.stringify(stC.adays[dC]?.l) === JSON.stringify(runC.list) && !stC.runs["a:" + dC] && resC === 5, JSON.stringify(stC.adays[dC]) + resC);
      await qc.context().close();
    }
    await q.context().close();
  }
  {
    // 引き継ぎで入った記録：件数の合わない日の記録・置き場とモードが合わない途中経過・終えたとことんの回は捨てる
    const q = await newPage(); await closeHow(q);
    const d1 = dayBefore(1), d2 = dayBefore(2), lt = G.dailyTags(d2);
    await q.evaluate(([d1, d2, lt]) => { localStorage.setItem("senkyo-v1", JSON.stringify({ v: 1, tut: true, days: { [d1]: { m: [0] }, [d2]: { m: [0, 0, 0, 0, 0], l: lt } }, hdays: { [d1]: { m: [0, 0, 0] }, [d2]: { m: [0, 0, 0, 0, 0] } }, adays: {}, dex: {}, co: 0, miss: [], kofi: {}, ach: {}, ebest: 0, edone: ["E1"],
      runs: { d: { id: "x", date: d1, list: ["q:senkyoken"], res: [] }, ["a:" + d2]: { mode: "a", id: "y", date: d1, list: ["q:senkyoken"], res: [] }, e: { mode: "e", id: "E1", date: d1, list: ["q:senkyoken"], res: [] }, h: { mode: "d", id: "z", date: d1, list: ["q:senkyoken"], res: [] } } })); }, [d1, d2, lt]);
    await q.reload(); await q.waitForTimeout(200);
    const st = await q.evaluate(() => __mb.load());
    check("数の合わない日の記録は捨てる（今日・あとから5問、上級3問）", !st.days[d1] && st.days[d2] && st.hdays[d1] && !st.hdays[d2]);
    check("置き場とモードが合わない途中経過・終えたとことんの回は捨てる", Object.keys(st.runs).length === 0, JSON.stringify(Object.keys(st.runs)));
    // 議席の計算のヒント：1回目は数え方だけ（選び肢は消さない）、2回目でまちがいを1つ消してボタンを止める
    await q.evaluate(() => { const s = __mb.load(); s.runs.p = { mode: "p", id: "P1", date: "2026-11-07", list: ["d:3"], res: [], cur: null }; __mb.save((x) => { x.runs = s.runs; }); __mb.play("p"); });
    await q.waitForTimeout(100); await q.click("#hint");
    const h1 = await q.textContent("#hintbox"), ng1 = await q.locator(".ch.ng").count();
    await q.click("#hint");
    check("議席の計算のヒント：1回目は割って大きい順に数えることだけ・2回目でまちがいを1つ消して止める", h1.includes("大きい順") && ng1 === 0 && await q.locator(".ch.ng").count() === 1 && await q.locator("#hint:disabled").count() === 1);
    await q.context().close();
  }
  // 実績・このゲームについて
  await p.goto(url); await p.waitForTimeout(150); await p.click("#go-ach");
  check("実績は14個で、腕前・集める・続けるの3つの組・まだのものは いま/目標", await p.locator(".ach").count() === 14 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 2 && await p.locator(".ach:not(.got) .bar").count() >= 5);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：党は記号で応援も評価もしないこと・選挙管理委員会で確かめること・出典（e-Gov・総務省）", (await p.textContent("#about")).includes("応援したり、評価したりしません") && (await p.textContent("#about")).includes("選挙管理委員会") && await p.locator("#about a[href*='e-gov.go.jp']").count() >= 4 && await p.locator("#about a[href*='soumu.go.jp']").count() >= 3);
  await p.context().close();

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部一度で正解して初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("全問正解"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }
  // 遊ぶ前・途中に Ko-fi の一言を出さない
  {
    const q = await newPage(); await closeHow(q);
    const a = await q.locator(".kofi").count(); await q.click("#go-d"); const b = await q.locator(".kofi").count();
    check("遊ぶ前・途中には Ko-fi の一言を出さない", a === 0 && b === 0);
    await q.click("#back").catch(() => {}); await q.waitForTimeout(100);
    check("ホームの下にも Ko-fi のリンクを出さない（結果の画面だけ）", await q.locator('a[href*="ko-fi"]').count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから：過去の日の記録を置いて見る
  {
    const q = await newPage();
    await q.evaluate(([d2, d3]) => { localStorage.setItem("senkyo-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0] }, [d3]: { m: [1, 0, 0, 2, 0] } }, hdays: {}, adays: {}, dex: {}, co: 0, miss: [], runs: {}, kofi: {}, ach: {}, ebest: 0, edone: [] })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __mb.lateDays(__mb.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= "2026-11-07");
    check("カレンダー：取りこぼした過去7日（第1回より後）だけを押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    if (lateList.length) {
      const d = lateList[0];
      await q.evaluate((d) => { const b = document.querySelector(`.cal .miss[data-k="${d}"]`); if (b) b.click(); else document.querySelector(".calnav #prev").click(); }, d);
      if (!(await q.locator(".ch").count())) await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __mb.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・シェア・Ko-fi には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
    } else check("あとから：第1回の日（2026-11-07）より前の日は出さない", lateList.length === 0 && TODAY <= "2026-11-08");
    await q.context().close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await a.click("#hint"); await a.click("#hint");
    await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", (await mem(a)).runs.d.cur.hints === 2);
    await b.click(`.ch[data-j="${await ansIdx(b)}"]`); await b.waitForTimeout(150);
    check("別のタブでヒントを使ったあと、こちらで正解しても星を多く付けない", (await mem(a)).runs.d.res[0].m >= 2);
    await a.click(`.ch[data-j="${await ansIdx(a)}"]`); await a.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y, 0) === 1);
    await ctx.close();
  }

  // とことんの並び（何百回）：1つの並びの中で同じ問題を出さない・つなぎ目で同じ問題を続けない
  {
    const q = await newPage(); await closeHow(q);
    const r = await q.evaluate(() => { let bad = 0, joint = 0, n = 0; for (let i = 0; i < 400; i++) { const a = __mb.endlessList(), nd = a; n = nd.length; if (new Set(nd).size !== nd.length) bad++; const b = __mb.endlessList(a[a.length - 1]); if (b[0] === a[a.length - 1]) joint++; } return [bad, joint, n]; });
    check("とことんの並び400回：1つの並びの中で同じ問題を出さず・全部の問題を出し・つなぎ目で続けない", r[0] === 0 && r[1] === 0 && r[2] === G.pool("all").length, r.join(","));
    const pr = await q.evaluate(() => { let bad = 0; for (let i = 0; i < 300; i++) for (const c of ["ken", "tou", "und", "sei", "d", "all"]) { const l = __mb.practiceList(c); if (l.length !== 5 || new Set(l).size !== 5) bad++; } return bad; });
    check("練習の5問を300回×4種類作っても、5問そろい重ならない", pr === 0, pr);
    await q.context().close();
  }

  // スマホ幅でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const w of [320, 390]) {
      const q = await newPage(w); await closeHow(q);
      for (const go of [null, "#go-d", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e", "#go-p"]) {
        // 判を押す動き（大きく出てから縮む）の途中でも横にはみ出さない（2026-11-07 CI でだけ 5px はみ出した）
        if (go === "solve") { await solve(q); for (const t of [0, 60, 120, 200]) { const o = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 0) bad.push(`${w}px 判の動き${t}ms ${o}px`); await q.waitForTimeout(60); } }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => b.getBoundingClientRect().height < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20)))).map((x) => `${w}/${go}:${x}`));
      }
      await q.context().close();
    }
    check("幅320pxでも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }
  // 画面を撮る（自分で見る）
  {
    mkdirSync(path.join(root, "qa-report"), { recursive: true });
    const q = await newPage(390); await closeHow(q);
    await q.screenshot({ path: path.join(root, "qa-report/home.png"), fullPage: true });
    await q.click("#go-d"); await q.screenshot({ path: path.join(root, "qa-report/q1.png"), fullPage: true });
    await solve(q); await q.screenshot({ path: path.join(root, "qa-report/a1.png"), fullPage: true });
    await q.click("#next"); await solve(q); await q.click("#next");
    await q.screenshot({ path: path.join(root, "qa-report/q3.png"), fullPage: true });
    await solve(q); await q.screenshot({ path: path.join(root, "qa-report/a3.png"), fullPage: true });
    await q.context().close();
  }
  // 見やすさの設定を全部入れても、ページの一番下まで動ける
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    const j = await ansIdx(q);
    await q.focus(`.ch[data-j="${j}"]`); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけで選んで答えられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "senkyo-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { m: [0, 1, 0, 0, 2] } }, hdays: {}, adays: {}, dex: { senkyoken: 2, dont: 1 }, co: 3, miss: ["q:senkyoken"], runs: {}, kofi: {}, ach: {}, ebest: 7, edone: [], t: 1 }) };
  await checkTransfer({ browser, url, game: "senkyo-shikumi", sample, check, open: async (pg) => { if (await pg.locator("#howto[open]").count()) await pg.click("#howto-ok"); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 選挙のしくみ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
