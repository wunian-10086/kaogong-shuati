/* 静态版（无需安装 Python）使用的本地引擎：
   1) 用 localStorage 保存答题记录 / 错题 / 收藏 / 设置；
   2) 在浏览器里完成客观题与申论判分（规则与 Python 版一致）。
   由 tools/export_static.py 打包进 dist/。 */
"use strict";

window.__STATIC__ = true;

/* ------------------------------------------------------------ 存储 */
const LS_KEY = "kaogong-shuati-state-v1";

function defaultState() {
  return {
    settings: { mode: "brush", checkTiming: "single", autoNext: true, showTimer: true, scoreModel: "estimate", theme: "light" },
    banks: {},
    sessions: [],
    inprogress: {},
    references: {},
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base, ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      references: data.references || {},
    };
  } catch (e) { return defaultState(); }
}
function saveState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn("保存失败", e); }
}

/* ------------------------------------------------------------ 判分（与 Python 版对齐） */
const STOPWORDS = new Set(["的", "了", "和", "与", "及", "以及", "等", "在", "是", "对", "为", "要", "应", "并", "通过", "进行", "实现", "促进", "加强", "提升", "推动", "完善", "健全", "坚持", "建设", "发展", "问题", "对策", "建议", "做法", "意义", "方面", "同时", "进一步", "不断", "有效", "积极", "相关", "有关", "可以", "能够", "从而", "因此", "并且", "或者", "如果", "由于", "使得", "形成", "开展"]);
const SYNONYMS = {
  "生态产品": ["生态资源", "生态价值", "GEP"], "指导": ["引导", "指引"], "建立": ["设立", "组建", "成立", "构建", "搭建"],
  "培训": ["教育", "宣讲", "学习"], "贷款": ["融资", "信贷", "借款"], "监管": ["监督", "管理", "执法"],
  "标准化": ["规范", "统一标准"], "补贴": ["补助", "扶持资金", "奖补"], "服务平台": ["平台", "系统", "网络平台"],
  "村民": ["农民", "农户", "群众"], "社区": ["基层", "街道"],
};
function cleanForKeys(text) {
  return String(text || "").replace(/[，。；：、（）()\[\]“”"'‘’!！?？…—\-·]/g, "");
}
function pointHit(point, answer) {
  const clean = cleanForKeys(point);
  if (clean.length < 2) return [0, []];
  const grams = new Set();
  for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
  if (!grams.size) return [0, []];
  const sentences = String(answer || "").split(/[。；;\n]/).filter((s) => s.trim());
  if (!sentences.length) return [0, []];
  let best = 0, hits = [];
  sentences.forEach((sentence) => {
    let sent = cleanForKeys(sentence);
    Object.entries(SYNONYMS).forEach(([canonical, variants]) => {
      if (variants.some((v) => sent.includes(v))) sent += canonical;
    });
    const sentGrams = new Set();
    for (let i = 0; i < sent.length - 1; i++) sentGrams.add(sent.slice(i, i + 2));
    const common = [...grams].filter((g) => sentGrams.has(g));
    const ratio = common.length / Math.min(grams.size, 16);
    if (ratio > best) { best = ratio; hits = common.slice(0, 8); }
  });
  let score = 0;
  if (best >= 0.5) score = 1;
  else if (best >= 0.3) score = 0.7;
  else if (best >= 0.15) score = 0.4;
  return [score, hits];
}
function countChars(text) { return String(text || "").replace(/\s/g, "").length; }

function gradeObjective(question, userAnswer, rules) {
  const norm = (v) => [...new Set(String(v || "").toUpperCase().match(/[A-D]/g) || [])].sort().join("");
  const right = norm(question.answer), chosen = norm(userAnswer);
  const full = Number(question.score || 1);
  const correct = !!right && chosen === right;
  return { type: "objective", correct, user_answer: chosen, right_answer: right, full_score: full, score: correct ? full : 0, detail: "" };
}

function gradeEssay(answer, fullScore, wordLimit, wordMin, materials, rules) {
  const charCount = countChars(answer);
  const paragraphs = String(answer || "").split(/\n+/).filter((p) => p.trim());
  const firstLine = (paragraphs[0] || "").trim();
  const hasTitle = paragraphs.length > 1 && firstLine.length <= 30 && !/[。；，,]/.test(firstLine);
  const sourceKeys = keyBag(materials.slice(0, 4000));
  const answerKeys = keyBag(answer);
  const overlap = [...answerKeys].filter((k) => sourceKeys.has(k)).length / Math.max(sourceKeys.size, 1);
  const argLines = paragraphs.filter((p) => /^\s*(首先|其次|再次|此外|第一|第二|第三|其一|其二|一方面|另一方面)/.test(p.trim()));
  const sentences = String(answer || "").split(/[。！？!?]/).filter((s) => s.trim());
  const avgLen = charCount / Math.max(sentences.length, 1);
  const COLLOQUIAL = ["我觉得", "感觉", "特别", "超级", "其实吧", "反正", "然后呢", "emmm", "yyds", "破防", "内卷爆了"];
  const colloquial = COLLOQUIAL.filter((w) => String(answer).includes(w));
  let copyRatio = 0;
  if (materials && answer) {
    const win = 12; let hit = 0, total = 0;
    for (let i = 0; i + win <= answer.length; i += win) { total += 1; if (materials.includes(answer.slice(i, i + win))) hit += 1; }
    copyRatio = hit / Math.max(total, 1);
  }
  const scale = fullScore >= 38 ? "40" : "35";
  const bands = rules.shenlun.zuowen.bands[scale];
  let quality = 0;
  quality += Math.min(overlap * 2.2, 1) * 0.35;
  quality += (paragraphs.length >= 3 && paragraphs.length <= 7 ? 1 : 0.5) * 0.2;
  quality += Math.min(argLines.length / 3, 1) * 0.2;
  quality += (avgLen >= 18 && avgLen <= 60 ? 1 : 0.6) * 0.1;
  quality += (colloquial.length ? 0.4 : 1) * 0.05;
  quality += (charCount >= (wordMin || 800) ? 1 : charCount / Math.max(wordMin || 800, 1)) * 0.1;
  let band = quality >= 0.82 ? bands[0] : quality >= 0.66 ? bands[1] : quality >= 0.45 ? bands[2] : bands[3];
  const span = band.max - band.min;
  let pos = band === bands[0] ? 0.35 : 0.5;
  pos = Math.min(Math.max(pos + (quality - 0.7) * 0.5, 0.1), 0.95);
  let score = band.min + span * pos;
  const notes = [`按 ${fullScore} 分卷口径定档：${band.name}（${band.min}–${band.max} 分）`];
  if (!hasTitle) { score -= 2; notes.push("无标题，扣 2 分"); }
  if (charCount < 600) { notes.push("字数少于 600 字：按阅卷规则直接归四类文"); score = Math.min(score, bands[3].max); band = bands[3]; }
  else if (wordMin && charCount < wordMin) {
    const cut = Math.min(4, (wordMin - charCount) / 50);
    score -= cut; notes.push(`字数比要求少 ${wordMin - charCount} 字，扣 ${cut.toFixed(1)} 分`);
  }
  if (wordLimit && charCount > wordLimit) { notes.push(`字数超出上限 ${charCount - wordLimit} 字，内容冗余会降档`); score -= 1; }
  if (copyRatio > 0.25) { notes.push(`疑似大段摘抄材料（${Math.round(copyRatio * 100)}%），降档处理`); score = Math.min(score, bands[2].max); }
  if (colloquial.length) { notes.push("出现口语化/网络用语：" + colloquial.join("、")); score -= 1; }
  score = Math.max(0, Math.min(score, band === bands[3] ? band.max : fullScore));
  return {
    type: "essay", score: Math.round(score * 10) / 10, full_score: fullScore, band: band.name,
    band_range: [band.min, band.max], band_desc: band.desc, char_count: charCount,
    metrics: { paragraphs: paragraphs.length, char_count: charCount, has_title: hasTitle, topic_overlap: Math.round(overlap * 1000) / 1000, argument_markers: argLines.length, avg_sentence_len: Math.round(avgLen * 10) / 10, colloquial, copy_ratio: Math.round(copyRatio * 1000) / 1000 },
    notes, rules: "大作文先定档（立意/论证/结构/语言/卷面），档内浮动后扣分。",
  };
}
function keyBag(text) {
  const clean = cleanForKeys(text);
  const bag = new Set();
  for (let i = 0; i < clean.length - 1; i += 2) { const p = clean.slice(i, i + 2); if (!STOPWORDS.has(p)) bag.add(p); }
  return bag;
}

function gradeSubjective(answer, reference, fullScore, opts, rules) {
  const charCount = countChars(answer);
  if (opts.isEssay) return gradeEssay(answer, fullScore, opts.wordLimit || 0, opts.wordMin || 0, opts.materials || "", rules);
  let points = String(reference || "").split(/(?:\d{1,2}[.、．]|[；;]|\n)/).map((s) => s.trim()).filter((s) => s.length >= 4).slice(0, 24);
  if (!points.length && reference) points = [reference];
  if (!points.length) {
    return { type: "subjective", score: 0, full_score: fullScore, char_count: charCount, need_reference: true, points: [], notes: ["缺少参考答案，无法按采分点判分，请补充参考答案"] };
  }
  const per = fullScore / points.length;
  let total = 0;
  const detail = points.map((point, i) => {
    const [ratio, hits] = pointHit(point, answer);
    const got = Math.round(per * ratio * 100) / 100;
    total += got;
    return { index: i + 1, point: point.slice(0, 120), hit_keywords: hits, ratio, score: got, full: Math.round(per * 100) / 100 };
  });
  const notes = [];
  if (/(^|\n)\s*(?:\d{1,2}[.、．]|[一二三四五六七八九十]{1,2}[、.]|①|②|（\d）)/.test(answer || "")) { total += 1; notes.push("分点作答，表达分 +1"); }
  if ((String(answer || "").match(/[。；;]/g) || []).length < 2 && charCount > 60) { total -= 1; notes.push("整段作答、缺少条理，扣 1 分"); }
  if (opts.wordLimit && charCount > opts.wordLimit) {
    const over = charCount - opts.wordLimit;
    notes.push(`超出字数上限 ${over} 字：超出部分阅卷不扫描，本次按超出比例扣分`);
    total -= Math.min(2, Math.round((over / Math.max(opts.wordLimit, 1)) * 2 * 100) / 100);
  }
  if (opts.wordMin && charCount < opts.wordMin * 0.6) {
    notes.push(`字数明显不足（要求不少于 ${opts.wordMin} 字，实际 ${charCount} 字）`);
    total = Math.min(total, fullScore * 0.6);
  }
  if (opts.questionType === "gongwen") {
    if (!(/(情况|关于|致|公告|报告|提纲|函|方案)/.test((answer || "").slice(0, 40)))) { total -= 2; notes.push("公文题缺少标题，扣 2 分"); }
    if (!/(落款|单位|日期|XX|××|年\s*\d+\s*月)/.test(answer || "")) { total -= 2; notes.push("公文题缺少落款/日期，扣 2 分"); }
  }
  total = Math.max(0, Math.min(total, fullScore));
  return {
    type: "subjective", score: Math.round(total * 10) / 10, full_score: fullScore, char_count: charCount,
    points: detail, hit_points: detail.filter((d) => d.ratio >= 0.7).length, total_points: detail.length, notes,
    rules: `小题踩点给分：每点 ${per.toFixed(2)} 分，关键词命中即得分（同义替换同样给分）`,
  };
}

function gradeQuestion(question, userAnswer, materials, rules) {
  if (question.type === "subjective" || question.type === "essay") {
    const ref = question.reference || question.explanation || "";
    const qtype = /公文|提纲/.test(question.stem || "") ? "gongwen" : "subjective";
    return gradeSubjective(userAnswer, ref, Number(question.score || 15), {
      wordLimit: Number(question.word_limit || 0), wordMin: Number(question.word_min || 0),
      isEssay: question.type === "essay", materials: materials || "", questionType: qtype,
    }, rules);
  }
  return gradeObjective(question, userAnswer, rules);
}

/* ------------------------------------------------------------ 题库加载 */
const bankCache = {};
function bankMeta(bank) {
  return {
    id: bank.id, title: bank.title, subject: bank.subject, category: bank.category || "",
    collection: bank.collection || "", edition: bank.edition || "", volume: bank.volume || "",
    chapters: bank.chapters || [], year: bank.year || 0, variant: bank.variant || "",
    count: (bank.questions || []).length,
    answered: (bank.questions || []).filter((q) => q.answer || q.reference).length,
    sections: bank.sections || [], notes: bank.import_notes || [],
    duration_min: bank.duration_min || 120, total_score: bank.total_score || 100,
    has_material: !!(bank.materials && bank.materials.length),
  };
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("无法加载 " + src));
    document.head.appendChild(s);
  });
}
async function loadFiles(list) {
  for (const file of list) {
    if (!bankCache[file]) {
      await loadScript(file);
      bankCache[file] = true;
    }
  }
}

async function allBanks() {
  // 首屏只读目录信息（meta.js，几百 KB）；题库正文在点开某套题时才加载
  if (!window.__BANK_META__) {
    await loadFiles(["data/meta.js"]);
  }
  const metas = window.__BANK_META__;
  if (metas) return metas.map((m) => ({ ...m }));
  await loadFiles(window.__BANK_FILES__ || []);
  return (window.__BANKS__ || []).map(bankMeta).filter((m) => m.id);
}

function findBank(id) { return (window.__BANKS__ || []).find((b) => b.id === id); }

// 按需加载某套题的正文
async function ensureBank(id) {
  const found = findBank(id);
  if (found) return found;
  const index = window.__BANK_INDEX__ || {};
  const file = index[id];
  if (!file) return null;
  await loadFiles([file]);
  return findBank(id) || null;
}

/* ------------------------------------------------------------ 本地 API */
function progressOf(state, bankId) {
  const ub = state.banks[bankId] || { fav: [], wrong: [], answered: {} };
  return { wrong: (ub.wrong || []).length, fav: (ub.fav || []).length, done: Object.keys(ub.answered || {}).length };
}

window.__localApi = {
  async get(url) {
    const state = loadState();
    if (url === "/api/banks") {
      const banks = await allBanks();
      banks.forEach((m) => (m.progress = progressOf(state, m.id)));
      return { banks, total: banks.length };
    }
    if (url === "/api/state") return state;
    if (url === "/api/rules") return window.__RULES__;
    if (url === "/api/catalog") return window.__CATALOG__ || { collections: [] };
    if (url.startsWith("/api/banks/")) {
      const bank = await ensureBank(decodeURIComponent(url.split("/api/banks/")[1]));
      if (!bank) throw new Error("题库不存在");
      return bank;
    }
    if (url.startsWith("/api/reference/")) {
      const id = decodeURIComponent(url.split("/api/reference/")[1]);
      return { references: (state.references || {})[id] || {} };
    }
    throw new Error("静态版不支持该接口：" + url);
  },
  async post(url, body) {
    const state = loadState();
    const payload = body || {};
    if (url === "/api/state/settings") {
      state.settings = { ...state.settings, ...payload };
      saveState(state);
      return { ok: true, settings: state.settings };
    }
    if (url === "/api/answer") {
      const bank = await ensureBank(payload.bankId);
      const question = bank && bank.questions.find((q) => Number(q.no) === Number(payload.no));
      if (!question) throw new Error("题目不存在");
      let q = question;
      const refs = (state.references || {})[payload.bankId] || {};
      if (refs[String(payload.no)]) q = { ...question, reference: refs[String(payload.no)] };
      const materials = (bank.materials || []).map((m) => m.text).join("\n");
      const result = gradeQuestion(q, payload.answer || "", materials, window.__RULES__);
      const ub = state.banks[payload.bankId] || (state.banks[payload.bankId] = { fav: [], wrong: [], notes: {}, answered: {} });
      ub.answered = ub.answered || {}; ub.wrong = ub.wrong || []; ub.fav = ub.fav || []; ub.notes = ub.notes || {};
      ub.answered[String(payload.no)] = { answer: payload.answer, correct: result.type === "objective" ? result.correct : null, score: result.score, ts: Date.now() };
      if (result.type === "objective" && !result.correct && !ub.wrong.includes(payload.no)) ub.wrong.push(payload.no);
      if (payload.addWrong && !ub.wrong.includes(payload.no)) ub.wrong.push(payload.no);
      saveState(state);
      return { result, progress: progressOf(state, payload.bankId) };
    }
    if (url === "/api/fav") {
      const ub = state.banks[payload.bankId] || (state.banks[payload.bankId] = { fav: [], wrong: [], notes: {}, answered: {} });
      ub.fav = ub.fav || [];
      const i = ub.fav.indexOf(payload.no);
      let added;
      if (payload.action === "add" || (payload.action !== "remove" && i < 0)) { if (i < 0) ub.fav.push(payload.no); added = true; }
      else { if (i >= 0) ub.fav.splice(i, 1); added = false; }
      saveState(state);
      return { ok: true, added, fav: ub.fav };
    }
    if (url === "/api/wrong") {
      const ub = state.banks[payload.bankId] || (state.banks[payload.bankId] = { fav: [], wrong: [], notes: {}, answered: {} });
      ub.wrong = ub.wrong || [];
      const i = ub.wrong.indexOf(payload.no);
      if (payload.action === "add") { if (i < 0) ub.wrong.push(payload.no); }
      else if (i >= 0) ub.wrong.splice(i, 1);
      saveState(state);
      return { ok: true, wrong: ub.wrong };
    }
    if (url === "/api/note") {
      const ub = state.banks[payload.bankId] || (state.banks[payload.bankId] = { fav: [], wrong: [], notes: {}, answered: {} });
      ub.notes = ub.notes || {};
      ub.notes[String(payload.no)] = payload.text || "";
      saveState(state);
      return { ok: true };
    }
    if (url === "/api/reference") {
      state.references = state.references || {};
      state.references[payload.bankId] = state.references[payload.bankId] || {};
      if (payload.all) Object.assign(state.references[payload.bankId], payload.all);
      else state.references[payload.bankId][String(payload.no)] = payload.text || "";
      saveState(state);
      return { ok: true, references: state.references[payload.bankId] };
    }
    if (url === "/api/image") {
      // 静态分享版：截图配图直接存进浏览器本地（dataURL）
      const ub = state.banks[payload.bankId] || (state.banks[payload.bankId] = { fav: [], wrong: [], notes: {}, answered: {} });
      ub.images = ub.images || {};
      ub.images[payload.no] = payload.dataUrl;
      saveState(state);
      return { ok: true, path: payload.dataUrl };
    }
    if (url === "/api/grade") {
      const bank = await ensureBank(payload.bankId);
      const question = bank && bank.questions.find((q) => Number(q.no) === Number(payload.no));
      if (!question) throw new Error("题目不存在");
      const q = payload.reference ? { ...question, reference: payload.reference } : question;
      const materials = (bank.materials || []).map((m) => m.text).join("\n");
      return gradeQuestion(q, payload.answer || "", materials, window.__RULES__);
    }
    if (url === "/api/session") {
      const session = { id: payload.id || Math.random().toString(36).slice(2, 12), ...payload, endedAt: Date.now() };
      state.sessions = (state.sessions || []).filter((s) => s.id !== session.id);
      state.sessions.unshift(session);
      state.sessions = state.sessions.slice(0, 200);
      if (session.finished) delete (state.inprogress || {})[session.id];
      else (state.inprogress = state.inprogress || {})[session.id] = session;
      saveState(state);
      return { ok: true, id: session.id };
    }
    if (url === "/api/reset") {
      const scope = payload.scope || "all";
      if (scope === "all") { saveState(defaultState()); return { ok: true }; }
      if (scope === "history") { state.sessions = []; state.inprogress = {}; }
      if (scope === "wrong") Object.values(state.banks).forEach((ub) => (ub.wrong = []));
      if (scope === "fav") Object.values(state.banks).forEach((ub) => (ub.fav = []));
      if (scope === "progress") Object.values(state.banks).forEach((ub) => (ub.answered = {}));
      if (scope === "progressOne" && state.banks[payload.bankId]) state.banks[payload.bankId].answered = {};
      saveState(state);
      return { ok: true };
    }
    if (url === "/api/ocr/start" || url === "/api/build/book" || url === "/api/import") {
      throw new Error("分享版是纯静态页面，不支持 OCR / 导入；请在电脑端的主程序里完成后再分享。");
    }
    throw new Error("静态版不支持该接口：" + url);
  },
  async del() { throw new Error("静态版不支持删除接口"); },
};
