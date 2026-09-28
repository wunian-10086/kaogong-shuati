/* 考公刷题机 前端（原生 JS，无依赖） */
"use strict";
window.__APP_VERSION = "gongkao-shuati-2026-09-27-v4";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const serverApi = {
  async get(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "请求失败");
    return data;
  },
  async del(url) { const r = await fetch(url, { method: "DELETE" }); return r.json(); },
};
// 静态分享版（web/engine-local.js 提供 window.__localApi）自动切换为本地存储 + 浏览器判分
const api = window.__localApi || serverApi;
const IS_STATIC = !!window.__STATIC__;

const store = {
  banks: [], state: null, rules: null, bank: null, catalog: null,
  subject: "全部",
  rootTab: "真题",       // 真题 / 行测题库 / 申论题库
  examFilter: "全部",    // 真题页里的科目过滤
  session: null,
};

/* ------------------------------------------------------------ 工具 */
function toast(msg, ms = 1600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), ms);
}
function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function esc(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function userBank(bankId) {
  const banks = (store.state && store.state.banks) || {};
  return banks[bankId] || { fav: [], wrong: [], notes: {}, answered: {} };
}

/* ------------------------------------------------------------ 头部 */
function setHeader({ title, back, right }) {
  $("#topTitle").textContent = title || "考公刷题机";
  $("#backBtn").classList.toggle("hidden", !back);
  $("#topRight").innerHTML = right || "";
}
$("#backBtn").onclick = () => history.back();

function renderSubjectTabs(show = true) {
  const wrap = $("#tabsWrap");
  wrap.classList.toggle("hidden", !show);
  if (!show) return;
  const isCatalog = store.rootTab !== "真题";
  if (isCatalog) {
    const subjects = store.rootTab === "行测题库" ? ["行测"] : ["申论"];
    store.subject = subjects[0];
    $("#subjectTabs").innerHTML = subjects.map(
      (s) => `<button class="active" data-subject="${esc(s)}">${esc(s)}题库 · ${esc(s === "行测" ? "行测5000题" : "申论100题")}</button>`
    ).join("");
    return;
  }
  const filters = ["全部", "行测", "申论"];
  $("#subjectTabs").innerHTML = filters.map(
    (s) => `<button data-subject="${esc(s)}" class="${store.examFilter === s ? "active" : ""}">${esc(s === "全部" ? "历年真题" : s + "真题")}</button>`
  ).join("");
  $$("#subjectTabs button").forEach((b) => (b.onclick = () => { store.examFilter = b.dataset.subject; render(); }));
}

function setBottomNav(active) {
  $$("#bottomNav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.route === active));
}
$$("#bottomNav .nav-item").forEach((b) => (b.onclick = () => { location.hash = b.dataset.route; }));

/* ------------------------------------------------------------ 首页 */
function renderHome() {
  setHeader({
    title: "题库",
    back: false,
    right: `<div class="seg" id="rootSeg">
        <button data-v="真题" class="${store.rootTab === "真题" ? "active" : ""}">真题</button>
        <button data-v="行测题库" class="${store.rootTab === "行测题库" ? "active" : ""}">行测题库</button>
        <button data-v="申论题库" class="${store.rootTab === "申论题库" ? "active" : ""}">申论题库</button>
      </div>`,
  });
  renderSubjectTabs(true);
  setBottomNav("#/");
  $$("#rootSeg button").forEach((b) => (b.onclick = () => {
    store.rootTab = b.dataset.v;
    store.subject = b.dataset.v === "真题" ? "全部" : (b.dataset.v === "行测题库" ? "行测" : "申论");
    render();
  }));
  if (store.rootTab === "真题") return renderExamHome();
  return renderCatalogHome();
}

/* ---------------- 真题（历年考试真题） ---------------- */
function renderExamHome() {
  const filter = store.examFilter || "全部";
  const visible = store.banks.filter(
    (b) => !b.collection && (filter === "全部" || b.subject === filter)
  );
  const inprogress = Object.values((store.state && store.state.inprogress) || {})[0];
  const byYear = {};
  visible.forEach((b) => { (byYear[b.year] = byYear[b.year] || []).push(b); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const subjectLabel = filter === "全部" ? "行测 / 申论" : filter;
  $("#view").innerHTML = `
    ${inprogress ? `<div class="panel" id="resumePanel" style="cursor:pointer">
      <div class="row"><div><div class="label">继续上次练习</div>
      <div class="sub">${esc(inprogress.bankTitle)} · ${esc(inprogress.modeLabel || "")} · 已做 ${inprogress.count} 题</div></div>
      <div class="sub">▶</div></div></div>` : ""}
    <div class="hint">历年国考真题（${subjectLabel}），共 ${visible.length} 套 · 按年份分组，组内再按行测 / 申论区分</div>
    ${years.map((y) => {
      const groups = ["行测", "申论"]
        .map((s) => [s, byYear[y].filter((b) => b.subject === s)])
        .filter(([, arr]) => arr.length);
      return `
      <div class="year-block">
        <div class="year-head">${y} 年<span class="year-sub">${byYear[y].length} 套</span></div>
        ${groups.map(([s, arr]) => `
          <div class="exam-sub">
            <span class="exam-sub-name">${esc(s)}真题</span>
            <span class="exam-sub-count">${arr.length} 套</span>
          </div>
          <div class="bank-grid">${arr.map(bankCard).join("")}</div>`).join("")}
      </div>`;
    }).join("")}
    ${visible.length ? "" : `<div class="empty">没有匹配的真题</div>`}`;
  bindBankCards();
  const rp = $("#resumePanel");
  if (rp) rp.onclick = () => (location.hash = `#/bank/${inprogress.bankId}`);
}

function bindBankCards() {
  $$(".bank-card").forEach((c) => (c.onclick = () => (location.hash = `#/bank/${c.dataset.id}`)));
}

/* ---------------- 教材题库（行测5000题 / 申论100题） ---------------- */
function renderCatalogHome() {
  const cat = store.catalog;
  if (!cat) { $("#view").innerHTML = `<div class="empty">正在读取题库目录…</div>`; return; }
  const collName = store.rootTab === "行测题库" ? "行测5000题" : "申论100题";
  const coll = (cat.collections || []).find((c) => c.name === collName);
  if (!coll) { $("#view").innerHTML = `<div class="empty">没有找到《${esc(collName)}》</div>`; return; }
  const html = (coll.editions || []).filter((e) => !e.label.includes("未标注")).map((edition) => `
    <div class="year-block">
      <div class="year-head">${esc(edition.label)} · ${esc(collName)}<span class="year-sub">${edition.volumes.length} 个分册</span></div>
      <div class="vol-list">
        ${edition.volumes.map(volumeRow).join("")}
      </div>
    </div>`).join("");
  $("#view").innerHTML = `
    <div class="hint">${esc(collName)}：按版本 → 分册（PDF 目录分项）→ 章节选择练习；扫描版分册可一键 OCR 导入</div>
    ${html || `<div class="empty">目录为空</div>`}`;
  $$("#view [data-open-bank]").forEach((el) => (el.onclick = () => (location.hash = `#/bank/${el.dataset.openBank}`)));
  $$("#view [data-ocr]").forEach((el) => (el.onclick = () => startOcr(el.dataset.ocr, el)));
  $$("#view [data-build]").forEach((el) => (el.onclick = () => buildBook(el.dataset.build, el)));
}

function volumeRow(vol) {
  // 本地服务端会把已导入的题库挂到 vol.bank；纯静态分享版没有服务端，
  // 这里用目录里的 bank_id 去题库列表里找回对应的题库，保证分享版也能直接开练。
  const bank =
    vol.bank ||
    (vol.bank_id ? (store.banks || []).find((b) => b.id === vol.bank_id) : null);
  const ratio = Math.round((vol.ocr_ratio || 0) * 100);
  const statusText = bank
    ? `已导入 ${bank.count} 题`
    : vol.kind === "text"
      ? "文字版，可直接导入"
      : `OCR 进度 ${ratio}%（题本 ${vol.ocr_pages}/${vol.pages}、解析 ${vol.ocr_answer_pages || 0}/${vol.answer_pages || 0}）`;
  const action = bank
    ? `<button class="btn small brand" data-open-bank="${esc(bank.id)}">开始练习</button>`
    : vol.kind === "text"
      ? `<button class="btn small ghost" data-build="${esc(vol.id)}">生成题库</button>`
      : vol.job && vol.job.state === "running"
        ? `<span class="badge">OCR 进行中…</span>`
        : ratio >= 90
          ? `<button class="btn small ghost" data-build="${esc(vol.id)}">生成题库</button>`
          : IS_STATIC
            ? `<span class="badge gray">需在电脑端导入</span>`
            : `<button class="btn small ghost" data-ocr="${esc(vol.id)}">OCR 导入</button>`;
  return `<div class="vol-card">
      <div class="vol-main">
        <div class="vol-name">${esc(vol.name)}</div>
        <div class="vol-sub">${esc(statusText)}${vol.note && !/^(OCR 进度|已导入)/.test(vol.note) ? " · " + esc(vol.note) : ""}</div>
      </div>
      <div class="vol-action">${action}</div>
    </div>`;
}

async function startOcr(volumeId, btn) {
  btn.textContent = "启动中…";
  try {
    const res = await api.post("/api/ocr/start", { volumeId });
    toast("OCR 已开始，可在本页查看进度（可随时离开）");
    pollCatalog();
  } catch (err) {
    toast("启动失败：" + err.message);
    btn.textContent = "OCR 导入";
  }
}

async function buildBook(volumeId, btn) {
  btn.textContent = "生成中…";
  try {
    const res = await api.post("/api/build/book", { volumeId });
    toast(`已生成：${res.bank.title}（${res.bank.count} 题）`);
    store.banks = (await api.get("/api/banks")).banks;
    store.catalog = await api.get("/api/catalog");
    render();
  } catch (err) {
    toast("生成失败：" + err.message);
    btn.textContent = "生成题库";
  }
}

let catalogTimer = null;
function pollCatalog() {
  clearInterval(catalogTimer);
  catalogTimer = setInterval(async () => {
    if (store.rootTab === "真题") return;
    try {
      store.catalog = await api.get("/api/catalog");
      if (!location.hash.includes("/bank/")) render();
    } catch (e) { /* 忽略轮询错误 */ }
  }, 8000);
}

function bankCard(b) {
  const p = b.progress || { done: 0, wrong: 0, fav: 0 };
  const pct = b.count ? Math.min(100, Math.round((p.done / b.count) * 100)) : 0;
  const complete = b.answered >= b.count;
  return `<div class="bank-card" data-id="${esc(b.id)}">
    <div class="bank-badges">
      <span class="badge">${esc(b.subject)}</span>
      ${b.variant ? `<span class="badge gray">${esc(b.variant)}</span>` : ""}
      ${complete ? `<span class="badge green">答案</span>` : `<span class="badge red">缺答案</span>`}
    </div>
    <div class="bank-title">${esc(b.title)}</div>
    <div class="bank-sub">共 ${b.count} 题 · 已刷 ${p.done}</div>
    <div class="progress-line"><i style="width:${pct}%"></i></div>
    <div class="bank-sub">错题 ${p.wrong} · 收藏 ${p.fav}</div>
  </div>`;
}

function openSearch() {
  openSheet("搜索题库", `<input id="searchInput" class="subject-answer" style="min-height:auto;padding:10px" placeholder="输入年份/卷别，如 2024 地市">
    <div id="searchList" style="margin-top:10px"></div>`);
  const input = $("#searchInput");
  const run = () => {
    const kw = input.value.trim();
    const list = store.banks.filter((b) => !kw || b.title.includes(kw) || String(b.year).includes(kw));
    $("#searchList").innerHTML = list.map(
      (b) => `<div class="list-item" data-id="${esc(b.id)}"><div class="t">${esc(b.title)}</div><div class="s">${esc(b.subject)} · ${b.count} 题</div></div>`
    ).join("") || `<div class="empty">没有匹配的题库</div>`;
    $$("#searchList .list-item").forEach((el) => (el.onclick = () => { closeSheet(); location.hash = `#/bank/${el.dataset.id}`; }));
  };
  input.oninput = run;
  run();
  input.focus();
}

/* ------------------------------------------------------------ 题库详情 / 练习模式 */
async function renderBank(bankId) {
  renderSubjectTabs(false);
  const bank = store.bank && store.bank.id === bankId ? store.bank : await api.get(`/api/banks/${bankId}`);
  store.bank = bank;
  const ub = userBank(bankId);
  const done = Object.keys(ub.answered || {}).length;
  setHeader({ title: bank.title, back: true, right: `<button class="icon-btn" id="favQuick">★</button>` });
  setBottomNav("");
  const isShenlun = bank.subject === "申论";
  const isTextbook = !!bank.collection || (bank.chapters && bank.chapters.length > 0);
  const modes = [
    { key: "sequence", name: "顺序练习", desc: `已刷 ${done}/${bank.questions.length} 题`, ico: "☰" },
    { key: "random", name: "随机练习", desc: "试卷题目随机打乱练习", ico: "⤨" },
    isTextbook
      ? { key: "chapter", name: "章节练习", desc: `按 PDF 目录分项选章节（${(bank.chapters || []).length} 个）`, ico: "▦" }
      : { key: "module", name: "题型练习", desc: "按模块专练（言语/判断/资料…）", ico: "▦" },
    { key: "exam", name: "模拟考试", desc: `${bank.duration_min || 120} 分钟限时仿真训练`, ico: "◍" },
    { key: "wrong", name: "错题练习", desc: `错题本中 ${(ub.wrong || []).length} 道题重做`, ico: "✗" },
    { key: "fav", name: "收藏练习", desc: `收藏夹中 ${(ub.fav || []).length} 道题`, ico: "★" },
  ];
  const s = store.state.settings;
  $("#view").innerHTML = `
    <div class="hint" style="text-align:center">${esc(bank.title)}</div>
    <div class="hint" style="text-align:center;margin-top:-6px">共 ${bank.questions.length} 题 · ${esc(bank.collection || bank.category || "")} ${bank.edition ? esc(bank.edition) : (bank.year || "")}</div>
    ${bank.import_notes && bank.import_notes.length ? `<div class="hint">⚠ ${esc(bank.import_notes.join("；"))}</div>` : ""}
    <div class="mode-grid">
      ${modes.map((m) => `<div class="mode-card" data-mode="${m.key}">
        <div class="ico">${m.ico}</div><div class="mode-name">${m.name}</div><div class="mode-desc">${esc(m.desc)}</div></div>`).join("")}
    </div>
    <div class="panel">
      <h4>刷题设置</h4>
      <div class="row"><div><div class="label">答题模式</div><div class="sub">刷题模式：先作答再核对；学习模式：直接看答案</div></div>
        <div class="seg" id="segMode">
          <button data-v="brush" class="${s.mode === "brush" ? "active" : ""}">刷题</button>
          <button data-v="study" class="${s.mode === "study" ? "active" : ""}">学习</button>
        </div></div>
      <div class="row"><div><div class="label">核对答案时机</div><div class="sub">做一题核对一次，或整套做完再核对</div></div>
        <div class="seg" id="segTiming">
          <button data-v="single" class="${s.checkTiming === "single" ? "active" : ""}">单题</button>
          <button data-v="whole" class="${s.checkTiming === "whole" ? "active" : ""}">整套</button>
        </div></div>
      <div class="row"><div><div class="label">计时器</div><div class="sub">记录做题时间，可随时暂停</div></div>
        <div class="seg" id="segTimer">
          <button data-v="1" class="${s.showTimer ? "active" : ""}">开启</button>
          <button data-v="0" class="${!s.showTimer ? "active" : ""}">关闭</button>
        </div></div>
    </div>
    ${isShenlun ? `<div class="panel"><h4>申论说明</h4><div class="sub" style="font-size:13px;color:var(--text-2)">
      主观题按《申论评分细则》判分：小题踩点给分（参考答案关键词命中），大作文先定档再扣分。
      答题后点击“提交对答案”即可看到得分明细。${bank.materials ? "本套含给定资料，可在答题页查看。" : ""}</div></div>` : ""}
    <div style="height:10px"></div>
    ${done ? `<button class="btn ghost" id="resetProgress">清除本套刷题进度（已刷 ${done} 题）</button>` : ""}
  `;
  $$(".mode-card").forEach((c) => (c.onclick = () => startMode(c.dataset.mode)));
  bindSeg("#segMode", (v) => saveSettings({ mode: v }));
  bindSeg("#segTiming", (v) => saveSettings({ checkTiming: v }));
  bindSeg("#segTimer", (v) => saveSettings({ showTimer: v === "1" }));
  const rp = $("#resetProgress");
  if (rp) rp.onclick = async () => {
    if (!confirm("确定清除本套的作答进度吗？（错题本和收藏不受影响）")) return;
    await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "progressOne", bankId }) });
    store.state = await api.get("/api/state");
    toast("已清除本套进度");
    render();
  };
}

function bindSeg(sel, cb) {
  const el = $(sel);
  if (!el) return;
  $$("button", el).forEach((b) => (b.onclick = async () => {
    $$("button", el).forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    await cb(b.dataset.v);
  }));
}

async function saveSettings(patch) {
  const res = await api.post("/api/state/settings", patch);
  store.state.settings = res.settings;
  document.body.classList.toggle("study", store.state.settings.mode === "study");
}

function startMode(mode) {
  const bank = store.bank;
  if (mode === "chapter") {
    const chapters = (bank.chapters && bank.chapters.length) ? bank.chapters : [];
    if (!chapters.length) { toast("这套题没有章节信息"); return; }
    openSheet("选择章节（PDF 目录分项）", chapters.map((c) => `
      <div class="list-item" data-chapter="${esc(c.name)}"><div class="t">${esc(c.name)}</div><div class="s">${c.count} 题</div></div>`).join(""));
    $$("#sheetContent .list-item").forEach((el) => (el.onclick = () => { closeSheet(); openPractice({ mode: "chapter", module: el.dataset.chapter }); }));
    return;
  }
  if (mode === "module") {
    const sections = bank.sections && bank.sections.length ? bank.sections : [{ name: bank.subject, count: bank.questions.length }];
    openSheet("选择题型模块", sections.map((s) => `
      <div class="list-item" data-module="${esc(s.name)}"><div class="t">${esc(s.name)}</div><div class="s">${s.count} 题</div></div>`).join(""));
    $$("#sheetContent .list-item").forEach((el) => (el.onclick = () => { closeSheet(); openPractice({ mode: "module", module: el.dataset.module }); }));
    return;
  }
  openPractice({ mode });
}

/* ------------------------------------------------------------ 答题页 */
function buildOrder(bank, mode, module) {
  let list = bank.questions.slice();
  if (mode === "random") list = shuffle(list);
  if (mode === "module") list = list.filter((q) => (q.module || "") === module);
  if (mode === "chapter") list = list.filter((q) => (q.chapter || "") === module);
  if (mode === "wrong") {
    const wrong = userBank(bank.id).wrong || [];
    list = wrong.map((no) => bank.questions.find((q) => q.no === no)).filter(Boolean);
  }
  if (mode === "fav") {
    const fav = userBank(bank.id).fav || [];
    list = fav.map((no) => bank.questions.find((q) => q.no === no)).filter(Boolean);
  }
  if (mode === "exam") list = shuffle(list);
  return list;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function openPractice({ mode, module = "", studyMode = null, resumed = null }) {
  const bank = store.bank;
  if (mode === "wrong" && !(userBank(bank.id).wrong || []).length) { toast("错题本是空的，先去练习吧"); return; }
  if (mode === "fav" && !(userBank(bank.id).fav || []).length) { toast("收藏夹是空的，点题目右上角★收藏"); return; }
  const list = resumed ? resumed.order : buildOrder(bank, mode, module);
  if (!list.length) { toast("没有可练习的题目"); return; }
  const labels = { sequence: "顺序练习", random: "随机练习", module: `题型练习 · ${module}`, chapter: `章节练习 · ${module}`, exam: "模拟考试", wrong: "错题练习", fav: "收藏练习" };
  store.session = {
    id: resumed ? resumed.id : Math.random().toString(36).slice(2, 12),
    bankId: bank.id, bankTitle: bank.title, mode, module,
    modeLabel: labels[mode] || mode,
    order: list.map((q) => q.no),
    idx: resumed ? resumed.idx || 0 : 0,
    answers: resumed ? resumed.answers || {} : {},
    results: resumed ? resumed.results || {} : {},
    durations: resumed ? resumed.durations || {} : {},
    startedAt: resumed ? resumed.startedAt : Date.now(),
    elapsed: resumed ? resumed.elapsed || 0 : 0,
    paused: false,
    showTimer: store.state.settings.showTimer,
    studyMode: studyMode || store.state.settings.mode,
    checkTiming: store.state.settings.checkTiming,
    examLeft: (bank.duration_min || 120) * 60,
    finished: false,
  };
  location.hash = `#/practice/${bank.id}`;
}

function currentQuestion() {
  const s = store.session;
  if (!s) return null;
  const no = s.order[s.idx];
  return store.bank.questions.find((q) => q.no === no);
}

function renderPractice(options = {}) {
  renderSubjectTabs(false);
  const s = store.session;
  if (!s) { location.hash = "#/"; return; }
  const bank = store.bank;
  const q = currentQuestion();
  if (!q) { finishSession(); return; }
  const ub = userBank(bank.id);
  const isFav = (ub.fav || []).includes(q.no);
  const isSubjective = q.type === "subjective" || q.type === "essay";
  const inWrong = (ub.wrong || []).includes(q.no);
  const answered = s.answers[q.no];
  const revealed = s.studyMode === "study" || (s.results[q.no] && s.checkTiming === "single");
  const showAll = s.checkTiming === "whole";

  setHeader({
    title: s.mode === "exam" ? "模拟考试" : (isSubjective ? "申论作答" : "刷题"),
    back: true,
    right: `${s.showTimer ? `<span class="timer" id="timer">${fmtDuration(s.mode === "exam" ? s.examLeft : s.elapsed)}</span>
      <button class="icon-btn" id="pauseBtn">${s.paused ? "▶" : "❚❚"}</button>` : ""}
      <button class="icon-btn" id="cardBtn">▦</button>`,
  });
  document.body.classList.add("qnav-on");

  const material = q.material || (bank.materials ? bank.materials.map((m) => `${m.name}\n${m.text}`).join("\n\n") : "");
  const matImgRaw = q.material_image || "";
  const matImg = matImgRaw
    ? (matImgRaw.startsWith("assets/") || matImgRaw.startsWith("http") ? matImgRaw : `assets/${matImgRaw}`)
    : "";
  const userImg = (ub.images || {})[q.no] || "";
  const rawImg = userImg || q.image || "";
  const imgSrc = rawImg ? (rawImg.startsWith("http") || rawImg.startsWith("data:") || rawImg.startsWith("assets/") ? rawImg : `assets/${rawImg}`) : "";
  const imageHtml = imgSrc
    ? `<div class="q-image-wrap">
         <img class="q-image" src="${esc(imgSrc)}" alt="题目配图" loading="lazy"
              onerror="this.parentNode.innerHTML='<div class=&quot;sub&quot; style=&quot;font-size:12px;color:var(--text-3)&quot;>配图加载失败，可点下方「上传题目截图」补充</div>'">
         <div class="q-image-actions">
           <button class="btn small ghost" data-img="zoom">查看大图</button>
           <button class="btn small ghost" data-img="upload">换 / 上传截图</button>
         </div>
       </div>`
    : "";
  const imageHint = (imgSrc || q.images || !q.options || !q.options.length) && !isSubjective
    ? `<div class="hint" style="background:#fff8e6;color:#8a6d00;border-radius:10px;padding:8px 10px">
        ${imgSrc ? "本题是图形/图表题，配图已从原卷裁出（可点「查看大图」放大）；如不清晰可点「换 / 上传截图」用手机截图替换。"
                 : "本题是图形/图表题，暂未取到配图：可点下方「上传题目截图」，把截好的图传上来（会自动按比例缩放）。"}</div>`
    : "";
  const materialHtml = (material || matImg)
    ? `<div class="material-box" id="materialBox">
         ${matImg ? `<img class="q-image" src="${esc(matImg)}" alt="给定资料" loading="lazy" style="margin-bottom:8px">` : ""}
         ${material ? esc(material.slice(0, 1400)) : ""}
       </div>`
    : "";
  const optionsHtml = q.options && q.options.length
    ? q.options.map((o) => {
        let cls = "option";
        if (answered && answered === o.key) cls += " selected";
        if (revealed) {
          cls += " locked";
          if (o.key === q.answer) cls += " correct";
          else if (answered === o.key) cls += " wrong";
        }
        return `<div class="${cls}" data-key="${esc(o.key)}" role="button" tabindex="0"><span class="key">${esc(o.key)}.</span><span>${esc(o.text)}</span></div>`;
      }).join("")
    : "";

  const subjectiveHtml = isSubjective ? `
    <div class="answer-title">作答区（${q.word_min ? `不少于 ${q.word_min} 字` : ""}${q.word_limit ? `${q.word_min ? "，" : ""}不超过 ${q.word_limit} 字` : ""}）</div>
    <textarea id="subjAnswer" class="subject-answer" placeholder="请输入本题答案…">${esc(s.answers[q.no] || "")}</textarea>
    <div class="char-count"><span id="charCount">${(s.answers[q.no] || "").replace(/\s/g, "").length}</span> 字</div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn small ghost" id="setRefBtn">贴入我的参考答案（按此判分）</button>
      ${q.reference ? `<button class="btn small ghost" id="showRefBtn">查看参考答案</button>` : ""}
    </div>` : "";

  let resultHtml = s.results[q.no] ? renderResultInline(s.results[q.no], q) : "";
  if (!resultHtml && revealed && !isSubjective) {
    // 学习模式 / 整套核对模式下，直接展示答案与解析
    resultHtml = `<div class="answer-box">
      <div class="answer-title">答案与解析</div>
      <div class="answer-main"><span class="ok">正确答案：${esc(q.answer || "见解析")}</span></div>
      ${q.explanation ? `<div class="explain"><b>解析：</b>${esc(q.explanation)}</div>` : ""}
    </div>`;
  }
  if (!resultHtml && revealed && isSubjective && q.reference) {
    resultHtml = `<div class="answer-box"><div class="answer-title">参考答案</div>
      <div class="explain">${esc(q.reference)}</div></div>`;
  }

  $("#view").innerHTML = `
    <div class="q-head">
      <span class="q-tag">${esc(q.module || bank.subject)}</span>
      ${q.sub_type ? `<span class="q-tag">${esc(q.sub_type)}</span>` : ""}
      ${q.chapter ? `<span class="q-tag">${esc(String(q.chapter).split(" / ").slice(-2).join(" "))}</span>` : ""}
      <span class="q-tag">第 ${s.idx + 1}/${s.order.length} 题</span>
      ${q.images ? `<span class="q-tag">选项为图片题</span>` : ""}
      <span style="flex:1"></span>
      <button class="icon-btn" id="favBtn" title="收藏">${isFav ? "★" : "☆"}</button>
      <button class="icon-btn" id="wrongBtn" title="错题本">${inWrong ? "✗" : "＋"}</button>
    </div>
    ${materialHtml}
    ${imageHint}
    ${imageHtml}
    <div class="stem">${esc(q.stem)}</div>
    ${optionsHtml}
    ${subjectiveHtml}
    <div id="inlineResult">${resultHtml}</div>
    ${imgSrc ? "" : `<div style="margin-top:10px"><button class="btn small ghost" id="uploadImgBtn">上传题目截图（按比例缩放）</button></div>`}
    <div style="height:10px"></div>
  `;

  $("#favBtn").onclick = async () => {
    const res = await api.post("/api/fav", { bankId: bank.id, no: q.no });
    ub.fav = res.fav;
    toast(res.added ? "已收藏本题" : "已取消收藏");
    renderPractice();
  };
  if ($("#wrongBtn")) $("#wrongBtn").onclick = async () => {
    const res = await api.post("/api/wrong", { bankId: bank.id, no: q.no, action: inWrong ? "remove" : "add" });
    ub.wrong = res.wrong;
    toast(inWrong ? "已从错题本移除" : "已加入错题本");
    renderPractice();
  };
  if ($("#setRefBtn")) $("#setRefBtn").onclick = () => {
    openSheet("贴入我的参考答案", `
      <div class="sub" style="font-size:13px;color:var(--text-2)">粘贴您手中这份题目的标准答案/采分点，之后本题就按它判分（可随时修改）。</div>
      <textarea id="refText" class="subject-answer" placeholder="粘贴参考答案…">${esc(q.reference || "")}</textarea>
      <div style="height:10px"></div>
      <button class="btn brand" id="saveRef">保存并用于判分</button>`);
    $("#saveRef").onclick = async () => {
      await api.post("/api/reference", { bankId: bank.id, no: q.no, text: $("#refText").value });
      closeSheet();
      toast("已保存参考答案，重新提交即可看到新判分");
    };
  };
  if ($("#showRefBtn")) $("#showRefBtn").onclick = () => openSheet("参考答案", `<div class="explain">${esc(q.reference)}</div>`);
  // 题目配图：查看大图 / 上传截图
  $$("#view [data-img]").forEach((btn) => (btn.onclick = () => {
    if (btn.dataset.img === "zoom") {
      openSheet("题目配图", `<img src="${esc(imgSrc)}" style="width:100%;height:auto;display:block;border-radius:10px">`);
    } else {
      pickImage(q, bank);
    }
  }));
  if ($("#uploadImgBtn")) $("#uploadImgBtn").onclick = () => pickImage(q, bank);
  if ($("#pauseBtn")) $("#pauseBtn").onclick = () => togglePause();
  if ($("#cardBtn")) $("#cardBtn").onclick = openAnswerCard;

  // 选项点击用事件委托处理，避免列表重绘导致监听器丢失
  const optionWrap = $("#view");
  optionWrap.onclick = (ev) => {
    const el = ev.target.closest ? ev.target.closest(".option") : null;
    if (el && el.dataset.key) selectOption(el.dataset.key);
  };
  optionWrap.onkeydown = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = ev.target.closest ? ev.target.closest(".option") : null;
    if (el && el.dataset.key) { ev.preventDefault(); selectOption(el.dataset.key); }
  };
  const ta = $("#subjAnswer");
  if (ta) {
    ta.oninput = () => { $("#charCount").textContent = ta.value.replace(/\s/g, "").length; s.answers[q.no] = ta.value; };
  }

  renderQuestionNav();
  startTimer();
  if (options.scroll !== false) window.scrollTo({ top: 0 });
}

function renderResultInline(result, q) {
  if (!result) return "";
  if (result.type === "objective") {
    return `<div class="answer-box">
      <div class="answer-title">答案</div>
      <div class="answer-main ${result.correct ? "" : ""}">
        ${result.correct ? `<span class="ok">✔ 回答正确</span>` : `<span class="no">✘ 回答错误</span>`}
        <span style="margin-left:8px;font-size:14px;color:var(--text-2)">正确答案：${esc(result.right_answer || "-")}｜你的答案：${esc(result.user_answer || "未作答")}</span>
      </div>
      ${q.explanation ? `<div class="explain"><b>解析：</b>${esc(q.explanation)}</div>` : ""}
    </div>`;
  }
  const points = (result.points || []).map((p) => `
    <div class="point-item ${p.ratio >= 0.7 ? "hit" : "miss"}">
      ${p.ratio >= 0.7 ? "✔" : "○"} 采分点 ${p.index}（${p.score}/${p.full} 分）：${esc(p.point)}
      ${p.hit_keywords && p.hit_keywords.length ? `<div>命中关键词：${p.hit_keywords.map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div>` : ""}
    </div>`).join("");
  const metrics = result.metrics ? `<div class="sub" style="font-size:12px;color:var(--text-2);margin-top:8px">
    字数 ${result.char_count}｜段落 ${result.metrics.paragraphs}｜分论点句 ${result.metrics.argument_markers}｜材料相关度 ${Math.round((result.metrics.topic_overlap || 0) * 100)}%｜引用材料比例 ${Math.round((result.metrics.copy_ratio || 0) * 100)}%</div>` : "";
  return `<div class="score-panel">
    <div class="score-big">${result.score} <span style="font-size:14px">/ ${result.full_score} 分</span>${result.band ? ` <span class="badge">${esc(result.band)}</span>` : ""}</div>
    <div class="sub" style="font-size:12px;color:var(--text-2)">${esc(result.rules || "")}</div>
    ${result.notes && result.notes.length ? `<div class="sub" style="font-size:12px;color:var(--text-2)">${result.notes.map(esc).join("<br>")}</div>` : ""}
    ${metrics}
    ${points}
    ${q.reference ? `<div class="explain" style="margin-top:10px"><b>参考答案：</b>${esc(q.reference)}</div>` : `<div class="explain">该题暂无参考答案，可在“导入题库”里补充答案后重新判分。</div>`}
  </div>`;
}

function renderQuestionNav() {
  const s = store.session;
  const q = currentQuestion();
  const isSubjective = q && (q.type === "subjective" || q.type === "essay");
  const answered = s.answers[q.no];
  const needSubmit = !isSubjective && !s.results[q.no] && s.studyMode !== "study";
  const html = `
    <button id="prevBtn" ${s.idx === 0 ? "disabled" : ""}>上一题</button>
    ${isSubjective
      ? `<button class="primary" id="submitBtn">提交对答案</button>`
      : needSubmit
        ? `<button class="primary" id="submitBtn" ${answered ? "" : "disabled"}>提交对答案</button>`
        : `<button class="primary" id="nextBtn">${s.idx + 1 >= s.order.length ? "交卷/结束" : "下一题"}</button>`}
    <button id="nextBtn2" ${s.idx + 1 >= s.order.length && !isSubjective ? "" : ""}>下一题</button>`;
  let nav = $(".qnav");
  if (!nav) { nav = document.createElement("div"); nav.className = "qnav"; document.body.appendChild(nav); }
  nav.innerHTML = html;
  $("#prevBtn").onclick = () => goto(-1);
  if ($("#submitBtn")) $("#submitBtn").onclick = submitAnswer;
  if ($("#nextBtn")) $("#nextBtn").onclick = () => (s.idx + 1 >= s.order.length ? finishSession() : goto(1));
  if ($("#nextBtn2")) $("#nextBtn2").onclick = () => goto(1);
}

function selectOption(key) {
  const s = store.session;
  const q = currentQuestion();
  if (s.results[q.no] && s.checkTiming === "single" && s.studyMode !== "study") return;
  if (s.studyMode === "study") return;
  s.answers[q.no] = key;
  renderPractice({ scroll: false });
}

async function submitAnswer() {
  const s = store.session;
  const q = currentQuestion();
  const bank = store.bank;
  const answer = q.type === "subjective" || q.type === "essay" ? ($("#subjAnswer") ? $("#subjAnswer").value : "") : (s.answers[q.no] || "");
  if (!answer) { toast("请先作答"); return; }
  s.answers[q.no] = answer;
  const res = await api.post("/api/answer", { bankId: bank.id, no: q.no, answer });
  s.results[q.no] = res.result;
  store.state.banks = store.state.banks || {};
  store.state.banks[bank.id] = store.state.banks[bank.id] || { fav: [], wrong: [] };
  if (res.result.type === "objective" && !res.result.correct) store.state.banks[bank.id].wrong = (store.state.banks[bank.id].wrong || []).concat([q.no]).filter((v, i, a) => a.indexOf(v) === i);
  if (res.result.type === "objective") { s.correctCount = (s.correctCount || 0) + (res.result.correct ? 1 : 0); }
  if (s.studyMode === "study") { goto(1); return; }
  renderPractice();
  if (res.result.type !== "objective") toast(`本题得分 ${res.result.score} / ${res.result.full_score}`);
  else toast(res.result.correct ? "回答正确" : "回答错误，已加入错题本");
}

function goto(delta) {
  const s = store.session;
  s.durations[s.order[s.idx]] = (s.durations[s.order[s.idx]] || 0) + 0;
  s.idx = Math.min(Math.max(0, s.idx + delta), s.order.length - 1);
  renderPractice();
}

function openAnswerCard() {
  const s = store.session;
  const q = currentQuestion();
  const cells = s.order.map((no, i) => {
    const ans = s.answers[no];
    const res = s.results[no];
    let cls = "card-cell";
    if (res && res.type === "objective") cls += res.correct ? " done" : " wrong";
    else if (ans) cls += " done";
    if (i === s.idx) cls += " current";
    return `<div class="${cls}" data-i="${i}">${no}</div>`;
  }).join("");
  openSheet("答题卡", `<div class="legend"><span>■ 已作答</span><span>■ 答错</span><span>□ 未作答</span></div>
    <div class="card-grid">${cells}</div>
    <div style="height:12px"></div>
    <button class="btn" id="finishBtn">结束本次练习并计分</button>`);
  $$("#sheetContent .card-cell").forEach((el) => (el.onclick = () => { s.idx = Number(el.dataset.i); closeSheet(); renderPractice(); }));
  $("#finishBtn").onclick = () => { closeSheet(); finishSession(); };
}

/* ------------------------------------------------------------ 计时器 */
/* ------------------------------------------------------------ 题目配图（截图上传，按比例缩放） */
function pickImage(question, bank) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    toast("正在处理图片…");
    try {
      const scaled = await scaleImage(file, 1200);
      const res = IS_STATIC
        ? await api.post("/api/image", { bankId: bank.id, no: question.no, dataUrl: scaled })
        : await api.post("/api/upload-image", { bankId: bank.id, no: question.no, dataUrl: scaled });
      store.state.banks = store.state.banks || {};
      const ub = store.state.banks[bank.id] || (store.state.banks[bank.id] = { fav: [], wrong: [], notes: {}, answered: {}, images: {} });
      ub.images = ub.images || {};
      ub.images[question.no] = res.path;
      toast(`配图已保存（${Math.round(scaled.length / 1024)}KB，已按比例缩放）`);
      renderPractice({ scroll: false });
    } catch (err) {
      toast("图片处理失败：" + err.message);
    }
  };
  input.click();
}

// 等比例缩放：最长边不超过 maxWidth，输出 JPEG
function scaleImage(file, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("不是有效的图片"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let timerHandle = null;
function startTimer() {
  clearInterval(timerHandle);
  const s = store.session;
  if (!s || !s.showTimer) return;
  timerHandle = setInterval(() => {
    if (!store.session || store.session.paused) return;
    const cur = store.session;
    cur.elapsed += 1;
    if (cur.mode === "exam") {
      cur.examLeft -= 1;
      if (cur.examLeft <= 0) { clearInterval(timerHandle); toast("考试时间到，自动交卷"); finishSession(); return; }
    }
    const el = $("#timer");
    if (el) {
      el.textContent = fmtDuration(cur.mode === "exam" ? cur.examLeft : cur.elapsed);
      el.classList.toggle("paused", cur.paused);
    }
  }, 1000);
}
function togglePause() {
  const s = store.session;
  if (!s) return;
  s.paused = !s.paused;
  toast(s.paused ? "计时已暂停" : "继续计时");
  renderPractice();
}

/* ------------------------------------------------------------ 结束/成绩 */
async function finishSession() {
  const s = store.session;
  if (!s) return;
  clearInterval(timerHandle);
  const bank = store.bank;
  let correct = 0, score = 0, full = 0, doneCount = 0;
  const detail = [];
  s.order.forEach((no) => {
    const q = bank.questions.find((x) => x.no === no);
    const res = s.results[no];
    if (s.answers[no]) doneCount += 1;
    if (res) {
      if (res.type === "objective") { full += res.full_score; if (res.correct) correct += 1; }
      else { full += res.full_score; }
      score += res.score;
    }
    detail.push({ no, answer: s.answers[no] || "", correct: res ? res.correct : null, score: res ? res.score : 0, module: q ? q.module : "" });
  });
  const payload = {
    id: s.id, bankId: bank.id, bankTitle: bank.title, mode: s.mode, modeLabel: s.modeLabel,
    studyMode: s.studyMode, startedAt: s.startedAt, durationSec: s.elapsed,
    count: doneCount, correct, score: Math.round(score * 10) / 10, fullScore: Math.round(full * 10) / 10,
    detail, finished: true,
  };
  await api.post("/api/session", payload);
  store.state = await api.get("/api/state");
  store.lastSession = payload;
  store.session = null;
  document.body.classList.remove("qnav-on");
  const nav = $(".qnav"); if (nav) nav.remove();
  location.hash = `#/result/${payload.id}`;
}

function renderResultFrom(session) {
  renderSubjectTabs(false);
  setHeader({ title: "成绩与解析", back: true });
  setBottomNav("");
  const bank = store.bank;
  const acc = session.count ? Math.round((session.correct / session.count) * 100) : 0;
  const rows = (session.detail || []).map((d) => {
    const q = bank && bank.questions ? bank.questions.find((x) => x.no === d.no) : null;
    const isSubj = q && (q.type === "subjective" || q.type === "essay");
    const mark = isSubj
      ? `<span class="badge gray">主观题 ${d.score} 分</span>`
      : d.correct === true
        ? `<span class="badge green">✔ 正确</span>`
        : d.correct === false
          ? `<span class="badge red">✘ 错误</span>`
          : `<span class="badge gray">未作答</span>`;
    return `<div class="list-item" data-no="${d.no}">
      <div class="t">第 ${d.no} 题 ${mark}</div>
      <div class="q">${esc(q ? q.stem.slice(0, 70) : "")}</div>
      <div class="s">你的答案：${esc(d.answer || "未作答")}${q && q.answer ? `｜正确答案：${esc(q.answer)}` : ""}</div>
    </div>`;
  }).join("");
  $("#view").innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="v">${session.score}</div><div class="k">得分（满分 ${session.fullScore}）</div></div>
      <div class="stat"><div class="v">${acc}%</div><div class="k">正确率</div></div>
      <div class="stat"><div class="v">${fmtDuration(session.durationSec)}</div><div class="k">用时</div></div>
    </div>
    <div class="panel"><div class="row"><div class="label">${esc(session.bankTitle)}</div><div class="sub">${esc(session.modeLabel || "")}</div></div>
      <div class="sub" style="font-size:12px;color:var(--text-2)">已作答 ${session.count} 题｜答对 ${session.correct} 题｜${fmtTime(session.endedAt)}</div></div>
    <div class="section-title">逐题回顾</div>
    ${rows || `<div class="empty">本次没有作答记录</div>`}
    <div style="height:8px"></div>
    <button class="btn brand" id="againBtn">再练一次</button>`;
  $$("#view .list-item").forEach((el) => (el.onclick = () => {
    const no = Number(el.dataset.no);
    openSheet(`第 ${no} 题解析`, (() => {
      const q = bank.questions.find((x) => x.no === no);
      if (!q) return "题目不存在";
      return `<div class="stem">${esc(q.stem)}</div>
        ${q.options.map((o) => `<div class="option ${o.key === q.answer ? "correct" : ""}"><span class="key">${esc(o.key)}.</span><span>${esc(o.text)}</span></div>`).join("")}
        <div class="answer-box"><div class="answer-main">正确答案：${esc(q.answer || "见参考答案")}</div>
        <div class="explain">${esc(q.explanation || q.reference || "")}</div></div>`;
    })());
  }));
  $("#againBtn").onclick = () => { location.hash = `#/bank/${session.bankId}`; };
}

/* ------------------------------------------------------------ 记录 */
function renderHistory() {
  renderSubjectTabs(false);
  setHeader({ title: "历史答题记录", back: false, right: `<button class="icon-btn" id="clearHistory">🗑</button>` });
  setBottomNav("#/history");
  const sessions = store.state.sessions || [];
  $("#view").innerHTML = sessions.length ? sessions.map((s) => `
    <div class="list-item" data-id="${esc(s.id)}">
      <div class="t">${esc(s.bankTitle)}</div>
      <div class="s">${esc(s.modeLabel || "")}｜${fmtTime(s.endedAt)}｜用时 ${fmtDuration(s.durationSec)}</div>
      <div class="s">作答 ${s.count} 题｜答对 ${s.correct}｜得分 ${s.score}/${s.fullScore}</div>
    </div>`).join("") : `<div class="empty">还没有练习记录，去题库开始第一套吧</div>`;
  $$("#view .list-item").forEach((el) => (el.onclick = async () => {
    const s = sessions.find((x) => x.id === el.dataset.id);
    store.bank = await api.get(`/api/banks/${s.bankId}`);
    renderResultFrom(s);
  }));
  const ch = $("#clearHistory");
  if (ch) ch.onclick = async () => {
    if (!confirm("清空全部历史记录？")) return;
    await api.post("/api/reset", { scope: "history" });
    store.state = await api.get("/api/state");
    render();
  };
}

/* ------------------------------------------------------------ 错题本 / 收藏 */
async function renderBook(kind) {
  renderSubjectTabs(false);
  const title = kind === "wrong" ? "错题本" : "收藏夹";
  setHeader({ title, back: false });
  setBottomNav(kind === "wrong" ? "#/wrong" : "#/fav");
  const items = [];
  for (const meta of store.banks) {
    const ub = userBank(meta.id);
    const list = kind === "wrong" ? ub.wrong || [] : ub.fav || [];
    if (!list.length) continue;
    items.push({ meta, list, ub });
  }
  if (!items.length) {
    $("#view").innerHTML = `<div class="empty">${kind === "wrong" ? "还没有错题。做错的客观题会自动进入错题本。" : "还没有收藏。点答题页右上角★即可收藏题目。"}</div>`;
    return;
  }
  $("#view").innerHTML = items.map(({ meta, list }) => `
    <div class="section-title">${esc(meta.title)}（${list.length} 题）</div>
    <div class="panel">
      ${list.map((no) => `<div class="row" data-bank="${esc(meta.id)}" data-no="${no}">
        <div class="label">第 ${no} 题</div>
        <div class="sub">
          <button class="btn small ghost" data-act="open">查看</button>
          <button class="btn small ghost" data-act="remove">移除</button>
        </div></div>`).join("")}
      <div style="height:6px"></div>
      <button class="btn small brand" data-practice="${esc(meta.id)}">练习本套${kind === "wrong" ? "错题" : "收藏"}</button>
    </div>`).join("");
  $$("#view .row").forEach((row) => {
    const bankId = row.dataset.bank, no = Number(row.dataset.no);
    $$("button", row).forEach((btn) => (btn.onclick = async () => {
      if (btn.dataset.act === "remove") {
        await api.post(kind === "wrong" ? "/api/wrong" : "/api/fav", { bankId, no, action: kind === "wrong" ? "remove" : "toggle" });
        store.state = await api.get("/api/state");
        render();
        return;
      }
      store.bank = await api.get(`/api/banks/${bankId}`);
      const q = store.bank.questions.find((x) => x.no === no);
      openSheet(`第 ${no} 题`, `<div class="stem">${esc(q.stem)}</div>
        ${(q.options || []).map((o) => `<div class="option ${o.key === q.answer ? "correct" : ""}"><span class="key">${esc(o.key)}.</span><span>${esc(o.text)}</span></div>`).join("")}
        <div class="answer-box"><div class="answer-main">正确答案：${esc(q.answer || "见参考答案")}</div>
        <div class="explain">${esc(q.explanation || q.reference || "")}</div></div>`);
    }));
  });
  $$("#view [data-practice]").forEach((btn) => (btn.onclick = async () => {
    store.bank = await api.get(`/api/banks/${btn.dataset.practice}`);
    openPractice({ mode: kind === "wrong" ? "wrong" : "fav" });
  }));
}

/* ------------------------------------------------------------ 我的 / 设置 / 规则 / 导入 */
function renderMe() {
  renderSubjectTabs(false);
  setHeader({ title: "我的", back: false });
  setBottomNav("#/me");
  const sessions = store.state.sessions || [];
  const totalQ = sessions.reduce((a, s) => a + (s.count || 0), 0);
  const totalMin = Math.round(sessions.reduce((a, s) => a + (s.durationSec || 0), 0) / 60);
  const wrongTotal = store.banks.reduce((a, b) => a + ((b.progress || {}).wrong || 0), 0);
  $("#view").innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="v">${totalQ}</div><div class="k">累计做题</div></div>
      <div class="stat"><div class="v">${totalMin}</div><div class="k">累计分钟</div></div>
      <div class="stat"><div class="v">${wrongTotal}</div><div class="k">错题数</div></div>
    </div>
    <div class="panel">
      <div class="row" data-go="#/settings"><div class="label">刷题设置</div><div class="sub">模式 / 核对时机 / 计时器 ›</div></div>
      <div class="row" data-go="#/rules"><div class="label">评分规则（申论细则·多源核验）</div><div class="sub">›</div></div>
      <div class="row" data-go="#/share"><div class="label">分享给朋友 / 手机平板安装</div><div class="sub">›</div></div>
      ${IS_STATIC ? "" : `<div class="row" data-go="#/import"><div class="label">导入题库（从题库文件夹 PDF）</div><div class="sub">›</div></div>`}
      <div class="row" data-go="#/about"><div class="label">关于本程序</div><div class="sub">›</div></div>
    </div>
    <div class="panel">
      <h4>数据管理</h4>
      <div class="row"><div class="label">清空错题本</div><button class="btn small ghost" data-reset="wrong">清空</button></div>
      <div class="row"><div class="label">清空收藏</div><button class="btn small ghost" data-reset="fav">清空</button></div>
      <div class="row"><div class="label">清空全部数据（含记录）</div><button class="btn small ghost" data-reset="all">清空</button></div>
    </div>`;
  $$("#view [data-go]").forEach((el) => (el.onclick = () => (location.hash = el.dataset.go)));
  $$("#view [data-reset]").forEach((btn) => (btn.onclick = async () => {
    if (!confirm("确定清空？此操作不可恢复")) return;
    await api.post("/api/reset", { scope: btn.dataset.reset });
    store.state = await api.get("/api/state");
    toast("已清空");
    render();
  }));
}

function renderSettings() {
  renderSubjectTabs(false);
  setHeader({ title: "刷题设置", back: true });
  setBottomNav("");
  const s = store.state.settings;
  $("#view").innerHTML = `
    <div class="panel">
      <h4>答题模式</h4>
      <div class="row"><div><div class="label">刷题模式</div><div class="sub">先作答，再核对答案（适合检验水平）</div></div>
        <div class="seg" id="m1"><button data-v="brush" class="${s.mode === "brush" ? "active" : ""}">使用</button></div></div>
      <div class="row"><div><div class="label">学习模式</div><div class="sub">直接展示答案与解析（适合熟悉题型）</div></div>
        <div class="seg" id="m2"><button data-v="study" class="${s.mode === "study" ? "active" : ""}">使用</button></div></div>
    </div>
    <div class="panel">
      <h4>核对答案时机（刷题模式下）</h4>
      <div class="seg" id="timing">
        <button data-v="single" class="${s.checkTiming === "single" ? "active" : ""}">做完一题核对</button>
        <button data-v="whole" class="${s.checkTiming === "whole" ? "active" : ""}">做完一整套核对</button>
      </div>
      <div class="row" style="margin-top:8px"><div><div class="label">显示计时器</div><div class="sub">记录做题时间，可暂停</div></div>
        <div class="seg" id="timerSeg">
          <button data-v="1" class="${s.showTimer ? "active" : ""}">开</button>
          <button data-v="0" class="${!s.showTimer ? "active" : ""}">关</button>
        </div></div>
      <div class="row"><div><div class="label">模拟考试计分口径</div><div class="sub">官方不公布每题分值，估算口径可切换</div></div>
        <div class="seg" id="scoreSeg">
          <button data-v="estimate" class="${s.scoreModel === "estimate" ? "active" : ""}">模块估算</button>
          <button data-v="average" class="${s.scoreModel === "average" ? "active" : ""}">平均分</button>
        </div></div>
    </div>`;
  $$("#m1 button").forEach((b) => (b.onclick = async () => { await saveSettings({ mode: "brush" }); render(); }));
  $$("#m2 button").forEach((b) => (b.onclick = async () => { await saveSettings({ mode: "study" }); render(); }));
  $$("#timing button").forEach((b) => (b.onclick = async () => { await saveSettings({ checkTiming: b.dataset.v }); render(); }));
  $$("#timerSeg button").forEach((b) => (b.onclick = async () => { await saveSettings({ showTimer: b.dataset.v === "1" }); render(); }));
  $$("#scoreSeg button").forEach((b) => (b.onclick = async () => { await saveSettings({ scoreModel: b.dataset.v }); render(); }));
}

function renderRules() {
  renderSubjectTabs(false);
  setHeader({ title: "评分规则", back: true });
  setBottomNav("");
  const r = store.rules;
  if (!r) { $("#view").innerHTML = `<div class="empty">加载中…</div>`; return; }
  const bands = r.shenlun.zuowen.bands["40"];
  $("#view").innerHTML = `
    <div class="panel">
      <h4>一、客观题（行测）</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        单选题：与标准答案一致得满分，否则 0 分。多选题：多选/少选均不得分。<br>
        每题分值：官方从不公布，本程序默认采用模块估算口径（常识 0.5、言语 0.8、数量 1、判断 0.7、资料 1），可在设置中切换为平均分。
      </div>
    </div>
    <div class="panel">
      <h4>二、申论小题（踩点给分）</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        ${r.shenlun.xiaoti.rules.map((x) => "· " + esc(x)).join("<br>")}
      </div>
    </div>
    <div class="panel">
      <h4>三、申论大作文（先定档，再扣分）</h4>
      <table class="rules">
        <tr><th>档次</th><th>分值区间</th><th>核心标准</th></tr>
        ${bands.map((b) => `<tr><td>${esc(b.name)}</td><td>${b.min}–${b.max}</td><td>${esc(b.desc)}</td></tr>`).join("")}
      </table>
      <div class="sub" style="font-size:12px;color:var(--text-2);margin-top:8px">
        35 分卷口径：一类 28–35、二类 21–27、三类 11–20、四类 0–10（上岸鸭公考）。<br>
        通用扣分项：无标题 −2；错别字每 3 个 −1（上限 −2）；少于 600 字直接四类；大段抄材料降档；字数每少 50 字 −1。
      </div>
    </div>
    <div class="panel">
      <h4>四、阅卷机制</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">${esc(r.shenlun.marking_mechanism.detail)}</div>
    </div>
    <div class="panel">
      <h4>五、规则来源（多源核验）</h4>
      ${r.sources.map((s) => `<div class="src"><b>${esc(s.name)}</b>${s.url ? `<br><a href="${esc(s.url)}" target="_blank">${esc(s.url)}</a>` : s.path ? `<br><span>${esc(s.path)}</span>` : ""}
        <div>${s.extract.map((x) => "· " + esc(x)).join("<br>")}</div></div>`).join("")}
      <div class="sub" style="font-size:12px;color:var(--text-2)">${esc(r.evaluation_note)}</div>
    </div>`;
}

function renderImport() {
  renderSubjectTabs(false);
  setHeader({ title: "导入题库", back: true });
  setBottomNav("");
  $("#view").innerHTML = `
    <div class="panel">
      <h4>从题库文件夹导入</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        选择桌面「题库」文件夹里的 PDF：行测需要「题本 + 答案/解析」两个文件，申论选择带参考答案的真题解析文件。
        扫描版 PDF（整页图片）暂不支持，请用电子版。
      </div>
      <div class="row"><div class="label">文件夹路径</div></div>
      <input id="importRoot" class="subject-answer" style="min-height:auto;padding:10px" value="C:\\Users\\CWZ\\Desktop\\题库">
      <div style="height:10px"></div>
      <button class="btn brand" id="scanBtn">扫描 PDF</button>
    </div>
    <div id="scanResult"></div>`;
  $("#scanBtn").onclick = doScan;
}

async function doScan() {
  const root = $("#importRoot").value.trim();
  $("#scanResult").innerHTML = `<div class="empty">扫描中…（题库较大，约需数秒）</div>`;
  try {
    const data = await api.get(`/api/import/scan?root=${encodeURIComponent(root)}`);
    const text = data.files.filter((f) => f.kind === "text");
    const scan = data.files.filter((f) => f.kind !== "text");
    $("#scanResult").innerHTML = `
      <div class="panel"><h4>可导入（文字版）${text.length} 个</h4>
        <div class="sub" style="font-size:12px;color:var(--text-2)">勾选行测题本并在下拉框里选择配套答案解析文件</div>
        ${text.slice(0, 400).map((f) => `
          <div class="list-item">
            <div class="t">${esc(f.name)}</div>
            <div class="s">${esc(f.rel)}｜${(f.size / 1048576).toFixed(1)}MB｜${f.subject || "未识别"}${f.year ? "｜" + f.year : ""}${f.variant ? "｜" + f.variant : ""}</div>
            <div class="s"><button class="btn small brand" data-import="${esc(f.path)}" data-subject="${esc(f.subject || (f.name.includes("申论") ? "申论" : "行测"))}">导入为题库</button></div>
          </div>`).join("")}
      </div>
      <div class="panel"><h4>扫描版（暂不支持）${scan.length} 个</h4>
        <div class="sub" style="font-size:12px;color:var(--text-2)">${scan.slice(0, 12).map((f) => esc(f.name)).join("、")}${scan.length > 12 ? " 等" : ""}</div>
      </div>`;
    $$("#scanResult [data-import]").forEach((btn) => (btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "导入中…";
      try {
        const payload = { question: btn.dataset.import, subject: btn.dataset.subject, root, overwrite: false };
        if (payload.subject === "行测") {
          const answer = prompt("请粘贴该题本配套的“答案/解析”PDF 完整路径（可留空，仅作学习模式）", "");
          if (answer) payload.answer = answer.replace(/^"|"$/g, "");
        }
        const res = await api.post("/api/import", payload);
        toast(`导入成功：${res.bank.title}（${res.bank.count} 题）`);
        store.banks = (await api.get("/api/banks")).banks;
        btn.textContent = "已导入";
      } catch (err) {
        toast("导入失败：" + err.message);
        btn.disabled = false;
        btn.textContent = "重试导入";
      }
    }));
  } catch (err) {
    $("#scanResult").innerHTML = `<div class="empty">扫描失败：${esc(err.message)}</div>`;
  }
}

function renderAbout() {
  renderSubjectTabs(false);
  setHeader({ title: "关于", back: true });
  setBottomNav("");
  $("#view").innerHTML = `
    <div class="panel">
      <h4>考公刷题机</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        本地离线刷题程序，题库来自桌面「题库」文件夹里的国考真题 PDF（行测 2000–2025、申论 2000–2025），
        导入时自动解析题干、选项、答案与解析。<br><br>
        功能：科目切换 · 顺序/随机/题型/模拟考试/错题/收藏练习 · 刷题模式与学习模式 · 单题或整套核对 ·
        历史记录与继续上次练习 · 计时器（可暂停）· 错题本与收藏夹 · 申论主观题按评分细则自动判分。
      </div>
    </div>
    <div class="panel">
      <h4>文件位置</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        程序目录：outputs\\gongkao-shuati<br>
        题库数据：data\\banks（${store.banks.length} 个题库）<br>
        答题记录：data\\store\\state.json<br>
        导入报告：data\\reports\\import_report.json
      </div>
    </div>`;
}

/* ------------------------------------------------------------ 分享 / 安装 */
async function renderShare() {
  renderSubjectTabs(false);
  setHeader({ title: "分享与安装", back: true });
  setBottomNav("");
  let lan = { url: "", ips: [] };
  if (!IS_STATIC) {
    try { lan = await api.get("/api/share-info"); } catch (e) { /* 忽略 */ }
  }
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const installHint = IS_STATIC
    ? (isIOS
        ? "苹果手机/平板：用 Safari 打开本页 → 点下方「分享」按钮 → 选「添加到主屏幕」，桌面就会出现图标，点开即用（无需联网）。"
        : isAndroid
          ? "安卓手机/平板：用 Chrome 打开本页 → 右上角 ⋮ → 「添加到主屏幕」（或「安装应用」），桌面会出现图标。"
          : "电脑：用 Chrome/Edge 打开本页 → 地址栏右侧「安装」图标，即可像软件一样使用。")
    : (isIOS
        ? "苹果手机/平板：与电脑连同一个 WiFi → 用 Safari 打开上面的地址 → 「分享」→「添加到主屏幕」。"
        : "手机/平板：与电脑连同一个 WiFi → 用浏览器打开上面的地址 → 菜单里选「添加到主屏幕」，之后点图标即可刷题。");
  $("#view").innerHTML = `
    <div class="panel">
      <h4>① 手机 / 平板使用</h4>
      ${IS_STATIC
        ? `<div class="sub" style="font-size:13px;color:var(--text-2)">当前是“分享版”，直接把整个文件夹（或压缩包）发给朋友即可；用手机浏览器打开 <code>index.html</code> 也能用，支持添加到主屏幕离线刷题。</div>`
        : `<div class="sub" style="font-size:13px;color:var(--text-2)">电脑和手机/平板连同一个 WiFi，在手机浏览器输入下面的地址即可（同一局域网，无需安装）：</div>
           <div class="lan-url" id="lanUrl">${esc(lan.url || "（未检测到局域网地址）")}</div>
           <div style="display:flex;gap:8px;margin-top:8px">
             <button class="btn small brand" id="copyLan">复制地址</button>
             ${lan.ips && lan.ips.length > 1 ? `<span class="sub" style="font-size:12px;color:var(--text-3)">其他网卡地址：${esc(lan.ips.join("、"))}</span>` : ""}
           </div>`}
      <div class="sub" style="font-size:13px;color:var(--text-2);margin-top:10px">${esc(installHint)}</div>
    </div>
    <div class="panel">
      <h4>② 分享给朋友</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        ${IS_STATIC
          ? `把整个文件夹打包成 zip 发给朋友（或上传到任意静态托管，如 GitHub Pages / Netlify / 群文件），
             对方解压后双击 <b>index.html</b> 就能用；题库与判分都在本机浏览器里运行，不需要装 Python，也不会把数据传到网上。`
          : `两种方式：<br>
             1）<b>同一 WiFi</b>：把上面的局域网地址发给朋友，他们用手机浏览器打开即可（电脑要一直开着程序）。<br>
             2）<b>长时间分享</b>：用「我的 → 分享与安装 → 导出分享版」，生成一个不需要 Python 的静态文件夹，
             打包发给朋友或上传到静态托管，他们打开网页就能刷题（题库数据包含在里面）。`}
      </div>
      ${IS_STATIC ? "" : `<div style="margin-top:10px"><button class="btn brand" id="exportBtn">导出分享版（无需 Python，可发朋友）</button></div>
      <div id="exportResult" class="sub" style="font-size:12px;color:var(--text-2);margin-top:8px"></div>`}
      <div class="sub" style="font-size:12px;color:var(--text-3);margin-top:10px">
        ${IS_STATIC
          ? "想要一个链接直接发给朋友？把本文件夹上传到 Netlify（app.netlify.com/drop 拖拽即可）或 GitHub Pages，详见项目里的《部署到网上.md》。"
          : "想要一个链接直接发给朋友（对方不用装任何东西）？双击项目里的「部署到Netlify.bat」，或按《部署到网上.md》用 GitHub Pages 发布。"}
      </div>
    </div>
    <div class="panel">
      <h4>③ 使用建议</h4>
      <div class="sub" style="font-size:13px;color:var(--text-2)">
        · 手机/平板建议横屏或竖直使用，界面会自适应；<br>
        · 练习记录、错题、收藏保存在各自设备/浏览器的本地存储里，互不影响；<br>
        · 想换设备继续，用「我的 → 数据管理」里的清空/重来，或在电脑端主程序做完整导入后再导出分享版。
      </div>
    </div>`;
  const copy = $("#copyLan");
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(lan.url); toast("地址已复制，发给朋友即可"); }
    catch (e) { toast("复制失败，请手动复制：" + lan.url); }
  };
  const exp = $("#exportBtn");
  if (exp) exp.onclick = async () => {
    exp.disabled = true; exp.textContent = "导出中…（约需 10-30 秒）";
    try {
      const res = await api.post("/api/export/static", {});
      $("#exportResult").innerHTML = `导出完成：<b>${esc(res.path)}</b><br>共 ${res.banks} 个题库、${(res.size / 1048576).toFixed(1)}MB，整个文件夹发给朋友即可。`;
      toast("分享版已导出");
    } catch (err) { toast("导出失败：" + err.message); }
    exp.disabled = false; exp.textContent = "导出分享版（无需 Python，可发朋友）";
  };
}

/* ------------------------------------------------------------ 弹层 */
function openSheet(title, html) {
  $("#sheetTitle").textContent = title;
  $("#sheetContent").innerHTML = html;
  $("#sheet").classList.remove("hidden");
}
function closeSheet() { $("#sheet").classList.add("hidden"); }
$("#sheet").addEventListener("click", (e) => { if (e.target.dataset && e.target.dataset.close) closeSheet(); });

/* ------------------------------------------------------------ 路由 */
async function render() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
  const nav = $(".qnav"); if (nav) nav.remove();
  document.body.classList.remove("qnav-on");
  try {
    if (!parts.length) renderHome();
    else if (parts[0] === "bank") await renderBank(parts[1]);
    else if (parts[0] === "practice") { renderPractice(); }
    else if (parts[0] === "result") {
      const s = (store.state.sessions || []).find((x) => x.id === parts[1]) || store.lastSession;
      if (!s) { location.hash = "#/history"; return; }
      store.bank = store.bank && store.bank.id === s.bankId ? store.bank : await api.get(`/api/banks/${s.bankId}`);
      renderResultFrom(s);
    }
    else if (parts[0] === "history") renderHistory();
    else if (parts[0] === "wrong") await renderBook("wrong");
    else if (parts[0] === "fav") await renderBook("fav");
    else if (parts[0] === "me") renderMe();
    else if (parts[0] === "settings") renderSettings();
    else if (parts[0] === "rules") renderRules();
    else if (parts[0] === "import") renderImport();
    else if (parts[0] === "share") await renderShare();
    else if (parts[0] === "about") renderAbout();
    else renderHome();
  } catch (err) {
    $("#view").innerHTML = `<div class="empty">出错了：${esc(err.message)}</div>`;
  }
}

window.addEventListener("hashchange", render);
window.addEventListener("scroll", () => $("#topbar").classList.toggle("scrolled", window.scrollY > 4));
document.addEventListener("visibilitychange", () => { if (!document.hidden && store.rootTab !== "真题") pollCatalog(); });

(async function boot() {
  try {
    const [banksRes, stateRes, rulesRes] = await Promise.all([
      api.get("/api/banks"), api.get("/api/state"), api.get("/api/rules"),
    ]);
    store.banks = banksRes.banks;
    store.state = stateRes;
    store.rules = rulesRes;
    try { store.catalog = await api.get("/api/catalog"); } catch (e) { store.catalog = { collections: [] }; }
    document.body.classList.toggle("study", store.state.settings.mode === "study");
  } catch (err) {
    document.body.innerHTML = `<div class="empty" style="padding:40px">无法连接本地服务：${esc(err.message)}<br>请先运行 run.bat 或 python app/server.py</div>`;
    return;
  }
  render();
})();
