/* AI Squad core — pure, DOM-free logic shared by the browser app and the node:test suite.
   Loads as a classic <script> (exposes globalThis.SquadCore) or via require(). */
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  else root.SquadCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
"use strict";

/* ---------------- text + deterministic randomness ---------------- */
function foldText(s){
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function slugName(s){
  return foldText(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function escapeRegExp(s){
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// FNV-1a 32-bit: stable across engines, good enough to seed persona choices.
function hashString(s){
  let h = 0x811c9dc5;
  const str = String(s);
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
// mulberry32: tiny seeded PRNG returning floats in [0, 1).
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededRng(...parts){ return mulberry32(hashString(parts.join("␟"))); }
function pick(items, rng){
  if(!items || !items.length) return undefined;
  return items[Math.floor((rng || Math.random)() * items.length) % items.length];
}
function shuffledCopy(items, rng){
  const r = rng || Math.random;
  const out = [...items];
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function uniqueAis(ais){
  const seen = new Set();
  const out = [];
  for(const ai of ais){
    if(!ai || seen.has(ai.id)) continue;
    seen.add(ai.id);
    out.push(ai);
  }
  return out;
}
function replyItems(reply){
  if(!reply) return [];
  if(Array.isArray(reply)) return reply;
  if(Array.isArray(reply.items)) return reply.items;
  return [reply];
}
// Values may be plain strings or {en, es} pairs.
function localized(value, lang){
  if(value && typeof value === "object") return value[lang] || value.en || value.es || "";
  return value == null ? "" : String(value);
}

/* ---------------- @mentions ---------------- */
// Where the caret sits inside an "@name" or "+@name" token, or null.
function mentionQueryAt(value, pos){
  const before = String(value || "").slice(0, pos);
  const at = before.lastIndexOf("@");
  if(at < 0) return null;
  const prefix = at === 0 ? "" : before[at - 1];
  const additive = prefix === "+";
  if(additive){
    const beforePlus = at <= 1 ? "" : before[at - 2];
    if(beforePlus && !/\s/.test(beforePlus)) return null;
  }else if(prefix && !/\s/.test(prefix)){
    return null;
  }
  const query = before.slice(at + 1);
  if(/[\n\r.,!?;:()[\]{}]/.test(query) || query.length > 40) return null;
  return { start: additive ? at - 1 : at, query, additive };
}
// A leading "/command" being typed (no spaces yet), or null.
function commandQueryAt(value, pos){
  const before = String(value || "").slice(0, pos);
  if(!before.startsWith("/") || /\s/.test(before) || before.includes("@")) return null;
  return { start: 0, query: before.slice(1) };
}
// catalog: [{ name, source:"group"|"library", ai }]. Longest names win so "@Lic. Paz" beats "@Paz".
function findMentions(catalog, text, additive){
  const folded = foldText(text);
  const hits = [];
  const used = new Set();
  const prefix = additive ? "\\+@" : "@";
  const ordered = [...catalog].sort((a, b)=>b.name.length - a.name.length);
  const claimed = [];
  for(const item of ordered){
    const name = escapeRegExp(foldText(item.name));
    const rx = new RegExp(`(^|\\s)${prefix}${name}(?=$|\\s|[.,!?;:])`, "g");
    let m, matched = false;
    while((m = rx.exec(folded))){
      const start = m.index + m[1].length;
      const end = start + m[0].length - m[1].length;
      if(claimed.some(([s, e])=>start < e && end > s)) continue;
      claimed.push([start, end]);
      matched = true;
    }
    if(!matched || used.has(item.ai.id)) continue;
    if(item.source === "group" && item.ai.muted) continue;
    used.add(item.ai.id);
    hits.push(item.ai);
  }
  // Report in the order they were written.
  return hits.sort((a, b)=>folded.indexOf("@" + foldText(a.name)) - folded.indexOf("@" + foldText(b.name)));
}
function sortMentionOptions(catalog, opts){
  const { query = "", additive = false, usage = {} } = opts || {};
  const q = foldText(query.trim());
  const uses = item=>usage[item.ai.id] || 0;
  return catalog
    .filter(item=>!additive || item.source !== "group")
    .filter(item=>!q || foldText(item.name).includes(q))
    .sort((a, b)=>{
      if(uses(a) !== uses(b)) return uses(b) - uses(a);
      if(q){
        const ap = foldText(a.name).startsWith(q) ? 0 : 1;
        const bp = foldText(b.name).startsWith(q) ? 0 : 1;
        if(ap !== bp) return ap - bp;
      }
      return a.name.localeCompare(b.name);
    });
}

/* ---------------- slash commands ---------------- */
function quickSlashCommand(text){
  const cmd = foldText(String(text || "").trim().split(/\s+/)[0]);
  if(cmd === "/dato" || cmd === "/fact") return "fact";
  if(cmd === "/chiste" || cmd === "/dadjoke" || cmd === "/dad") return "dadjoke";
  if(cmd === "/chisme" || cmd === "/gossip") return "gossip";
  if(cmd === "/drama") return "drama";
  return "";
}
function parseVoteCommand(text){
  if(!/^\/(votar|vote)(\s|$)/i.test(text)) return null;
  const raw = text.replace(/^\/(votar|vote)/i, "").trim();
  if(!raw) return { error: true };
  const clean = raw.replace(/^¿|[?؟]$/g, "").trim();
  let options = clean.split(/\s+(?:o|or|vs\.?|versus)\s+/i).map(x=>x.trim()).filter(Boolean);
  if(options.length < 2) options = [clean, "No"];
  return { raw, question: raw, options: options.slice(0, 4) };
}
// "/debate <idea>" or "/debatir <idea>" runs the 3-round War Room protocol in any group.
function parseDebateCommand(text){
  const m = String(text || "").match(/^\/(debate|debatir|warroom)(?:\s+([\s\S]*))?$/i);
  if(!m) return null;
  const idea = (m[2] || "").trim();
  return idea ? { idea } : { error: true };
}

/* ---------------- turn scheduling ---------------- */
function activeAis(group){ return group.ais.filter(a=>!a.muted); }
function firstTurnRepliers(group, rng){
  const available = activeAis(group);
  return available.length <= 5 ? available : shuffledCopy(available, rng).slice(0, 5);
}
// Chaos mode: 2-4 random members; anyone named in the last user message jumps the queue.
function pickChaosRepliers(group, rng){
  const r = (rng || Math.random)();
  const count = r < 0.45 ? 2 : r < 0.80 ? 3 : 4;
  const lastUser = [...group.messages].reverse().find(m=>m.sender === "user");
  const text = foldText(lastUser ? lastUser.text : "");
  const available = activeAis(group);
  const named = a=>new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(foldText(a.name))}(?![\\p{L}\\p{N}])`, "u").test(text);
  const mentioned = available.filter(named);
  const rest = shuffledCopy(available.filter(a=>!mentioned.includes(a)), rng);
  return [...mentioned, ...rest].slice(0, Math.max(count, Math.min(mentioned.length, 4)));
}
function roundRepliers(group, startAiIndex, rng){
  return group.mode === "chaos"
    ? pickChaosRepliers(group, rng)
    : group.ais.slice(startAiIndex || 0).filter(ai=>!ai.muted);
}
/* Decide who answers a user message. Precedence:
   first message (non-deliberation) > explicit reply targets > +@additive > @mention > deliberation > round. */
function planTurn(group, input){
  const { text = "", isFirstUserMessage = false, replyTargets = [], catalog = [], rng } = input || {};
  if(isFirstUserMessage && group.mode !== "deliberation"){
    return { kind: "first", ais: firstTurnRepliers(group, rng) };
  }
  const targets = uniqueAis(replyTargets.filter(ai=>ai && !ai.muted));
  if(targets.length) return { kind: "reply", ais: targets };
  const additive = findMentions(catalog, text, true);
  if(additive.length){
    return { kind: "additive", ais: uniqueAis([...roundRepliers(group, 0, rng), ...additive]), mentioned: additive };
  }
  const mentioned = findMentions(catalog, text, false);
  if(mentioned.length) return { kind: "mention", ais: mentioned, mentioned };
  if(group.mode === "deliberation") return { kind: "deliberation", ais: activeAis(group) };
  return { kind: "round", ais: roundRepliers(group, 0, rng) };
}

/* ---------------- deliberation protocol ---------------- */
const DELIBERATION_ROUNDS = [
  { round: 1, id: "open",     label: { en: "Opening positions", es: "Posiciones iniciales" } },
  { round: 2, id: "cross",    label: { en: "Cross-examination", es: "Contrapreguntas" } },
  { round: 3, id: "converge", label: { en: "Convergence & vote", es: "Convergencia y voto" } }
];
// Round 2 pairs speaker i with member i+1 so every position gets challenged exactly once.
function deliberationSchedule(members){
  const list = members.filter(ai=>ai && !ai.muted);
  const steps = [];
  for(const r of DELIBERATION_ROUNDS){
    list.forEach((ai, i)=>{
      const step = { round: r.round, phase: r.id, speaker: ai };
      if(r.id === "cross" && list.length > 1) step.target = list[(i + 1) % list.length];
      steps.push(step);
    });
  }
  return steps;
}
const VERDICTS = ["GO", "REVISE", "NO-GO"];
const VERDICT_LABELS = {
  en: { "GO": "Go", "REVISE": "Go with conditions", "NO-GO": "No-go" },
  es: { "GO": "Avanzar", "REVISE": "Avanzar con condiciones", "NO-GO": "No avanzar" }
};
function parseVerdictVote(text){
  const f = foldText(text).replace(/\*/g, "");
  const m = f.match(/\b(?:vote|voto)\s*[:：\-–—]\s*(no[\s-]?go|no avanzar|go|avanzar|revise|revisar)\b/);
  if(!m) return null;
  const v = m[1].replace(/\s+/g, " ");
  if(/^no/.test(v)) return "NO-GO";
  if(v === "revise" || v === "revisar") return "REVISE";
  return "GO";
}
// Plurality vote; ties break toward the more conservative verdict. No votes => REVISE.
function tallyVerdict(votes){
  const counts = { "GO": 0, "REVISE": 0, "NO-GO": 0 };
  for(const v of votes) if(v in counts) counts[v]++;
  const max = Math.max(...Object.values(counts));
  if(max === 0) return { verdict: "REVISE", counts };
  const tied = VERDICTS.filter(v=>counts[v] === max);
  return { verdict: tied[tied.length - 1], counts };
}
const MEMO_SECTIONS = [
  { key: "decision",  title: { en: "Decision",            es: "Decisión" } },
  { key: "rationale", title: { en: "Rationale",           es: "Fundamentos" } },
  { key: "risks",     title: { en: "Risks & mitigations", es: "Riesgos y mitigaciones" } },
  { key: "next",      title: { en: "Next steps",          es: "Próximos pasos" } }
];
const MEMO_HEADING = { en: "Decision Memo", es: "Memo de decisión" };
// Parse an LLM-written memo into the 4 canonical sections, or null if it drifted from the format.
function parseMemoSections(text){
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let current = null;
  for(const line of lines){
    // Headings must arrive in order (1→4), so numbered lists inside a section stay items.
    const h = line.match(/^\s*(?:#{1,6}\s*|\*\*)?\s*([1-4])[.)]\s*\**\s*([^*:\n]+)\**\s*:?\s*\**\s*(.*)$/);
    if(h && +h[1] === sections.length + 1){
      current = { index: +h[1], title: h[2].trim(), lines: [] };
      if(h[3] && h[3].trim()) current.lines.push(h[3].trim());
      sections.push(current);
    }else if(current && line.trim()){
      current.lines.push(line.trim());
    }
  }
  if(sections.length !== 4 || sections.some(s=>!s.lines.length)) return null;
  return sections.map((s, i)=>({
    key: MEMO_SECTIONS[i].key,
    title: s.title,
    items: s.lines.map(l=>l.replace(/^[-*•]\s*/, ""))
  }));
}
function memoToMarkdown(memo, lang){
  const L = lang === "es" ? "es" : "en";
  const tally = VERDICTS.map(v=>`${v} ${memo.counts ? memo.counts[v] || 0 : 0}`).join(" · ");
  const out = [`### 🧭 ${MEMO_HEADING[L]}${memo.idea ? ` — ${memo.idea}` : ""}`, "",
    `**${VERDICT_LABELS[L][memo.verdict] || memo.verdict}** (${memo.verdict}; ${tally})`];
  memo.sections.forEach((s, i)=>{
    out.push("", `**${i + 1}. ${s.title}**`);
    for(const item of s.items) out.push(`- ${item}`);
  });
  return out.join("\n");
}

/* ---------------- OpenRouter SSE streaming ---------------- */
// Feed the accumulated buffer; returns complete deltas and the unconsumed tail.
function parseSSE(buffer){
  const out = { deltas: [], done: false, error: null, rest: "" };
  const text = String(buffer || "");
  const lastNl = text.lastIndexOf("\n");
  if(lastNl < 0){ out.rest = text; return out; }
  out.rest = text.slice(lastNl + 1);
  for(const rawLine of text.slice(0, lastNl).split("\n")){
    const line = rawLine.replace(/\r$/, "");
    if(!line.startsWith("data:")) continue;          // blank separators, ": OPENROUTER PROCESSING" comments
    const payload = line.slice(5).trim();
    if(!payload) continue;
    if(payload === "[DONE]"){ out.done = true; break; }
    let json;
    try{ json = JSON.parse(payload); }catch(e){ continue; }
    if(json.error){
      out.error = { message: json.error.message || "stream error", code: json.error.code || null };
      break;
    }
    const choice = json.choices && json.choices[0];
    const delta = choice && choice.delta && choice.delta.content;
    if(typeof delta === "string" && delta) out.deltas.push(delta);
  }
  return out;
}

/* ---------------- transcript export ---------------- */
function defaultFormatTime(ts){
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
function transcriptToMarkdown(group, opts){
  const o = opts || {};
  const L = o.lang === "es" ? "es" : "en";
  const fmt = o.formatTime || defaultFormatTime;
  const youLabel = o.userName || (L === "es" ? "Vos" : "You");
  const resolve = o.resolveSender || (id=>{
    const ai = group.ais.find(a=>a.id === id);
    return ai ? { name: ai.name, emoji: ai.emoji } : null;
  });
  const who = m=>{
    if(m.sender === "user") return youLabel;
    const s = resolve(m.sender);
    return s ? `${s.emoji || ""} ${s.name}`.trim() : `${m.senderEmoji || ""} ${m.senderName || "?"}`.trim();
  };
  const visible = group.messages.filter(m=>!m.hidden && !m.streaming);
  const H = L === "es"
    ? { members: "Integrantes", transcript: "Transcripción", exported: "Exportado", msgs: "mensajes", mode: "modo", reply: "respondiendo a", reactions: "Reacciones", empty: "_Sin mensajes._" }
    : { members: "Members", transcript: "Transcript", exported: "Exported", msgs: "messages", mode: "mode", reply: "replying to", reactions: "Reactions", empty: "_No messages._" };
  const lines = [
    `# ${group.emoji || "🤖"} ${group.name}`,
    "",
    `> ${H.exported} ${fmt(o.now || Date.now())} · ${visible.filter(m=>m.sender !== "system").length} ${H.msgs} · ${H.mode}: ${group.mode || "normal"}${o.engineLabel ? ` · ${o.engineLabel}` : ""}`,
    "",
    `## ${H.members}`,
    ""
  ];
  for(const ai of group.ais){
    const brief = String(ai.prompt || "").split(/(?<=[.!?])\s/)[0].slice(0, 160);
    lines.push(`- ${ai.emoji || "🤖"} **${ai.name}**${ai.muted ? " _(muted)_" : ""}${brief ? ` — ${brief}` : ""}`);
  }
  lines.push("", `## ${H.transcript}`, "");
  if(!visible.length) lines.push(H.empty, "");
  for(const m of visible){
    if(m.sender === "system"){
      if(m.kind === "memo" && m.memo){
        lines.push(memoToMarkdown(m.memo, L), "");
      }else{
        lines.push(m.kind === "round" ? `---\n\n#### ${m.text}` : `_${String(m.text).replace(/\n+/g, " ")}_`, "");
      }
      continue;
    }
    lines.push(`**${who(m)}** · ${fmt(m.ts)}`);
    for(const r of replyItems(m.replyTo)){
      const s = r.sender === "user" ? { name: youLabel } : resolve(r.sender);
      const name = s ? `${s.emoji ? s.emoji + " " : ""}${s.name}` : (r.senderName || "?");
      lines.push(`> ↩ ${H.reply} ${name}: ${String(r.text || "").replace(/\s+/g, " ").slice(0, 140)}`);
    }
    lines.push(String(m.text || ""));
    if(Array.isArray(m.reactions) && m.reactions.length){
      lines.push(`<sub>${H.reactions}: ${m.reactions.map(r=>{
        const s = resolve(r.sender);
        return `${r.emoji || "👍"} ${s ? s.name : "?"}`;
      }).join(", ")}</sub>`);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* ---------------- shareable squad templates ---------------- */
const TEMPLATE_FORMAT = "ai-squad.squad-template";
const TEMPLATE_VERSION = 1;
const MODES = ["normal", "chaos", "deliberation"];
const LIMITS = { members: 64, name: 40, emoji: 8, prompt: 4000, model: 120, transcript: 2000, text: 8000 };
const clampInt = (v, lo, hi, d)=>{ const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const clampNum = (v, lo, hi, d)=>{ const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

// Never exports keys, ids, usage stats or cached statuses — only what another person needs to recreate the squad.
function exportSquadTemplate(group, opts){
  const o = opts || {};
  const index = new Map(group.ais.map((ai, i)=>[ai.id, i]));
  const t = {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    name: group.name,
    emoji: group.emoji || "🤖",
    mode: MODES.includes(group.mode) ? group.mode : "normal",
    ctx: clampInt(group.ctx, 4, 200, 24),
    lenBias: clampInt(group.lenBias, -5, 5, 0),
    temperature: clampNum(group.temperature, 0.2, 1.6, 1),
    members: group.ais.map(ai=>{
      const m = { name: ai.name, emoji: ai.emoji || "🤖", prompt: ai.prompt || "" };
      if(ai.role) m.role = ai.role;
      if(ai.model) m.model = ai.model;
      if(ai.muted) m.muted = true;
      return m;
    })
  };
  if(o.includeTranscript){
    t.transcript = group.messages.filter(m=>!m.hidden && !m.streaming).map(m=>{
      const from = m.sender === "user" || m.sender === "system" ? m.sender
        : index.has(m.sender) ? index.get(m.sender) : null;
      const item = { from, text: m.text, ts: m.ts };
      if(from === null){ item.from = "guest"; item.name = m.senderName || "?"; item.emoji = m.senderEmoji || "🤖"; }
      if(m.kind) item.kind = m.kind;
      if(m.memo) item.memo = m.memo;
      return item;
    });
  }
  return t;
}
function parseSquadTemplate(input){
  const errors = [];
  let data = input;
  if(typeof input === "string"){
    try{ data = JSON.parse(input); }catch(e){ return { ok: false, errors: ["invalid JSON: " + e.message] }; }
  }
  if(!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["template must be a JSON object"] };
  if(data.format !== TEMPLATE_FORMAT) errors.push(`format must be "${TEMPLATE_FORMAT}"`);
  if(data.version !== TEMPLATE_VERSION) errors.push(`unsupported version ${JSON.stringify(data.version)}`);
  const str = (v, max)=>typeof v === "string" ? v.trim().slice(0, max) : "";
  if(!Array.isArray(data.members) || !data.members.length) errors.push("members must be a non-empty array");
  else if(data.members.length > LIMITS.members) errors.push(`at most ${LIMITS.members} members`);
  const members = (Array.isArray(data.members) ? data.members.slice(0, LIMITS.members) : []).map((m, i)=>{
    const name = str(m && m.name, LIMITS.name);
    const prompt = str(m && m.prompt, LIMITS.prompt);
    if(!name) errors.push(`members[${i}].name is required`);
    if(!prompt) errors.push(`members[${i}].prompt is required`);
    const out = { name, emoji: str(m && m.emoji, LIMITS.emoji) || "🤖", prompt };
    const role = str(m && m.role, 20);
    if(role) out.role = role;
    const model = str(m && m.model, LIMITS.model);
    if(model && /^[\w.\-]+\/[\w.:\-]+$/.test(model)) out.model = model;
    if(m && m.muted === true) out.muted = true;
    return out;
  });
  const template = {
    format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION,
    name: str(data.name, 60) || "Imported squad",
    emoji: str(data.emoji, LIMITS.emoji) || "🤖",
    mode: MODES.includes(data.mode) ? data.mode : "normal",
    ctx: clampInt(data.ctx, 4, 200, 24),
    lenBias: clampInt(data.lenBias, -5, 5, 0),
    temperature: clampNum(data.temperature, 0.2, 1.6, 1),
    members
  };
  if(data.transcript !== undefined){
    if(!Array.isArray(data.transcript)) errors.push("transcript must be an array");
    else{
      template.transcript = data.transcript.slice(0, LIMITS.transcript).flatMap((m, i)=>{
        if(!m || typeof m.text !== "string"){ errors.push(`transcript[${i}].text is required`); return []; }
        const fromOk = m.from === "user" || m.from === "system" || m.from === "guest"
          || (Number.isInteger(m.from) && m.from >= 0 && m.from < members.length);
        if(!fromOk){ errors.push(`transcript[${i}].from is invalid`); return []; }
        const item = { from: m.from, text: m.text.slice(0, LIMITS.text), ts: Number.isFinite(m.ts) ? m.ts : 0 };
        if(m.from === "guest"){ item.name = str(m.name, LIMITS.name) || "?"; item.emoji = str(m.emoji, LIMITS.emoji) || "🤖"; }
        if(m.kind === "round" || m.kind === "memo") item.kind = m.kind;
        if(m.kind === "memo" && m.memo && Array.isArray(m.memo.sections) && VERDICTS.includes(m.memo.verdict)) item.memo = m.memo;
        return [item];
      });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, template };
}
// Turn a validated template into a group; the caller supplies ids and per-member runtime config (model/key).
function templateToGroup(template, makeId, memberDefaults){
  const ais = template.members.map(m=>({
    id: makeId(), name: m.name, emoji: m.emoji, prompt: m.prompt,
    ...(memberDefaults ? memberDefaults(m) : {}),
    ...(m.model ? { model: m.model } : {}),
    ...(m.role ? { role: m.role } : {}),
    ...(m.muted ? { muted: true } : {})
  }));
  const messages = (template.transcript || []).map(m=>{
    const msg = { id: makeId(), text: m.text, ts: m.ts || Date.now() };
    if(m.from === "user" || m.from === "system") msg.sender = m.from;
    else if(m.from === "guest"){ msg.sender = "guest:" + slugName(m.name); msg.senderName = m.name; msg.senderEmoji = m.emoji; }
    else msg.sender = ais[m.from].id;
    if(m.kind) msg.kind = m.kind;
    if(m.memo) msg.memo = m.memo;
    return msg;
  });
  return {
    id: makeId(), name: template.name, emoji: template.emoji, mode: template.mode,
    ctx: template.ctx, lenBias: template.lenBias, temperature: template.temperature,
    ambient: false, mentionUsage: {}, ais, messages
  };
}

return {
  foldText, slugName, escapeRegExp, hashString, mulberry32, seededRng, pick, shuffledCopy, uniqueAis, replyItems, localized,
  mentionQueryAt, commandQueryAt, findMentions, sortMentionOptions,
  quickSlashCommand, parseVoteCommand, parseDebateCommand,
  activeAis, firstTurnRepliers, pickChaosRepliers, roundRepliers, planTurn,
  DELIBERATION_ROUNDS, deliberationSchedule, VERDICTS, VERDICT_LABELS, parseVerdictVote, tallyVerdict,
  MEMO_SECTIONS, MEMO_HEADING, parseMemoSections, memoToMarkdown,
  parseSSE,
  transcriptToMarkdown,
  TEMPLATE_FORMAT, TEMPLATE_VERSION, exportSquadTemplate, parseSquadTemplate, templateToGroup
};
});
