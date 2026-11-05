"use strict";
/* =========================================================
   AI Group Chat v2
   Your OpenRouter key is stored only in this browser's localStorage.
   Without a key the app runs on the deterministic Offline Simulation Engine (offline-engine.js).
   Pure logic lives in squad-core.js; data in personas.js and i18n.js. All are covered by test/.
========================================================= */
const {
  foldText, slugName, shuffledCopy, uniqueAis, replyItems, localized, activeAis, roundRepliers, planTurn,
  quickSlashCommand, parseVoteCommand, parseDebateCommand, mentionQueryAt, commandQueryAt, findMentions, sortMentionOptions,
  DELIBERATION_ROUNDS, deliberationSchedule, parseVerdictVote, tallyVerdict, parseMemoSections, memoToMarkdown, MEMO_SECTIONS, VERDICT_LABELS,
  parseSSE, transcriptToMarkdown, exportSquadTemplate, parseSquadTemplate, templateToGroup
} = SquadCore;
const PROVIDERS = {
  openrouter: { label:"OpenRouter (any model)", url:"https://openrouter.ai/api/v1/chat/completions", kind:"openai" },
};
const MODEL_OPTIONS = {
  openrouter: [
    { id:"z-ai/glm-5.2:free", label:"GLM 5.2", free:true },
    { id:"google/gemma-4-31b-it:free", label:"Gemma 4 31B", free:true },
    { id:"google/gemma-4-26b-a4b-it:free", label:"Gemma 4 26B", free:true },
    { id:"nvidia/nemotron-3-nano-30b-a3b:free", label:"Nemotron 3 Nano 30B", free:true },
    { id:"openrouter/free", label:"Free Models Router", free:true },
    { id:"meta-llama/llama-3.3-70b-instruct", label:"Llama 3.3 70B cheap fallback", free:false }
  ]
};
const CUSTOM_MODEL = "__custom__";
let openRouterFreeModelsLoaded = false;
let openRouterFreeModelsLoading = false;
let openRouterNextRequestAt = 0;
let openRouterCooldownUntil = 0;
let openRouterPaceChain = Promise.resolve();
const OPENROUTER_REQUEST_GAP_MS = 3000;
const OPENROUTER_TIMEOUT_MS = 18000;
const PALETTE = ["#53bdeb","#e77fd0","#ffbc38","#7ada8e","#fd7f6f","#b39ddb","#4dd0e1","#f6c1ff"];
const OPENROUTER_KEY = "aiGroupChat.openrouterKey.v1";
const OPENROUTER_ROUTE_MODE_KEY = "aiGroupChat.openrouterRouteMode.v1";
const DAILY_CONTEXT_KEY_PREFIX = "aiGroupChat.dailyContext.";
const LANG_KEY = "aiGroupChat.language.v1";
const USER_NAME_KEY = "aiGroupChat.userName.v1";
const ACHIEVEMENTS_KEY = "aiGroupChat.achievements.v1";
const AI_POP_SOUND = "data:audio/wav;base64,UklGRsQFAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAFAAAAAF8/Q1HNNoIUxgFz8m3U8LQduD7rQy0GTmo/VB1UBlD5TuJQwWG04tTIE7pD2kbGKY8NMP+A71bS47hVwn30dS7GRxw4dhljBbj5B+VXx5C6m9VvDUg7fkJWKnMPCgGT9H3cacKgwfbmLB30PtM6bSDsCXP+ePBX1+7BZsnx8v8kHj5ZNHEaJwcG/UnuqdW6wwLPyvgGJ7M7UDCuFyUGt/xg7vbWY8Zo0ez4vCTjONIulhd+BnT9lPDQ2qXJ89Aa9JgeezViL+gZLwgB/1f08OAwzhLPXOtSFDEw5zCHHpYLNAHJ+OPoIdUfzoTgowXrJk8x5yRiEVwEAv2P8RLf69DH1onzlRc/LRsr/hmoCcwAOvkH63LZm9Kv4f0BzyDVLAEkohKoBcL+IfbU5rPXldZi6mAKCyQuKr4ehQ7HA6n9e/Ra5VnYGdoT72gN3iOjJ+4b2QwvA3z9n/RP5jva/NuZ7xMMmSHlJWobHA2SAyn+ZfZY6RzdddyX7PEGRR2HJMIcMg/3BHb/Rvkh7nbh0txd51v+AxYmIhkfJBPDB0UBePwK9OHnDt8t4kjzyAqAHJEgihikDA0EWv/a+Rbw6eRE4G7o2fsxEdgdXh3JExwJXQJJ/jz4Ru6E5Hzir+wAACMTAB3cGlERqAfKAQD+DviV7q3lM+QF7h4A/RFcG6YZ5BC7BwICef5E+bTw+edD5cjs0PwwDuoYZBkuEjwJAQN+/2z7SvSj66DmMurX9oAHnRTvGKAUTgwbBe4A1P2z+O3wyulp6MLv8P3lDCcWyRbIEPgIOwMAAM38N/e47wnqouo+8x0BYA6VFecUxA6fB58Cw/+s/FD3VvA36+3r9PPLAC8NKhTwE30OygfjAhYAaf3S+HLyD+1e7Fnyjv2kCc4RfBOSD1gJEATpAKz+QfvZ9Q3wGu297yj4hANnDT4SMBE2DIkGcwIVANP9BPqj9MLvWu5a8in7swUCDlgRgQ+aCn4F+AHk/7v9F/oY9arwdO8j8zD75wTCDDUQ5Q6QCsEFQgI0AFv+V/vs9n/yYvBx8tD4mwHACYkO5A6/Cz0HYwP7AGD/Qv3O+YP1HfKn8Tr1NfxmBAoLIw5WDeIJwwWJApQAHv/9/KT5tfXR8rnyQ/bG/EMEUAovDY0MeQmwBaECugBl/5v9vvoo9yb0UfOp9ff6wwHzB7YLSQwxCtAGngNoAQ0Av/6v/K/5dvZY9J70yvdD/X4DoghRCy4L5wjEBfoCHAHt/7T+xPwB+hb3K/Vc9SH4/vyoAoUHUAqXCs4IBgZYA2wBOwA3/7j9dPvC+IL2wPUu98b6tf+tBFwI8gliCVIHvAR9AvgA/v8G/4n9Yfvy+An3iPb79077xv9BBKEHLQnRCBAHvgShAiIBLwBc/y/+afw8+kH4O/fI9xP6uf3iAYwF5QeKCKYHzAW2A/cByAAAADr/FP5p/HL6uvjl93X4h/rI/YEB2QQYB+IHSQe/Bd8DMwL/ADgAk/+1/mf9ufsD+s34mfiy+Qb8Kf9zAjAF2AY5B3kGAgVXA+QB3AAuAJz/2P61/Tv8svqG+Sf53/mw+1P+RQHuA84FnQZdBlEF4QN0AlEBigAAAHj/t/6h/Ur89fr++cD5cfoQ/GH++QBcAx4F/QXwBScF8AOmAosBvgA0AMP/N/9s/lv9JvwO+2H6Yfov+8D82f4fAS4DsARyBW4FyAS/A5wCmQHWAFAA6/9//+b+Ev4O/QX8MfvQ+g77+ft8/V//VwEUA1QE8wTtBGEEfwOCApoB5QBlAAkAsv8//57+zf3l/A38d/tQ+7P7o/wH/q//XwHYAukDdQR5BAsEUQN5AqoB/wCCACkA4f+N/xr/f/7C/fv8Tfzd+8z7LvwA/TD+mf8LAVcCVQPqAw8E0gNJA5gC4AE7AbkAWgAVANf/jf8=";
const DEFAULT_MODEL = "z-ai/glm-5.2:free";
const CHEAP_FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct";
const FREE_MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "thinkingmachines/inkling-small:free",
  "poolside/laguna-s-2.1:free",
  "openrouter/free"
];

function getOpenRouterKey(){ return localStorage.getItem(OPENROUTER_KEY) || ""; }
function setOpenRouterKey(key){
  localStorage.setItem(OPENROUTER_KEY, key.trim());
  state.groups.forEach(g=>g.ais.forEach(ai=>ai.key = key.trim()));
  saveState();
  renderAll();
  updateKeyUi();
  const g = activeGroup();
  if(g && g.needsWelcome) setTimeout(()=>startGroupWelcome(g), 400);
}
function cleanUserName(name){
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 40);
}
function getUserName(){ return localStorage.getItem(USER_NAME_KEY) || ""; }
function setUserName(name){
  const clean = cleanUserName(name);
  if(clean) localStorage.setItem(USER_NAME_KEY, clean);
  else localStorage.removeItem(USER_NAME_KEY);
}
function userDisplayName(){ return getUserName() || "User"; }

/* ---------------- persona library ---------------- */
/* persona library + squad presets live in personas.js; UI strings in i18n.js */

function uid(){ return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function pickWorkingModel(){
  const pool = FREE_MODEL_FALLBACKS.slice(0, 4);
  return pool[Math.floor(Math.random() * pool.length)] || DEFAULT_MODEL;
}
function recommendedFreeModel(index){
  const pool = FREE_MODEL_FALLBACKS.slice(0, 4);
  return pool[index % pool.length] || DEFAULT_MODEL;
}
function openRouterConfig(){
  return { provider:"openrouter", model:pickWorkingModel(), key:getOpenRouterKey() };
}
function personaByName(name){
  const all = [...PERSONAS, ...WAR_ROOM_PERSONAS];
  return all.find(p=>p.name === name) || all.find(p=>foldText(p.name) === foldText(name));
}

function chaosGroup(){
  const g = {
    id: uid(), name: "Chaos Chat", emoji: "🌪️", ctx: 30, mode: "chaos", messages: [],
    ais: PERSONAS.map((p, i)=>{
      const pc = openRouterConfig();
      return { id: uid(), name: p.name, emoji: p.emoji, provider: pc.provider,
               model: pc.model, key: pc.key, prompt: p.prompt };
    })
  };
  return g;
}

function templateGroup(template){
  const g = {
    id: uid(), name: template.name, emoji: template.emoji, ctx: template.mode === "deliberation" ? 40 : 24, mode: template.mode || "chaos",
    messages: [], ambient: false,
    templateId: template.id,
    ais: template.members.map(name=>{
      const p = personaByName(name);
      return p
        ? { id:uid(), name:p.name, emoji:p.emoji, ...openRouterConfig(), prompt:p.prompt, ...(p.role ? { role:p.role } : {}) }
        : { id:uid(), name, emoji:"🤖", ...openRouterConfig(), prompt:"You are a vivid group chat character. Keep a distinct personality and reply briefly." };
    })
  };
  g.messages.push({
    id:uid(), sender:"system", ts:Date.now(),
    text:`${template.emoji} ${template.name}: ${localized(template.mood, lang())}.`
  });
  if(g.mode === "deliberation") g.messages.push({ id:uid(), sender:"system", ts:Date.now(), text:t("warRoomIntro") });
  return g;
}

function starterGroups(){
  const groups = SQUAD_TEMPLATES.map(templateGroup);
  return { activeGroupId: groups[0].id, groups, starterSquadsVersion: 5 };
}

function defaultGroup(){
  return {
    id: uid(), name: "AI Squad", emoji: "🤖", ctx: 24, mode: "normal", messages: [],
    ais: [
      { id:uid(), name:"Glim", emoji:"🐉", ...openRouterConfig(),
        model:recommendedFreeModel(0),
        prompt:"You are Glim, the pragmatic one of the group. Direct, a bit dry, allergic to fluff. You give concrete takes and gently roast overcomplicated ideas." },
      { id:uid(), name:"Gema", emoji:"✨", ...openRouterConfig(),
        model:recommendedFreeModel(1),
        prompt:"You are Gema, the curious optimist. You build on other people's ideas, ask good questions, and bring creative angles nobody thought of." },
      { id:uid(), name:"Rok", emoji:"⚡", ...openRouterConfig(),
        model:recommendedFreeModel(2),
        prompt:"You are Rok, the fast-talking wildcard. Witty, informal, sometimes contrarian on purpose to stress-test ideas. Keep it punchy." }
    ]
  };
}

/* ---------------- persistence + v1 migration ---------------- */
const LS_KEY = "aiGroupChat.state.v2";
let state = loadState();
normalizeState();
ensureStarterSquads();
const busyGroups = new Set();
const statusLoadingGroups = new Set();
let editingIndex = -1;
let replaying = null;   // { groupId, count } while a transcript replays; renderMessages shows only `count` messages
let pendingReply = null;
let mentionState = { open:false, mode:"mention", start:-1, query:"", options:[], active:0 };

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(s.groups && s.groups.length) return s;
    }
  }catch(e){}
  // migrate from v1 if present
  try{
    const oldCfg = JSON.parse(localStorage.getItem("aiGroupChat.config.v1") || "null");
    const oldMsgs = JSON.parse(localStorage.getItem("aiGroupChat.messages.v1") || "[]");
    if(oldCfg){
      const g = defaultGroup();
      g.name = oldCfg.groupName || g.name;
      g.ctx = oldCfg.ctx || g.ctx;
      if(Array.isArray(oldCfg.ais)){
        g.ais = oldCfg.ais.map(a=>({
          id: a.id || uid(), name:a.name, emoji:a.emoji, provider:a.provider,
          model: DEFAULT_MODEL,
          key:a.key, prompt:a.prompt
        }));
      }
      g.messages = oldMsgs;
      return { activeGroupId: g.id, groups:[g] };
    }
  }catch(e){}
  return starterGroups();
}
function ensureStarterSquads(){
  const version = state.starterSquadsVersion || 0;
  if(version < 2){
    const existing = new Set((state.groups || []).map(g=>g.templateId || slugName(g.name)));
    const fresh = SQUAD_TEMPLATES
      .filter(t=>!existing.has(t.id) && !existing.has(slugName(t.name)))
      .map(templateGroup);
    if(fresh.length){
      state.groups = [...fresh, ...(state.groups || [])];
      state.activeGroupId = fresh[0].id;
    }
  }
  if(version < 4) applyArea51SquadUpdate();
  if(version >= 2 && version < 5 && !state.groups.some(g=>g.templateId === "war-room")){
    const warRoom = SQUAD_TEMPLATES.find(t=>t.id === "war-room");
    if(warRoom) state.groups.unshift(templateGroup(warRoom));
  }
  state.starterSquadsVersion = 5;
  saveState();
}
function applyArea51SquadUpdate(){
  const template = SQUAD_TEMPLATES.find(t=>t.id === "muelle-3");
  if(!template) return;
  for(const g of state.groups || []){
    const isTarget = g.templateId === "muelle-3" || slugName(g.name) === "muelle-3-y-medio" || slugName(g.name) === "area-51";
    if(!isTarget) continue;
    g.templateId = template.id;
    g.name = template.name;
    g.emoji = template.emoji;
    g.mode = template.mode;
    const hasAldric = g.ais.some(ai=>foldText(ai.name) === "sir aldric");
    if(!hasAldric){
      const p = personaByName("Sir Aldric");
      if(p) g.ais.splice(Math.min(3, g.ais.length), 0, {
        id:uid(), name:p.name, emoji:p.emoji, ...openRouterConfig(), prompt:p.prompt
      });
    }
    delete g.dailyStatuses;
  }
  const idx = (state.groups || []).findIndex(g=>
    g.templateId === "muelle-3" || slugName(g.name) === "area-51" || slugName(g.name) === "muelle-3-y-medio"
  );
  if(idx >= 0 && idx !== 2){
    const [area51] = state.groups.splice(idx, 1);
    state.groups.splice(Math.min(2, state.groups.length), 0, area51);
  }
}
function normalizeState(){
  const key = getOpenRouterKey();
  state.groups.forEach(g=>{
    if(!["normal","chaos","deliberation"].includes(g.mode)) g.mode = "normal";
    // A reload mid-stream leaves a half-written bubble: keep the text, drop the flag (or the bubble if empty).
    g.messages = (g.messages || []).filter(m=>!(m.streaming && !m.text));
    g.messages.forEach(m=>{ delete m.streaming; });
    if(!g.mentionUsage) g.mentionUsage = {};
    if(typeof g.ambient !== "boolean") g.ambient = false;
    if(!g.lastAmbientAt) g.lastAmbientAt = Date.now();
    g.ais.forEach(ai=>{
      ai.provider = "openrouter";
      if([
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-chat-v3-0324:free",
        "qwen/qwen3-coder:free",
        "z-ai/glm-4.5-air:free",
        "mistralai/mistral-small-3.2-24b-instruct:free",
        "moonshotai/kimi-k2:free",
        "google/gemma-3-27b-it:free",
        "meta-llama/llama-3.2-3b-instruct:free"
      ].includes(ai.model)){
        ai.model = DEFAULT_MODEL;
      }
      if(!providerModels("openrouter").some(m=>m.id === ai.model) && !String(ai.model || "").includes("/")){
        ai.model = DEFAULT_MODEL;
      }
      if(!ai.model) ai.model = DEFAULT_MODEL;
      ai.key = key;
    });
  });
}
function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function activeGroup(){
  return state.groups.find(g=>g.id===state.activeGroupId) || state.groups[0];
}
function aiById(group, id){ return group.ais.find(a=>a.id===id); }
function personaId(p){ return "persona:" + slugName(p.name); }
function personaById(id){
  if(!id || !id.startsWith("persona:")) return null;
  return PERSONAS.find(p=>personaId(p) === id) || null;
}
function personaOverride(group, personaId){
  return (group && group.personaOverrides && group.personaOverrides[personaId]) || null;
}
function personaResponder(p, override){
  const merged = {...p, ...(override || {})};
  return {
    id: personaId(p),
    name: merged.name,
    emoji: merged.emoji,
    provider: "openrouter",
    model: DEFAULT_MODEL,
    key: getOpenRouterKey(),
    prompt: merged.prompt,
    temporary: true
  };
}
function aiForSender(group, id){
  const p = personaById(id);
  return aiById(group, id) || (p ? personaResponder(p, personaOverride(group, id)) : null);
}
function aiColor(group, id){
  const i = group.ais.findIndex(a=>a.id===id);
  if(i >= 0) return PALETTE[i % PALETTE.length];
  const p = personaById(id);
  if(p) return PALETTE[PERSONAS.findIndex(x=>x.name===p.name) % PALETTE.length];
  return PALETTE[0];
}
function replyLabel(group, reply){
  if(!reply) return "";
  const ai = aiForSender(group, reply.sender);
  return ai ? `${ai.emoji} ${ai.name}` : (reply.senderName || "Someone");
}
function reactionEmojiPool(text){
  const f = foldText(text);
  if(/jaja|haha|lol|xd|😂|🤣|risa|meme/.test(f)) return ["😂","🤣","💀","😅"];
  if(/[?¿]|ayuda|idea|como|que hago|no se/.test(f)) return ["🤔","👀","🧐","💡"];
  if(/bien|vamos|genial|god|epico|logre|salio|gracias/.test(f)) return ["🔥","👏","🙌","✨"];
  if(/mal|triste|bajon|cansad|estres|ansiedad|no puedo/.test(f)) return ["🫂","💚","😬","🥲"];
  if(/amor|lindo|banco|te quiero|me gusta/.test(f)) return ["💚","🥹","✨","🫶"];
  if(/urgente|se pico|odio|bronca|wtf|que carajo/.test(f)) return ["😳","👀","🍿","💀"];
  return ["👀","😂","💚","🤔","🔥","✨","😅","🍿"];
}
function personaReactionTwist(ai, pool){
  const vibe = foldText((ai.name || "") + " " + (ai.prompt || ""));
  if(/datos|byte|futuro|sam/.test(vibe)) return [...pool, "🤓"];
  if(/tia|marta|paz|coach/.test(vibe)) return [...pool, "💚"];
  if(/sarcas|vicky|drama|chisme/.test(vibe)) return [...pool, "🍿"];
  if(/pepe|capitan|mar|pesca/.test(vibe)) return [...pool, "🎣"];
  return pool;
}
function reactionChance(group, text, fromUser){
  let chance = fromUser
    ? (group.mode === "chaos" ? 0.38 : 0.24)
    : (group.mode === "chaos" ? 0.18 : 0.08);
  const f = foldText(text);
  if(/jaja|haha|lol|xd|😂|🤣|meme/.test(f)) chance += 0.24;
  if(/[?¿]|ayuda|idea|no se|que hago/.test(f)) chance += 0.13;
  if(/urgente|se pico|wtf|gracias|vamos|logre|mal|triste|perdon|basta/.test(f)) chance += 0.12;
  if(!fromUser && /te fuiste|al pasto|cualquiera|obvio|literal|no puedo|me muero|increible/.test(f)) chance += 0.16;
  if(String(text || "").length < 5) chance -= 0.12;
  return Math.max(fromUser ? 0.08 : 0.02, Math.min(fromUser ? 0.72 : 0.46, chance));
}
function maybeAddAiReactions(group, msg, options){
  if(!group || !msg || msg.sender === "system" || msg.reactions?.length) return;
  const fromUser = msg.sender === "user";
  const available = activeAis(group).filter(ai=>ai.id !== msg.sender);
  if(!available.length || Math.random() > reactionChance(group, msg.text, fromUser)) return;
  const max = group.mode === "chaos" && available.length > 2 && Math.random() < 0.32 ? 2 : 1;
  const picked = shuffledCopy(available).slice(0, max);
  msg.reactions = picked.map(ai=>{
    const pool = personaReactionTwist(ai, reactionEmojiPool(msg.text));
    return {
      id:uid(),
      sender:ai.id,
      emoji:pool[Math.floor(Math.random() * pool.length)],
      ts:Date.now()
    };
  });
  saveState();
  if(options && options.silent) return;
  if(group.id === state.activeGroupId) renderMessages(); else renderSidebar();
}
function todayKey(){
  return new Date().toISOString().slice(0, 10);
}
function localDayLabel(){
  return new Date().toLocaleDateString(lang() === "es" ? "es" : "en", {
    weekday:"long", day:"numeric", month:"long"
  });
}
function statusFor(group, ai){
  const pack = group.dailyStatuses;
  if(pack && pack.date === todayKey() && pack.items && pack.items[ai.id]){
    return pack.items[ai.id];
  }
  const seeds = lang() === "es"
    ? [
      "Hoy no prometo calma, prometo presencia.",
      "Dia raro, energia de responder despues.",
      "Actualidad: todos intensos. Yo tambien.",
      "Si el dia trae plot twist, que venga con mate.",
      "Estado: observando el mundo con una ceja levantada."
    ]
    : [
      "Today feels like a plot twist with notifications.",
      "Status: quietly watching the day become content.",
      "Current mood: informed, confused, still here.",
      "If today gets weird, I am taking notes.",
      "Soft launch of having an opinion about today."
    ];
  const n = Math.abs((ai.name || ai.id || "").split("").reduce((a,c)=>a+c.charCodeAt(0), 0) + new Date().getDate());
  return seeds[n % seeds.length];
}
function normalizeStatusText(text){
  return String(text || "").replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "").slice(0, 110);
}
async function fetchDailyContext(force){
  const key = DAILY_CONTEXT_KEY_PREFIX + todayKey();
  if(!force){
    const cached = sessionStorage.getItem(key);
    if(cached) return cached;
  }
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const bits = [`Fecha local: ${localDayLabel()} (${todayKey()}).`];
  try{
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`);
    if(res.ok){
      const data = await res.json();
      const news = Array.isArray(data.news) ? data.news.slice(0, 5) : [];
      for(const item of news){
        const title = item.links && item.links[0] && item.links[0].title ? item.links[0].title.replace(/_/g, " ") : "";
        const story = item.story || item.extract || "";
        if(title || story) bits.push(`Noticia/evento: ${title}${story ? " - " + story : ""}`.slice(0, 260));
      }
      const events = Array.isArray(data.onthisday) ? data.onthisday.slice(0, 4) : [];
      for(const item of events){
        if(item.text) bits.push(`Efemeride: ${item.text}`.slice(0, 220));
      }
    }
  }catch(e){}
  const context = bits.join("\n");
  sessionStorage.setItem(key, context);
  return context;
}
function parseStatusJson(text){
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if(start < 0 || end < start) return null;
  try{ return JSON.parse(candidate.slice(start, end + 1)); }
  catch(e){ return null; }
}
async function generateDailyStatuses(group, force){
  if(!group || !group.ais.length) return;
  if(statusLoadingGroups.has(group.id)) return;
  if(!force && group.dailyStatuses && group.dailyStatuses.date === todayKey() && group.dailyStatuses.source !== "loading") return;
  if(!getOpenRouterKey()){
    group.dailyStatuses = {
      date: todayKey(),
      source: "local",
      items: Object.fromEntries(group.ais.map(ai=>[ai.id, statusFor(group, ai)]))
    };
    saveState();
    renderStatusesUi();
    return;
  }
  statusLoadingGroups.add(group.id);
  group.dailyStatuses = {
    date: todayKey(),
    source: "loading",
    items: Object.fromEntries(group.ais.map(ai=>[ai.id, lang() === "es" ? "pensando estado del dia..." : "thinking today's status..."]))
  };
  saveState();
  renderStatusesUi();
  try{
    const context = await fetchDailyContext(force);
    const people = group.ais.map(ai=>({
      id: ai.id,
      name: ai.name,
      emoji: ai.emoji,
      personality: ai.prompt
    }));
    const system = lang() === "es"
      ? "Generas estados estilo WhatsApp/Instagram para personajes de un chat grupal. Devuelve solo JSON valido."
      : "You generate WhatsApp/Instagram-style status lines for group chat characters. Return valid JSON only.";
    const user = lang() === "es"
      ? `Contexto actualizado del dia:\n${context}\n\nPersonajes:\n${JSON.stringify(people)}\n\nGenera un estado por personaje. Debe sonar como algo que esa persona pondria hoy, corto, natural, con su personalidad. Maximo 90 caracteres cada uno. No inventes noticias especificas si el contexto no las trae. Devuelve exactamente: {"items":{"id":"estado"}}`
      : `Fresh day context:\n${context}\n\nCharacters:\n${JSON.stringify(people)}\n\nGenerate one status per character. It should sound like something that person would post today, short, natural, in character. Maximum 90 characters each. Do not invent specific news if context does not include it. Return exactly: {"items":{"id":"status"}}`;
    const text = await callOpenAICompat(
      { id:group.id, temperature:0.9 },
      { id:"daily-status", provider:"openrouter", key:getOpenRouterKey() },
      PROVIDERS.openrouter,
      system,
      [{ role:"user", content:user }],
      DEFAULT_MODEL
    );
    const parsed = parseStatusJson(text);
    const items = {};
    for(const ai of group.ais){
      items[ai.id] = normalizeStatusText(parsed && parsed.items && parsed.items[ai.id]) || statusFor(group, ai);
    }
    group.dailyStatuses = { date: todayKey(), source:"ai", items };
  }catch(e){
    group.dailyStatuses = {
      date: todayKey(),
      source:"local",
      items: Object.fromEntries(group.ais.map(ai=>[ai.id, statusFor(group, ai)]))
    };
  }finally{
    statusLoadingGroups.delete(group.id);
  }
  saveState();
  renderStatusesUi();
}
function refreshDailyStatuses(force){
  const g = activeGroup();
  return generateDailyStatuses(g, !!force);
}
function mutedAis(group){
  return group.ais.filter(a=>a.muted);
}
function groupLengthBias(group){
  return Math.max(-5, Math.min(5, parseInt(group.lenBias, 10) || 0));
}
function groupTemperature(group){
  const n = Number(group.temperature);
  return Number.isFinite(n) ? Math.max(0.2, Math.min(1.6, n)) : 1.0;
}
function responseTuningPrompt(group){
  const bias = groupLengthBias(group);
  if(bias <= -5) return "Length control: reply as briefly as possible, usually just a few words.";
  if(bias <= -3) return "Length control: keep replies very short, usually one compact sentence.";
  if(bias < 0) return "Length control: keep replies shorter than usual.";
  if(bias === 0) return "Length control: use your normal chat length.";
  if(bias <= 2) return "Length control: you may be a little more detailed than usual.";
  if(bias <= 4) return "Length control: give a fuller answer when useful, while still sounding like chat.";
  return "Length control: give a longer, more complete answer when useful, but do not ramble.";
}
function mentionCatalog(group){
  const seen = new Set();
  const out = [];
  for(const ai of group.ais){
    const key = foldText(ai.name);
    seen.add(key);
    out.push({ name:ai.name, emoji:ai.emoji, source:"group", ai });
  }
  for(const p of PERSONAS){
    const id = personaId(p);
    const ai = personaResponder(p, personaOverride(group, id));
    const key = foldText(ai.name);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({ name:ai.name, emoji:ai.emoji, source:"library", ai });
  }
  return out;
}
function mentionUseCount(group, aiId){
  return (group.mentionUsage && group.mentionUsage[aiId]) || 0;
}
function sortedMentionOptions(group, q, additive){
  return sortMentionOptions(mentionCatalog(group), { query:q, additive, usage:group.mentionUsage || {} });
}
function recordMentionUsage(group, ais){
  if(!group.mentionUsage) group.mentionUsage = {};
  for(const ai of uniqueAis(ais)){
    group.mentionUsage[ai.id] = (group.mentionUsage[ai.id] || 0) + 1;
  }
  saveState();
}
function mentionedAisFromText(group, text, additive){
  return findMentions(mentionCatalog(group), text, additive);
}

/* ---------------- rendering ---------------- */
const $msgs = document.getElementById("messages");
const $groupList = document.getElementById("groupList");

function fmtTime(ts){
  return new Date(ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}
function esc(s){
  return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function lang(){ return localStorage.getItem(LANG_KEY) || "es"; }
function t(key){ return (I18N[lang()] && I18N[lang()][key]) || I18N.en[key] || key; }
let toastTimer = null;
function showToast(message){
  const toast = document.getElementById("toast");
  if(!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove("show"), 2600);
}
function unlockedAchievements(){
  try{ return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || "{}") || {}; }
  catch(e){ return {}; }
}
function unlockAchievement(id, message, delay){
  const unlocked = unlockedAchievements();
  if(unlocked[id]) return false;
  unlocked[id] = Date.now();
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
  setTimeout(()=>showToast(message), delay || 0);
  return true;
}
function checkAchievements(text){
  const folded = foldText(text);
  let delay = 0;
  const fire = (id, es, en)=>{
    if(unlockAchievement(id, lang() === "es" ? es : en, delay)) delay += 2800;
  };
  if(folded.includes("pizza con pina") || folded.includes("pizza con anana")){
    fire("pizza_pina", "🏆 Logro desbloqueado: Crimen culinario", "🏆 Achievement unlocked: Culinary crime");
  }
  if(folded.includes("/help")){
    fire("help", "🏅 Logro desbloqueado: Aprendiz del Sistema", "🏅 Achievement unlocked: System apprentice");
  }
  if(groupLengthBias(activeGroup()) === 5 && folded.includes("tesis")){
    fire("tesis", "🎓 Logro desbloqueado: El intelectual del grupo", "🎓 Achievement unlocked: Group intellectual");
  }
  if(folded.includes("/votar")){
    fire("votar", "🗳️ Logro desbloqueado: Democracia instantanea", "🗳️ Achievement unlocked: Instant democracy");
  }
  if(folded.includes("ovni") || folded.includes("area 51")){
    fire("area51", "🛸 Logro desbloqueado: Expediente clasificado", "🛸 Achievement unlocked: Classified file");
  }
}
function setLanguage(next){
  localStorage.setItem(LANG_KEY, next === "es" ? "es" : "en");
  document.documentElement.lang = lang();
  applyI18n();
  saveState();
  renderAll();
  renderTemplateChoices();
  if(document.getElementById("settingsOverlay")?.classList.contains("open")){
    const settingsTitle = document.getElementById("settingsTitle");
    const settingsSaveBtn = document.getElementById("settingsSaveBtn");
    if(settingsTitle) settingsTitle.textContent = settingsNewGroupId ? t("buildSquadTitle") : t("settingsTitle");
    if(settingsSaveBtn) settingsSaveBtn.textContent = settingsNewGroupId ? t("createSquad") : t("save");
    renderMemberCards();
    updateFileStatus();
  }
}
function toggleLanguage(){ setLanguage(lang() === "es" ? "en" : "es"); }
function applyI18n(){
  document.title = t("appTitle");
  document.querySelectorAll("[data-i18n]").forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-title]").forEach(el=>{ el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{ el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el=>{ el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
  document.getElementById("langBtn").textContent = lang() === "es" ? "EN" : "ES";
  document.getElementById("setupLanguage").value = lang();
  ["setupTitle","setupText","openRouterLink","setupKeyLabel","setupNameLabel","setupLanguageLabel"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.textContent = t(id);
  });
  const nameInput = document.getElementById("setupNameInput");
  if(nameInput) nameInput.placeholder = t("setupNamePlaceholder");
  const surpriseBtn = document.getElementById("surpriseBtn");
  if(surpriseBtn){
    surpriseBtn.title = t("surprisePrompt");
    surpriseBtn.setAttribute("aria-label", t("surprisePrompt"));
  }
  const dramaBtn = document.getElementById("dramaBtn");
  if(dramaBtn){
    dramaBtn.title = t("dramaButton");
    dramaBtn.setAttribute("aria-label", t("dramaButton"));
  }
  updateSetupUi();
  updateKeyUi();
}
function updateKeyUi(){
  const hasKey = !!getOpenRouterKey();
  const keyBtn = document.getElementById("keyBtn");
  if(keyBtn) keyBtn.textContent = hasKey ? t("keyButtonReady") : t("keyButtonMissing");
  const stateEl = document.getElementById("settingsKeyState");
  const hintEl = document.getElementById("settingsKeyHint");
  if(stateEl) stateEl.textContent = hasKey ? t("keyReady") : t("keyMissing");
  if(hintEl) hintEl.textContent = hasKey ? t("keyReadyHint") : t("keyMissingHint");
  const badge = document.getElementById("engineBadge");
  if(badge){
    badge.textContent = hasKey ? t("liveBadge") : t("offlineBadge");
    badge.title = hasKey ? t("liveBadgeHint") : t("offlineBadgeHint");
    badge.classList.toggle("live", hasKey);
  }
}

function renderSidebar(){
  $groupList.innerHTML = "";
  for(const g of state.groups){
    const last = g.messages.filter(m=>m.sender!=="system").slice(-1)[0];
    const item = document.createElement("div");
    item.className = "chat-item" + (g.id===state.activeGroupId ? " active" : "");
    item.onclick = ()=>switchGroup(g.id);
    const preview = last
      ? (last.sender==="user" ? t("you") + ": " : ((aiForSender(g,last.sender)?.name || last.senderName || "") + ": ")) + last.text.slice(0,60)
      : t("noMessagesYet");
    item.innerHTML = `
      <div class="group-avatar">${esc(g.emoji||"🤖")}</div>
      <div class="meta">
        <div class="row1"><span class="name">${esc(g.name)}</span><span class="time">${last?fmtTime(last.ts):""}</span></div>
        <div class="preview">${esc(preview)}</div>
      </div>
      <div class="item-actions">
        <button class="mini-btn" title="${esc(t("cloneGroup"))}" onclick="event.stopPropagation();cloneGroup('${g.id}')">⧉</button>
        <button class="mini-btn" title="${esc(t("deleteGroup"))}" onclick="event.stopPropagation();deleteGroup('${g.id}')">🗑</button>
      </div>`;
    $groupList.appendChild(item);
  }
}

function renderHeader(){
  const g = activeGroup();
  const muted = mutedAis(g);
  const members = g.ais.map(a=>a.name + (a.muted ? ` (${t("muted")})` : "")).join(", ");
  document.getElementById("headGroupName").textContent = g.name;
  document.getElementById("headAvatar").textContent = g.emoji || "🤖";
  document.getElementById("headMembers").textContent =
    t("you") + (members ? ", " + members : "") + (muted.length ? ` · ${muted.length} ${t("muted")}` : "");
  updateKeyUi();
}

function statusOverlayOpen(){
  return document.getElementById("statusOverlay")?.classList.contains("open");
}
function renderStatusesUi(){
  const g = activeGroup();
  const loading = statusLoadingGroups.has(g.id);
  const btn = document.getElementById("statusBtn");
  if(btn){
    btn.textContent = loading ? "…" : "◉";
    btn.disabled = loading;
    btn.title = loading ? (lang() === "es" ? "Cargando estados" : "Loading statuses") : t("statusesHint");
  }
  const list = document.getElementById("statusList");
  const refresh = document.getElementById("statusRefreshBtn");
  const note = document.getElementById("statusLoading");
  if(refresh){
    refresh.disabled = loading;
    refresh.textContent = loading ? (lang() === "es" ? "Actualizando..." : "Updating...") : t("refreshStatuses");
  }
  if(note) note.textContent = loading
    ? (lang() === "es" ? "Buscando contexto del dia y escribiendo estados..." : "Fetching today's context and writing statuses...")
    : "";
  if(!list) return;
  list.innerHTML = g.ais.map(ai=>`
    <button class="status-card" type="button" title="${esc(ai.name)}: ${esc(statusFor(g, ai))}" onclick="openQuickEdit('${ai.id}')">
      <span class="avatar">${esc(ai.emoji || "🤖")}</span>
      <span class="status-meta">
        <span class="status-name">${esc(ai.name)}</span>
        <span class="status-text">${esc(statusFor(g, ai))}</span>
      </span>
    </button>
  `).join("");
}
function openStatusViewer(){
  const overlay = document.getElementById("statusOverlay");
  if(!overlay) return;
  overlay.classList.add("open");
  renderStatusesUi();
  const g = activeGroup();
  if(!(g.dailyStatuses && g.dailyStatuses.date === todayKey() && g.dailyStatuses.source !== "loading")){
    refreshDailyStatuses(false);
  }
}
function closeStatusViewer(){
  document.getElementById("statusOverlay").classList.remove("open");
}

function renderReplyBar(){
  const bar = document.getElementById("replyBar");
  const target = document.getElementById("replyTarget");
  const preview = document.getElementById("replyPreview");
  if(!bar || !target || !preview) return;
  const g = activeGroup();
  const items = pendingReply && pendingReply.groupId === g.id
    ? pendingReply.items.filter(item=>aiForSender(g, item.sender))
    : [];
  if(!items.length){
    pendingReply = null;
    bar.classList.remove("open");
    target.textContent = "";
    preview.textContent = "";
    return;
  }
  pendingReply.items = items;
  bar.classList.add("open");
  target.textContent = t("replyingTo") + " " + items.map(item=>replyLabel(g, item)).join(", ");
  preview.textContent = items.length === 1 ? items[0].text : `${items.length} ${t("messagesSelected")}`;
}

// Decision memo card: built with textContent only, so model output can never inject markup.
function memoCard(memo){
  const L = lang() === "es" ? "es" : "en";
  const card = document.createElement("article");
  card.className = "memo-card verdict-" + memo.verdict.toLowerCase();
  const head = document.createElement("header");
  const title = document.createElement("div");
  title.className = "memo-title";
  title.textContent = `🧭 ${t("memoTitle")}`;
  const verdict = document.createElement("span");
  verdict.className = "memo-verdict";
  verdict.textContent = VERDICT_LABELS[L][memo.verdict] || memo.verdict;
  const tally = document.createElement("div");
  tally.className = "memo-tally";
  const c = memo.counts || {};
  tally.textContent = `GO ${c.GO || 0} · REVISE ${c.REVISE || 0} · NO-GO ${c["NO-GO"] || 0} · ${memo.source === "live" ? t("memoLive") : t("memoOffline")}`;
  head.append(title, verdict);
  card.append(head);
  if(memo.idea){
    const idea = document.createElement("div");
    idea.className = "memo-idea";
    idea.textContent = memo.idea;
    card.append(idea);
  }
  card.append(tally);
  memo.sections.forEach((sec, i)=>{
    const h = document.createElement("h4");
    h.textContent = `${i + 1}. ${sec.title}`;
    const ul = document.createElement("ul");
    for(const item of sec.items){
      const li = document.createElement("li");
      li.textContent = item;
      ul.append(li);
    }
    card.append(h, ul);
  });
  const copy = document.createElement("button");
  copy.className = "btn ghost small memo-copy";
  copy.type = "button";
  copy.textContent = t("copyMemo");
  copy.onclick = ()=>{
    navigator.clipboard?.writeText(memoToMarkdown(memo, L)).then(()=>showToast(t("copied")), ()=>{});
  };
  card.append(copy);
  return card;
}
function renderMessages(){
  const g = activeGroup();
  $msgs.innerHTML = "";
  const chip = document.createElement("div");
  chip.className = "day-chip";
  chip.textContent = t("today");
  $msgs.appendChild(chip);

  let prevSender = null;
  let shown = 0;
  const replayLimit = replaying && replaying.groupId === g.id ? replaying.count : Infinity;
  g.messages.forEach((m, idx)=>{
    if(m.hidden) return;
    if(shown++ >= replayLimit) return;
    if(m.sender === "system"){
      const s = m.kind === "memo" && m.memo ? memoCard(m.memo) : document.createElement("div");
      if(m.kind !== "memo" || !m.memo){
        s.className = m.kind === "round" ? "sys-chip round-chip" : "sys-chip";
        s.textContent = m.text;
      }
      $msgs.appendChild(s);
      prevSender = "system";
      return;
    }
    const isUser = m.sender === "user";
    const row = document.createElement("div");
    row.className = "msg " + (isUser ? "out" : "in") + (m.sender !== prevSender ? " first-of-group" : "") + (m.streaming ? " streaming" : "");
    row.dataset.mid = m.id;

    if(editingIndex === idx){
      const box = document.createElement("div");
      box.className = "edit-box";
      const ta = document.createElement("textarea");
      ta.value = m.text;
      ta.id = "editArea";
      const actions = document.createElement("div");
      actions.className = "edit-actions";
      actions.innerHTML = `
        <button class="btn ghost small" onclick="cancelEdit()">${esc(t("cancelEdit"))}</button>
        <button class="btn primary small" onclick="saveEdit(${idx})">${esc(t("saveResend"))} ➤</button>`;
      box.appendChild(ta); box.appendChild(actions);
      row.appendChild(box);
      $msgs.appendChild(row);
      prevSender = m.sender;
      return;
    }

    const b = document.createElement("div");
    b.className = "bubble";
    if(!isUser && m.sender !== prevSender){
      const ai = aiForSender(g, m.sender);
      const nm = document.createElement("div");
      nm.className = "sender";
      nm.style.color = aiColor(g, m.sender);
      nm.textContent = ai ? `${ai.emoji} ${ai.name}` : (m.senderName || "?");
      if(ai && ai.muted){
        const mt = document.createElement("span");
        mt.className = "muted-tag";
        mt.textContent = t("muted");
        nm.appendChild(mt);
      }
      if(ai){
        nm.title = `${t("tweakPersonality")}: ${ai.name}`;
        nm.onclick = (e)=>{ e.stopPropagation(); openQuickEdit(ai.id); };
      }
      b.appendChild(nm);
    }
    const replies = replyItems(m.replyTo);
    for(const r of replies){
      const q = document.createElement("div");
      q.className = "reply-quote";
      const qn = document.createElement("span");
      qn.className = "reply-name";
      qn.textContent = replyLabel(g, r);
      const qt = document.createElement("span");
      qt.className = "reply-text";
      qt.textContent = r.text;
      q.appendChild(qn);
      q.appendChild(qt);
      b.appendChild(q);
    }
    const body = document.createElement("span");
    body.className = "msg-text";
    body.textContent = m.text;
    b.appendChild(body);
    const st = document.createElement("span");
    st.className = "stamp";
    st.textContent = fmtTime(m.ts) + (isUser ? " ✓✓" : "");
    b.appendChild(st);
    if(Array.isArray(m.reactions) && m.reactions.length){
      const reactions = document.createElement("div");
      reactions.className = "reactions";
      for(const r of m.reactions){
        const ai = aiForSender(g, r.sender);
        const chip = document.createElement("span");
        chip.className = "reaction-chip";
        const whoReacted = ai ? `${ai.emoji} ${ai.name}` : (lang() === "es" ? "Alguien" : "Someone");
        const label = lang() === "es" ? `${whoReacted} reacciono con ${r.emoji || "👍"}` : `${whoReacted} reacted with ${r.emoji || "👍"}`;
        chip.title = label;
        chip.onclick = ()=>alert(label);
        chip.innerHTML = `<span>${esc(r.emoji || "👍")}</span><span class="reactor">${esc(ai ? ai.emoji : "")}</span>`;
        reactions.appendChild(chip);
      }
      b.appendChild(reactions);
    }

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    if(isUser){
      actions.innerHTML = `
        <button class="mini-btn" title="${esc(t("editResend"))}" onclick="startEdit(${idx})">✏️</button>
        <button class="mini-btn" title="${esc(t("deleteMessage"))}" onclick="deleteMsg(${idx})">🗑</button>`;
    }else{
      const ai = aiForSender(g, m.sender);
      const groupAi = aiById(g, m.sender);
      const muteIcon = ai && ai.muted ? "🔊" : "🔇";
      const muteTitle = groupAi
        ? (ai.muted ? t("unmuteMember") : t("muteMember"))
        : t("tempPersonaMute");
      actions.innerHTML = `
        <button class="mini-btn" title="${esc(t("replyOnly"))}" onclick="replyTo(${idx})">↩</button>
        <button class="mini-btn" title="${esc(muteTitle)}" onclick="toggleMuteFromMsg(${idx})">${muteIcon}</button>
        <button class="mini-btn" title="${esc(lang() === "es" ? "Regenerar desde acá" : "Regenerate from here")}" onclick="regenFrom(${idx})">🔁</button>
        <button class="mini-btn" title="${esc(t("deleteMessage"))}" onclick="deleteMsg(${idx})">🗑</button>`;
    }

    if(isUser){ row.appendChild(actions); row.appendChild(b); }
    else{ row.appendChild(b); row.appendChild(actions); }
    $msgs.appendChild(row);
    prevSender = m.sender;
  });
  $msgs.scrollTop = $msgs.scrollHeight;
  renderReplyBar();
}

function renderAll(){ renderSidebar(); renderHeader(); renderStatusesUi(); renderMessages(); renderReplyBar(); updateComposerBusy(); }
function isGroupBusy(group){
  return !!group && busyGroups.has(group.id);
}
function updateComposerBusy(){
  const btn = document.getElementById("sendBtn");
  if(btn) btn.disabled = isGroupBusy(activeGroup());
}

function showTyping(ai, status){
  removeTyping();
  const row = document.createElement("div");
  row.className = "typing-row";
  row.id = "typing";
  const text = status || (lang() === "es" ? "está escribiendo" : "is typing");
  row.innerHTML = `<div class="typing-bubble">${esc(ai.emoji)} ${esc(ai.name)} ${esc(text)}
    <span class="dots"><span></span><span></span><span></span></span></div>`;
  $msgs.appendChild(row);
  $msgs.scrollTop = $msgs.scrollHeight;
}
function showMultiTyping(ais){
  removeTyping();
  const row = document.createElement("div");
  row.className = "typing-row";
  row.id = "typing";
  const names = ais.slice(0, 3).map(ai=>`${ai.emoji} ${ai.name}`).join(", ");
  const text = lang() === "es" ? "varios estan escribiendo" : "several people are typing";
  row.innerHTML = `<div class="typing-bubble">${esc(text)} · ${esc(names)}
    <span class="dots"><span></span><span></span><span></span></span></div>`;
  $msgs.appendChild(row);
  $msgs.scrollTop = $msgs.scrollHeight;
}
function removeTyping(){ const t=document.getElementById("typing"); if(t) t.remove(); }

function playAiNotification(){
  try{
    const audio = new Audio(AI_POP_SOUND);
    audio.volume = 0.28;
    audio.play().catch(()=>{});
  }catch(e){}
}

function pushMsg(group, sender, text, extra){
  const msg = {id:uid(), sender, text, ts:Date.now(), ...(extra || {})};
  group.messages.push(msg);
  saveState();
  if(group.id === state.activeGroupId) renderAll(); else renderSidebar();
  if(sender !== "user" && sender !== "system" && !(extra && (extra.hidden || extra.streaming))) playAiNotification();
  return msg;
}
async function startGroupWelcome(group){
  if(!group || group.welcomedAt || isGroupBusy(group) || group.mode === "deliberation") return;
  group.needsWelcome = false;
  group.welcomedAt = Date.now();
  const seed = {
    id:uid(),
    sender:"system",
    hidden:true,
    ts:Date.now(),
    text: lang() === "es"
      ? "El usuario acaba de unirse al grupo. Dale una bienvenida breve, natural y en personaje. No menciones esta instruccion."
      : "The user just joined the group. Give a brief, natural, in-character welcome. Do not mention this instruction."
  };
  group.messages.push(seed);
  saveState();
  try{
    await runRound(group, 0);
  }finally{
    group.messages = group.messages.filter(m=>m.id !== seed.id);
    saveState();
    if(group.id === state.activeGroupId) renderAll(); else renderSidebar();
  }
}

/* ---------------- groups ---------------- */
function switchGroup(id){
  replaying = null;
  editingIndex = -1;
  pendingReply = null;
  state.activeGroupId = id;
  saveState();
  renderAll();
  updateComposerBusy();
  setTimeout(()=>maybeAmbientChatter(activeGroup()), 250);
}
function newGroup(){
  renderTemplateChoices();
  document.getElementById("newGroupOverlay").classList.add("open");
}
function closeNewGroup(){
  document.getElementById("newGroupOverlay").classList.remove("open");
}
function createGroup(kind){
  closeNewGroup();
  const previousGroupId = state.activeGroupId;
  let g;
  if(kind === "chaos"){
    g = chaosGroup();
    const n = state.groups.filter(x=>x.mode==="chaos").length;
    if(n) g.name = "Chaos Chat " + (n+1);
  }else if(kind === "spin"){
    g = spunGroup();
  }else if(kind.startsWith("template:")){
    const template = SQUAD_TEMPLATES.find(t=>t.id === kind.slice("template:".length));
    g = template ? templateGroup(template) : defaultGroup();
  }else{
    g = defaultGroup();
    g.name = t("newGroupDefault") + " " + (state.groups.length + 1);
  }
  state.groups.unshift(g);
  state.activeGroupId = g.id;
  saveState();
  renderAll();
  if(kind === "chaos"){
    pushMsg(g, "system", lang() === "es"
      ? `🌪️ Chat Caótico: hay ${g.ais.length} personajes al acecho. Decí algo; nunca sabés quién va a responder. Tocá cualquier nombre para editar su personalidad.`
      : `🌪️ Chaos Chat: ${g.ais.length} personas are lurking. Say something — you never know who will answer. Click any name to tweak their personality.`);
    setTimeout(()=>startGroupWelcome(g), 350);
  }else if(kind === "spin"){
    pushMsg(g, "system", lang() === "es" ? "🎲 Squad creado al azar. ¿No te gustó? Tocá ➕ y girá otra vez." : "🎲 Spun a random squad. Not the vibe? Hit ➕ and spin again.");
    setTimeout(()=>startGroupWelcome(g), 350);
  }else if(kind.startsWith("template:")){
    renderAll();
    setTimeout(()=>startGroupWelcome(g), 350);
  }else{
    g.needsWelcome = true;
    saveState();
    openSettings(true, previousGroupId);
  }
}
function renderTemplateChoices(){
  const wrap = document.getElementById("squadTemplates");
  if(!wrap) return;
  wrap.innerHTML = SQUAD_TEMPLATES.map(t=>`
    <button class="type-choice template-choice" onclick="createGroup('template:${esc(t.id)}')">
      <span class="big">${esc(t.emoji)}</span>
      <span><span class="tt">${esc(t.name)}</span><br>
      <span class="td">${esc(localized(t.mood, lang()))} · ${esc(t.members.join(", "))}</span></span>
    </button>
  `).join("");
}
function spinThenCreate(btn){
  btn.classList.add("spinning");
  setTimeout(()=>createGroup("spin"), 650);
}
function spunGroup(){
  const shuffled = [...PERSONAS];
  for(let i=shuffled.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shuffled[i],shuffled[j]] = [shuffled[j],shuffled[i]];
  }
  const count = 3 + Math.floor(Math.random()*3);
  return {
    id: uid(), name: t("spunSquad"), emoji: "🎲", ctx: 24, mode: "chaos", ambient: false,
    messages: [],
    ais: shuffled.slice(0,count).map(p=>({ id:uid(), name:p.name, emoji:p.emoji, ...openRouterConfig(), prompt:p.prompt }))
  };
}
function cloneGroup(id){
  const src = state.groups.find(g=>g.id===id);
  if(!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.ais.forEach(a=>a.id = uid());
  copy.messages = [];
  copy.name = src.name + " ⧉";
  state.groups.unshift(copy);
  state.activeGroupId = copy.id;
  saveState();
  renderAll();
  pushMsg(copy, "system", t("clonedFrom") + ` "${src.name}" — ` + (lang() === "es" ? "mismo squad, memoria nueva 🧹" : "same squad, fresh memory 🧹"));
}
function deleteGroup(id){
  const g = state.groups.find(x=>x.id===id);
  if(!g) return;
  if(!confirm(`${t("deleteGroupConfirm")}\n\n${g.name}`)) return;
  state.groups = state.groups.filter(x=>x.id!==id);
  if(!state.groups.length) state.groups.push(defaultGroup());
  if(state.activeGroupId===id) state.activeGroupId = state.groups[0].id;
  saveState();
  renderAll();
}
function clearRound(){
  const g = activeGroup();
  if(g.messages.length && !confirm(t("clearChatConfirm"))) return;
  g.messages = [];
  pendingReply = null;
  saveState();
  renderAll();
  pushMsg(g, "system", t("freshRound"));
}

/* ---------------- message actions ---------------- */
function startEdit(idx){
  if(isGroupBusy(activeGroup())) return;
  pendingReply = null;
  editingIndex = idx;
  renderMessages();
  const ta = document.getElementById("editArea");
  if(ta){ ta.focus(); ta.selectionStart = ta.value.length; }
}
function cancelEdit(){ editingIndex = -1; renderMessages(); }
function replyTo(idx){
  if(isGroupBusy(activeGroup())) return;
  const g = activeGroup();
  const msg = g.messages[idx];
  if(!msg || msg.sender === "user") return;
  const ai = aiForSender(g, msg.sender);
  if(!ai) return;
  if(ai.muted){
    alert(`${ai.name} ${t("memberMutedAlert")}`);
    return;
  }
  editingIndex = -1;
  const item = {
    groupId: g.id,
    sender: ai.id,
    senderName: ai.name,
    messageId: msg.id || null,
    text: msg.text,
    ts: msg.ts
  };
  if(!pendingReply || pendingReply.groupId !== g.id){
    pendingReply = {groupId:g.id, items:[]};
  }
  const existing = pendingReply.items.findIndex(x=>
    x.sender === item.sender && x.ts === item.ts && x.text === item.text
  );
  if(existing >= 0){
    pendingReply.items.splice(existing, 1);
  }else{
    pendingReply.items = pendingReply.items.filter(x=>x.sender !== item.sender);
    pendingReply.items.push(item);
  }
  if(!pendingReply.items.length) pendingReply = null;
  renderReplyBar();
  const input = document.getElementById("input");
  input.focus();
}
function cancelReply(){
  pendingReply = null;
  renderReplyBar();
  document.getElementById("input").focus();
}
function setMemberMuted(group, aiId, muted){
  const ai = aiById(group, aiId);
  if(!ai) return null;
  ai.muted = !!muted;
  if(pendingReply && pendingReply.groupId === group.id && ai.muted){
    pendingReply.items = pendingReply.items.filter(item=>item.sender !== ai.id);
    if(!pendingReply.items.length) pendingReply = null;
  }
  saveState();
  renderAll();
  return ai;
}
function toggleMuteFromMsg(idx){
  if(isGroupBusy(activeGroup())) return;
  const g = activeGroup();
  const msg = g.messages[idx];
  if(!msg || msg.sender === "user") return;
  const ai = aiById(g, msg.sender);
  if(!ai) return;
  setMemberMuted(g, ai.id, !ai.muted);
}
async function saveEdit(idx){
  const g = activeGroup();
  const ta = document.getElementById("editArea");
  const text = (ta ? ta.value : "").trim();
  if(!text) return;
  editingIndex = -1;
  g.messages[idx].text = text;
  g.messages[idx].ts = Date.now();
  delete g.messages[idx].reactions;
  g.messages = g.messages.slice(0, idx+1);   // drop everything after, like LLM UIs
  saveState();
  renderAll();
  maybeAddAiReactions(g, g.messages[idx]);
  const idea = debateIdea(g, text);
  if(idea) await runDeliberation(g, idea);
  else await runRound(g, 0);
}
// The idea a user message puts on the War Room table: "/debate <idea>" anywhere, or any plain message in a War Room squad.
function debateIdea(group, text){
  const d = parseDebateCommand(text);
  if(d) return d.idea || null;
  return group.mode === "deliberation" ? text : null;
}
function deleteMsg(idx){
  if(isGroupBusy(activeGroup())) return;
  const g = activeGroup();
  g.messages.splice(idx,1);
  if(pendingReply && pendingReply.groupId === g.id) pendingReply = null;
  saveState();
  renderAll();
}
async function regenFrom(idx){
  if(isGroupBusy(activeGroup())) return;
  const g = activeGroup();
  const senderId = g.messages[idx].sender;
  if(g.messages[idx].deliberation){
    // A debate turn depends on every turn before it: re-run the whole debate from the message that started it.
    const start = g.messages.slice(0, idx).map(m=>m.sender).lastIndexOf("user");
    const idea = start >= 0 ? debateIdea(g, g.messages[start].text) : null;
    if(idea){
      g.messages = g.messages.slice(0, start + 1);
      saveState();
      renderAll();
      await runDeliberation(g, idea);
      return;
    }
  }
  g.messages = g.messages.slice(0, idx);     // drop this reply and everything after
  saveState();
  renderAll();
  if(g.mode === "chaos"){
    const ai = aiById(g, senderId);
    if(ai && !ai.muted) await runRepliers(g, [ai]);       // re-roll just that persona
    else await runRound(g, 0);
  }else{
    const startAi = Math.max(0, g.ais.findIndex(a=>a.id===senderId));
    await runRound(g, startAi);
  }
}

/* ---------------- chat flow ---------------- */
function onKey(e){
  if(handleMentionKey(e)) return;
  if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }
}
function autoGrow(el){
  el.style.height="auto";
  el.style.height=Math.min(el.scrollHeight,130)+"px";
}
function handleComposerInput(el){
  autoGrow(el);
  updateMentionBox();
}
const QUICK_PROMPTS = {
  es: [
    "Chicos, que hacemos este viernes?",
    "Acabo de ver un OVNI. Necesito opiniones serias y no tan serias.",
    "Por que fracaso mi dieta hoy?",
    "Tengo que tomar una decision en 5 minutos. Ayuda.",
    "Me invitaron a un plan raro. Voy o invento una excusa?",
    "Necesito una idea para hacer algo divertido y barato.",
    "Hoy me desperte con energia de plot twist. Que hago?",
    "Alguien me explica por que todos estan tan intensos hoy?",
    "Tengo una teoria conspirativa pero necesito que la destruyan.",
    "Que mensaje mando sin quedar desesperado?",
    "Armenme un plan de supervivencia para este lunes.",
    "Estoy procrastinando. Insultenme con carino.",
    "Que personaje del grupo sobreviviria a Area 51?",
    "Necesito una excusa creible para llegar tarde.",
    "Se pico una situacion y necesito mediadores."
  ],
  en: [
    "What should we do this Friday?",
    "I just saw a UFO. I need serious and unserious takes.",
    "Why did my diet fail today?",
    "I have to make a decision in 5 minutes. Help.",
    "I got invited to a weird plan. Do I go or invent an excuse?",
    "Give me a fun cheap plan.",
    "I woke up with plot twist energy. What now?",
    "Can someone explain why everyone is so intense today?",
    "I have a conspiracy theory and need you to destroy it.",
    "What message do I send without sounding desperate?",
    "Build me a survival plan for this Monday.",
    "I am procrastinating. Roast me lovingly.",
    "Which group member would survive Area 51?",
    "I need a believable excuse for being late.",
    "Things escalated and I need mediators."
  ]
};
function insertSurprisePrompt(){
  const input = document.getElementById("input");
  if(!input) return;
  const prompts = QUICK_PROMPTS[lang()] || QUICK_PROMPTS.es;
  input.value = prompts[Math.floor(Math.random() * prompts.length)];
  input.focus();
  input.selectionStart = input.selectionEnd = input.value.length;
  autoGrow(input);
  hideMentionBox();
}
const QUICK_ACTION_PROMPTS = {
  fact: {
    es: "Cada uno tire un dato random posta interesante o una mini reaccion propia, pero no hagan cadena hablando solo del primer dato.",
    en: "Each of you should share a genuinely interesting random fact or your own tiny reaction, but do not make a chain only about the first fact."
  },
  dadjoke: {
    es: "Necesito un dad joke malisimo. El grupo tiene permiso para juzgarlo.",
    en: "I need a terrible dad joke. The group is allowed to judge it."
  },
  gossip: {
    es: "Inventen un chisme absurdo del grupo, nivel telenovela barata, sin ponerse pesados.",
    en: "Invent absurd group gossip, cheap soap-opera level, without getting heavy."
  }
};
function slashCommands(){
  return [
    { command:"/help", emoji:"?", description:lang() === "es" ? "Ver ayuda rapida" : "Show quick help" },
    { command:"/votar", insert:"/votar Pizza o empanadas", emoji:"🗳️", description:lang() === "es" ? "Votacion express" : "Quick group vote" },
    { command:"/dato", emoji:"📖", description:lang() === "es" ? "Dato random" : "Random fact" },
    { command:"/chiste", emoji:"🎤", description:lang() === "es" ? "Dad joke malisimo" : "Terrible dad joke" },
    { command:"/chisme", emoji:"🍿", description:lang() === "es" ? "Chisme absurdo" : "Absurd gossip" },
    { command:"/drama", emoji:"⚡", description:lang() === "es" ? "Drama absurdo segun el grupo" : "Group-specific drama" },
    { command:lang() === "es" ? "/debatir" : "/debate", insert:(lang() === "es" ? "/debatir " : "/debate "), emoji:"🎯", description:lang() === "es" ? "War Room: debate en 3 rondas + memo" : "War Room: 3-round debate + memo" }
  ];
}
function sendQuickPrompt(kind){
  if(isGroupBusy(activeGroup())) return;
  const input = document.getElementById("input");
  const item = QUICK_ACTION_PROMPTS[kind];
  if(!input || !item) return;
  input.value = item[lang()] || item.es;
  autoGrow(input);
  hideMentionBox();
  send();
}
function fallbackDramaPrompt(group){
  const people = shuffledCopy(activeAis(group));
  const a = people[0] || {name:"Alguien"};
  const b = people[1] || {name:"otra persona"};
  const c = people[2] || {name:"el grupo"};
  const prompts = lang() === "es"
    ? [
      `${a.name} acusa a ${b.name} de haberse comido el ultimo pedazo de pizza y ${c.name} tiene una prueba ridicula. Discutan en tiempo real.`,
      `${a.name} propone un plan absurdamente malo para hoy y ${b.name} lo toma demasiado en serio. El resto reacciona.`,
      `${a.name} descubre que ${b.name} oculto informacion importantisima sobre el mate/snack del grupo. Se arma juicio popular.`,
      `${a.name} acaba de decir que sobreviviria mejor que ${b.name} en Area 51. Defiendan o destruyan esa idea.`
    ]
    : [
      `${a.name} accuses ${b.name} of eating the last slice of pizza and ${c.name} has ridiculous evidence. Argue in real time.`,
      `${a.name} proposes a terrible plan for today and ${b.name} takes it way too seriously. Everyone reacts.`,
      `${a.name} discovers that ${b.name} hid critical information about the group's snack. Start a tiny public trial.`,
      `${a.name} just claimed they would survive Area 51 better than ${b.name}. Defend or destroy that take.`
    ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}
async function generateDramaPrompt(group){
  const people = activeAis(group).slice(0, 12).map(ai=>({
    name: ai.name,
    emoji: ai.emoji,
    personality: String(ai.prompt || "").slice(0, 260)
  }));
  const system = lang() === "es"
    ? "Generas disparadores de drama absurdo para un chat grupal con personajes. Devuelve solo una instruccion breve, no JSON."
    : "Generate absurd drama starters for a group chat with characters. Return only one short instruction, not JSON.";
  const user = lang() === "es"
    ? `Grupo: ${group.name}\nParticipantes:\n${JSON.stringify(people)}\n\nCrea un conflicto absurdo y especifico que estos personajes realmente discutirian. Nivel: alguien se comio el ultimo pedazo de pizza, tiraron el mate, plan pesimo a las 6 AM, rumor ridiculo. Tiene que provocar respuestas en personaje. Maximo 2 frases. Sin violencia real, sin insultos fuertes, sin temas pesados. No menciones que sos IA.`
    : `Group: ${group.name}\nParticipants:\n${JSON.stringify(people)}\n\nCreate an absurd, specific conflict these characters would actually argue about. Level: someone ate the last pizza slice, spilled the user's mate, proposed a terrible 6 AM plan, ridiculous rumor. It should trigger in-character replies. Max 2 sentences. No real violence, no heavy topics, no harsh insults. Do not mention being AI.`;
  const text = await callOpenAICompat(
    { id:group.id, temperature:1.1 },
    { id:"drama-generator", provider:"openrouter", key:getOpenRouterKey() },
    PROVIDERS.openrouter,
    system,
    [{ role:"user", content:user }],
    DEFAULT_MODEL
  );
  return String(text || "").replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "").slice(0, 420) || fallbackDramaPrompt(group);
}
async function dropDramaBomb(){
  const g = activeGroup();
  if(!g || isGroupBusy(g)) return;
  busyGroups.add(g.id);
  updateComposerBusy();
  showToast(t("dramaGenerating"));
  let drama = "";
  try{
    drama = isOffline() ? fallbackDramaPrompt(g) : await generateDramaPrompt(g);
  }catch(e){
    drama = fallbackDramaPrompt(g);
  }finally{
    busyGroups.delete(g.id);
    updateComposerBusy();
  }
  g.messages.push({ id:uid(), sender:"system", text:drama, ts:Date.now(), hidden:true });
  saveState();
  pushMsg(g, "system", t("dramaStarted"));
  await runRound(g, 0);
}
function currentMentionQuery(input){
  return mentionQueryAt(input.value, input.selectionStart || 0);
}
function currentCommandQuery(input){
  return commandQueryAt(input.value, input.selectionStart || 0);
}
function updateMentionBox(){
  const input = document.getElementById("input");
  const box = document.getElementById("mentionBox");
  if(!input || !box) return;
  const cmdInfo = currentCommandQuery(input);
  if(cmdInfo){
    const q = foldText(cmdInfo.query);
    const options = slashCommands().filter(item=>!q || foldText(item.command).includes(q) || foldText(item.description).includes(q));
    if(!options.length){ hideMentionBox(); return; }
    mentionState = { open:true, mode:"command", start:0, query:cmdInfo.query, options, active:0 };
    box.classList.add("open");
    box.innerHTML = options.map((item,i)=>`
      <button type="button" class="mention-option ${i===0?"active":""}" onmousedown="event.preventDefault();insertMention(${i})">
        <span>${esc(item.emoji)}</span>
        <span class="mention-name">${esc(item.command)}</span>
        <span class="mention-source">${esc(item.description)}</span>
      </button>`).join("");
    return;
  }
  const info = currentMentionQuery(input);
  if(!info){ hideMentionBox(); return; }
  const q = foldText(info.query.trim());
  const options = sortedMentionOptions(activeGroup(), q, info.additive);
  if(!options.length){ hideMentionBox(); return; }
  mentionState = { open:true, start:info.start, query:info.query, options, active:0, additive:info.additive };
  box.classList.add("open");
  box.innerHTML = options.map((item,i)=>`
    <button type="button" class="mention-option ${i===0?"active":""}" onmousedown="event.preventDefault();insertMention(${i})">
      <span>${esc(item.emoji)}</span>
      <span class="mention-name">${esc(item.name)}</span>
      <span class="mention-source">${mentionUseCount(activeGroup(), item.ai.id) ? t("used") + " " + mentionUseCount(activeGroup(), item.ai.id) + "x" : (item.source==="group" ? t("groupSource") : t("librarySource"))}</span>
    </button>`).join("");
}
function hideMentionBox(){
  mentionState = { open:false, mode:"mention", start:-1, query:"", options:[], active:0 };
  const box = document.getElementById("mentionBox");
  if(box){ box.classList.remove("open"); box.innerHTML = ""; }
}
function renderMentionActive(){
  const box = document.getElementById("mentionBox");
  if(!box) return;
  [...box.querySelectorAll(".mention-option")].forEach((el,i)=>{
    el.classList.toggle("active", i === mentionState.active);
    if(i === mentionState.active) el.scrollIntoView({block:"nearest"});
  });
}
function insertMention(i){
  const input = document.getElementById("input");
  const item = mentionState.options[i];
  if(!input || !item) return;
  if(mentionState.mode === "command"){
    const insert = item.insert || item.command;
    input.value = insert;
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
    autoGrow(input);
    hideMentionBox();
    return;
  }
  const pos = input.selectionStart || 0;
  const before = input.value.slice(0, mentionState.start);
  const after = input.value.slice(pos);
  const insert = (mentionState.additive ? "+@" : "@") + item.name + " ";
  input.value = before + insert + after;
  const next = before.length + insert.length;
  input.focus();
  input.selectionStart = input.selectionEnd = next;
  autoGrow(input);
  hideMentionBox();
}
function handleMentionKey(e){
  if(!mentionState.open) return false;
  if(e.key === "ArrowDown"){
    e.preventDefault();
    mentionState.active = (mentionState.active + 1) % mentionState.options.length;
    renderMentionActive();
    return true;
  }
  if(e.key === "ArrowUp"){
    e.preventDefault();
    mentionState.active = (mentionState.active - 1 + mentionState.options.length) % mentionState.options.length;
    renderMentionActive();
    return true;
  }
  if(e.key === "Enter" || e.key === "Tab"){
    e.preventDefault();
    insertMention(mentionState.active);
    return true;
  }
  if(e.key === "Escape"){
    e.preventDefault();
    hideMentionBox();
    return true;
  }
  return false;
}

function voteParticipants(group){
  const available = activeAis(group);
  if(available.length <= 6) return available;
  return shuffledCopy(available).slice(0, group.mode === "chaos" ? 6 : 5);
}
function voteChoiceIndex(ai, vote){
  const seed = foldText(ai.name + " " + ai.prompt + " " + vote.question)
    .split("")
    .reduce((sum, ch)=>sum + ch.charCodeAt(0), 0);
  return (seed + Math.floor(Math.random() * vote.options.length)) % vote.options.length;
}
function voteReplyText(ai, choice, index){
  const marks = ["👍","👎","🔥","🤔"];
  const openers = lang() === "es"
    ? [`${choice} ${marks[index % marks.length]}`, `Voy con ${choice}.`, `${choice}, sin dudar.`, `${choice}. Lo sostengo.`]
    : [`${choice} ${marks[index % marks.length]}`, `I vote ${choice}.`, `${choice}, no doubt.`, `${choice}. I stand by it.`];
  const text = openers[Math.floor(Math.random() * openers.length)];
  if(/sir aldric/i.test(ai.name)) return lang() === "es" ? `Mi espada vota ${choice}.` : `My sword votes ${choice}.`;
  if(/datos/i.test(ai.name)) return lang() === "es" ? `${choice}. Muestra chica, conclusion fuerte.` : `${choice}. Small sample, strong conclusion.`;
  if(/memo|sarcas/i.test(ai.name)) return `${choice} ${Math.random() < 0.5 ? "💀" : "😂"}`;
  return text;
}
function voteResultText(vote, counts){
  const entries = vote.options.map(opt=>({ opt, count:counts[opt] || 0 }));
  entries.sort((a,b)=>b.count-a.count);
  const top = entries[0];
  const tied = entries.filter(e=>e.count === top.count);
  const score = vote.options.length === 2
    ? `${counts[vote.options[0]] || 0} a ${counts[vote.options[1]] || 0}`
    : entries.map(e=>`${e.opt}: ${e.count}`).join(", ");
  const spice = lang() === "es"
    ? ["Messi esta enojado.", "La democracia hizo lo que pudo.", "El grupo hablo y ahora hay consecuencias.", "Resultado polemico, como corresponde."]
    : ["Democracy did what it could.", "The group has spoken and consequences exist.", "Controversial result, as required.", "The vibes have been counted."];
  if(tied.length > 1){
    return `RESULTADO: ${score}. Empate tecnico. ${spice[Math.floor(Math.random() * spice.length)]}`;
  }
  return `RESULTADO: ${score}, gana ${top.opt}. ${spice[Math.floor(Math.random() * spice.length)]}`;
}
async function runExpressVote(group, text){
  const vote = parseVoteCommand(text);
  if(!vote) return false;
  pendingReply = null;
  pushMsg(group, "user", text);
  if(vote.error){
    pushMsg(group, "system", lang() === "es"
      ? "Uso: /votar Pizza o empanadas"
      : "Usage: /votar Pizza or empanadas");
    return true;
  }
  const participants = voteParticipants(group);
  if(!participants.length){
    pushMsg(group, "system", lang() === "es" ? "No hay personajes activos para votar." : "No active characters can vote.");
    return true;
  }
  busyGroups.add(group.id);
  updateComposerBusy();
  const counts = Object.fromEntries(vote.options.map(opt=>[opt, 0]));
  try{
    for(const ai of participants){
      const idx = voteChoiceIndex(ai, vote);
      const choice = vote.options[idx];
      counts[choice] = (counts[choice] || 0) + 1;
      if(group.id === state.activeGroupId) showTyping(ai, lang() === "es" ? "esta votando" : "is voting");
      await sleepMs(220 + Math.random() * 260);
      if(group.id === state.activeGroupId) removeTyping();
      pushMsg(group, ai.id, voteReplyText(ai, choice, idx));
    }
    pushMsg(group, "system", voteResultText(vote, counts));
  }finally{
    busyGroups.delete(group.id);
    updateComposerBusy();
  }
  return true;
}

async function send(){
  const g = activeGroup();
  if(isGroupBusy(g)) return;
  const input = document.getElementById("input");
  let text = input.value.trim();
  if(!text) return;
  checkAchievements(text);
  const isHelpCommand = text.toLowerCase() === "/help";
  const quickSlash = quickSlashCommand(text);
  const debate = parseDebateCommand(text);
  input.value=""; autoGrow(input);
  hideMentionBox();
  const replies = pendingReply && pendingReply.groupId === g.id ? [...pendingReply.items] : [];
  pendingReply = null;
  if(isHelpCommand){
    pushMsg(g, "system", t("helpText"));
    return;
  }
  if(quickSlash === "drama"){
    await dropDramaBomb();
    return;
  }
  if(quickSlash && QUICK_ACTION_PROMPTS[quickSlash]){
    const item = QUICK_ACTION_PROMPTS[quickSlash];
    text = item[lang()] || item.es;
  }
  if(debate){
    pushMsg(g, "user", text);
    if(debate.error) pushMsg(g, "system", t("debateUsage"));
    else await runDeliberation(g, debate.idea);
    return;
  }
  if(await runExpressVote(g, text)) return;
  const userMsg = pushMsg(g, "user", text, replies.length ? {replyTo: replies.map(reply=>({
    sender: reply.sender,
    senderName: reply.senderName,
    messageId: reply.messageId || null,
    text: reply.text,
    ts: reply.ts
  }))} : null);
  maybeAddAiReactions(g, userMsg);
  const plan = planTurn(g, {
    text,
    isFirstUserMessage: g.messages.filter(m=>m.sender === "user").length === 1,
    replyTargets: replies.map(reply=>aiForSender(g, reply.sender)),
    catalog: mentionCatalog(g)
  });
  if(plan.mentioned) recordMentionUsage(g, plan.mentioned);
  if(plan.kind === "deliberation") await runDeliberation(g, text);
  else await runRepliers(g, plan.ais);
}

function isOffline(){ return !getOpenRouterKey(); }
// Live-update one streaming bubble without re-rendering the whole chat.
function paintStreaming(group, msg){
  if(group.id !== state.activeGroupId) return;
  const el = $msgs.querySelector(`[data-mid="${msg.id}"] .msg-text`);
  if(!el){ renderMessages(); return; }
  el.textContent = msg.text;
  $msgs.scrollTop = $msgs.scrollHeight;
}
// One member speaks: typing indicator, tokens streamed into a live bubble, final message stored.
async function speak(group, ai, opts){
  const o = opts || {};
  const active = ()=>group.id === state.activeGroupId;
  const guest = aiById(group, ai.id) ? {} : { senderName: ai.name, senderEmoji: ai.emoji };
  if(active()) showTyping(ai);
  let live = null;
  const onDelta = full=>{
    if(!live){
      if(active()) removeTyping();
      live = pushMsg(group, ai.id, "", { ...guest, ...(o.extra || {}), streaming:true });
    }
    live.text = full;
    paintStreaming(group, live);
  };
  try{
    const text = (await callAI(group, ai, o.messageLimit, { onDelta, extraSystem:o.extraSystem, deliberation:o.deliberation })).trim();
    if(active()) removeTyping();
    if(!live) return pushMsg(group, ai.id, text, { ...guest, ...(o.extra || {}) });
    live.text = text;
    delete live.streaming;
    saveState();
    if(active()) renderMessages(); else renderSidebar();
    playAiNotification();
    return live;
  }catch(err){
    if(active()) removeTyping();
    if(live){
      group.messages = group.messages.filter(m=>m !== live);
      saveState();
      if(active()) renderMessages();
    }
    throw err;
  }
}

async function runRepliers(group, ais){
  ais = ais.filter(ai=>ai && !ai.muted);
  if(!ais.length) return;
  busyGroups.add(group.id);
  updateComposerBusy();
  let answered = 0;
  const failures = [];
  const roundHistoryLimit = group.messages.length;
  try{
    if(group.mode === "chaos" && ais.length > 1 && group.id === state.activeGroupId && Math.random() < 0.34){
      showMultiTyping(shuffledCopy(ais));
      await sleepMs(500 + Math.random() * 500);
    }
    for(const ai of ais){
      try{
        const aiMsg = await speak(group, ai, { messageLimit: roundHistoryLimit });
        maybeAddAiReactions(group, aiMsg);
        answered++;
      }catch(err){
        failures.push(err);
        console.warn(`${ai.name} skipped this turn:`, err);
        if(err.rateLimitExhausted) break;
      }
    }
    if(failures.length && (!answered || failures.some(err=>err.rateLimitExhausted))){
      pushMsg(group, "system", t("modelsBusy"));
    }
  }finally{
    busyGroups.delete(group.id);
    updateComposerBusy();
    if(group.id === state.activeGroupId) document.getElementById("input").focus();
  }
}

async function runRound(group, startAiIndex){
  await runRepliers(group, roundRepliers(group, startAiIndex));
}

/* ---------------- War Room deliberation: 3 rounds + decision memo ---------------- */
function deliberationInstruction(step, idea){
  const es = lang() === "es";
  const head = es
    ? `MODO WAR ROOM, ronda ${step.round}/3. Idea en revision: «${idea}». Hablas solo desde el rol de tu personalidad; nada de cortesias.`
    : `WAR ROOM MODE, round ${step.round}/3. Idea under review: «${idea}». Speak strictly from your role's lens; no pleasantries.`;
  if(step.phase === "open") return head + "\n" + (es
    ? "Ronda 1 (posiciones iniciales): en 2-4 oraciones, nombra el mayor riesgo concreto y que evidencia necesitarias. Termina con 'Me inclino por: GO|REVISE|NO-GO'."
    : "Round 1 (opening positions): in 2-4 sentences, name the single biggest concrete risk and the evidence you'd need. End with 'Leaning: GO|REVISE|NO-GO'.");
  if(step.phase === "cross") return head + "\n" + (es
    ? `Ronda 2 (contrapreguntas): desafia directamente la posicion de ${step.target.name}, dirigiendote como @${step.target.name}. Reconoce lo correcto, ataca su supuesto mas debil y propone una alternativa concreta. 2-4 oraciones.`
    : `Round 2 (cross-examination): challenge ${step.target.name}'s position directly, addressing them as @${step.target.name}. Concede what is right, attack their weakest assumption, offer a concrete alternative. 2-4 sentences.`);
  return head + "\n" + (es
    ? "Ronda 3 (convergencia): la primera linea debe ser exactamente 'VOTE: GO', 'VOTE: REVISE' o 'VOTE: NO-GO' (mantene esos tokens en ingles). Despues, una oracion con la condicion que aseguraria o cambiaria tu voto."
    : "Round 3 (convergence): your first line must be exactly 'VOTE: GO', 'VOTE: REVISE' or 'VOTE: NO-GO'. Then one sentence with the condition that would secure or change your vote.");
}
async function callChairMemo(group, idea, turns){
  const es = lang() === "es";
  const titles = MEMO_SECTIONS.map((s, i)=>`${i + 1}. ${localized(s.title, lang())}`).join("\n");
  const system = es
    ? `Sos el presidente neutral de un panel red-team. Sintetiza el debate en un memo de decision con exactamente estas 4 secciones numeradas, cada una con 1-4 vinetas cortas y concretas:\n${titles}\nNo agregues introduccion ni cierre. Responde en espanol.`
    : `You are the neutral chair of a red-team panel. Synthesize the debate into a decision memo with exactly these 4 numbered sections, each with 1-4 short, concrete bullets:\n${titles}\nNo preamble, no sign-off.`;
  const transcript = turns.map(x=>`[R${x.round}] ${x.speaker}: ${x.text}`).join("\n");
  return callOpenAICompat(
    { id:group.id, temperature:0.3 },
    { id:"war-room-chair", provider:"openrouter", key:getOpenRouterKey() },
    PROVIDERS.openrouter, system,
    [{ role:"user", content:`${es ? "Idea" : "Idea"}: ${idea}\n\n${transcript}` }],
    DEFAULT_MODEL
  );
}
async function runDeliberation(group, idea){
  const panel = activeAis(group);
  if(panel.length < 2){
    pushMsg(group, "system", t("debateNeedsTwo"));
    return;
  }
  busyGroups.add(group.id);
  updateComposerBusy();
  const votes = new Map();
  const turns = [];
  let round = 0;
  try{
    for(const step of deliberationSchedule(panel)){
      if(step.round !== round){
        round = step.round;
        const r = DELIBERATION_ROUNDS[round - 1];
        pushMsg(group, "system", `${t("roundLabel")} ${round}/3 · ${localized(r.label, lang())}`, { kind:"round" });
      }
      let msg;
      try{
        msg = await speak(group, step.speaker, {
          extraSystem: deliberationInstruction(step, idea),
          deliberation: { ...step, idea, index: panel.indexOf(step.speaker), targetIndex: step.target ? panel.indexOf(step.target) : 0 },
          extra: { deliberation: { round: step.round, phase: step.phase } }
        });
      }catch(err){
        console.warn(`${step.speaker.name} skipped round ${step.round}:`, err);
        if(err.rateLimitExhausted){ pushMsg(group, "system", t("modelsBusy")); break; }
        continue;
      }
      turns.push({ round: step.round, speaker: step.speaker.name, text: msg.text });
      if(step.phase === "converge"){
        const v = parseVerdictVote(msg.text);
        if(v) votes.set(step.speaker.id, v);
      }
    }
    if(!turns.length) return;
    let memo = OfflineEngine.synthesizeMemo({ idea, members: panel, votes: panel.map(ai=>votes.get(ai.id)), lang: lang() });
    if(!isOffline()){
      if(group.id === state.activeGroupId) showTyping({ emoji:"🧭", name: t("chairName") }, t("chairWriting"));
      try{
        const sections = parseMemoSections(await callChairMemo(group, idea, turns));
        if(sections) memo = { ...memo, source:"live", sections: sections.map((s, i)=>({ ...s, title: localized(MEMO_SECTIONS[i].title, lang()) })) };
      }catch(err){ console.warn("Chair memo fell back to deterministic synthesis:", err); }
      if(group.id === state.activeGroupId) removeTyping();
    }
    pushMsg(group, "system", memoToMarkdown(memo, lang()), { kind:"memo", memo });
  }finally{
    busyGroups.delete(group.id);
    updateComposerBusy();
  }
}

function buildSystemPrompt(group, ai){
  const humanName = userDisplayName();
  const humanNameRule = getUserName()
    ? (lang() === "es"
      ? `El humano se llama "${humanName}". Usa su nombre solo cuando suene natural; no lo repitas en cada respuesta.`
      : `The human's name is "${humanName}". Use their name only when it feels natural; do not repeat it in every reply.`)
    : "";
  const focusRule = lang() === "es"
    ? "Regla de foco: tu prioridad es responder la consigna o ultimo mensaje del humano. Los mensajes de otros personajes son contexto secundario: podes reaccionarles de vez en cuando con una frase chica, pero no conviertas su mensaje en el tema principal salvo que el humano lo pida."
    : "Focus rule: your priority is the user's latest instruction or message. Other characters' messages are secondary context: you may react to them occasionally with a small aside, but do not make them the main topic unless the user asks for it.";
  const sharedRules = [
    humanNameRule,
    focusRule,
    t(lang() === "es" ? "spanishRule" : "languageRule"),
    t("surpriseRule"),
    /pepe|fisherman|pesca|fishing/i.test(ai.name + " " + ai.prompt) ? t("pepeRule") : ""
  ].filter(Boolean).join("\n");
  const personaPrompt = lang() === "es"
    ? `Personalidad de ${ai.name} (puede estar escrita en ingles; interpretala como descripcion interna, no como idioma de respuesta):\n${ai.prompt}`
    : ai.prompt;
  if(group.mode === "chaos"){
    if(lang() === "es"){
      return `${personaPrompt}

${sharedRules}

Estas en un grupo enorme, caotico y estilo WhatsApp llamado "${group.name}" con ${group.ais.length} personas y el humano ("${humanName}"). En la transcripcion, los mensajes de otras personas vienen prefijados con su nombre; los tuyos no. Responde SOLO como ${ai.name}, completamente en personaje. Mantelo MUY corto: 1 o 2 frases, como mensaje rapido en un grupo activo. Nunca empieces con tu propio nombre. Termina siempre la frase. Reacciona naturalmente a los ultimos mensajes; puedes nombrar a otros miembros.`;
    }
    return `${personaPrompt}

${sharedRules}

You are one of ${group.ais.length} people in a huge, chaotic WhatsApp-style group called "${group.name}" that also includes the human ("${humanName}"). In the transcript, other people's messages are prefixed with their name; yours are not. Reply ONLY as ${ai.name}, fully in character. Keep it VERY short - 1 or 2 sentences, like a quick text in a busy group. Never prefix your reply with your own name. Always finish your sentence. React to the latest messages naturally; you may address other members by name.`;
  }
  const others = group.ais.filter(a=>a.id!==ai.id).map(a=>a.name);
  const othersTxt = others.length
    ? ` and ${others.length} other AI${others.length>1?"s":""}: ${others.join(", ")}`
    : "";
  if(lang() === "es"){
    const othersEs = others.length
      ? ` y ${others.length} personaje${others.length>1?"s":""} mas: ${others.join(", ")}`
      : "";
    return `${personaPrompt}

${sharedRules}

Estas chateando en un grupo casual estilo WhatsApp llamado "${group.name}" con el humano ("${humanName}")${othersEs}. En la transcripcion, los mensajes de otras personas vienen prefijados con su nombre; los tuyos no. Responde SOLO como ${ai.name}: corto, conversacional, como mensaje de chat, normalmente 1 a 3 frases salvo que haga falta detalle real. Nunca empieces con tu propio nombre. Termina siempre la frase. Reacciona naturalmente a lo que dijeron los demas.`;
  }
  return `${personaPrompt}

${sharedRules}

You are chatting in a casual WhatsApp-style group called "${group.name}" with the human ("${humanName}")${othersTxt}. In the transcript, other people's messages are prefixed with their name; yours are not. Reply ONLY as ${ai.name}: short, conversational, like texting - usually 1-3 sentences unless real detail is needed. Never prefix your reply with your own name. Always finish your sentence. React naturally to what the others said.`;
}

function buildHistory(group, ai, messageLimit){
  const source = Number.isInteger(messageLimit) ? group.messages.slice(0, messageLimit) : group.messages;
  const recent = source.filter(m=>m.sender!=="system" || m.hidden).slice(-group.ctx);
  const latestUser = [...recent].reverse().find(m=>m.sender === "user");
  const out = [];
  for(const m of recent){
    if(m.sender === ai.id){
      out.push({role:"assistant", content:m.text});
    }else{
      if(m.hidden){
        out.push({role:"user", content:m.text});
        continue;
      }
      const who = m.sender==="user" ? userDisplayName() : (aiForSender(group, m.sender)?.name || m.senderName || "Someone");
      const replies = replyItems(m.replyTo);
      const replyCtx = replies.length
        ? replies.map(r=>`(replying to ${replyLabel(group, r)}: ${r.text})`).join("\n") + "\n"
        : "";
      const reactionCtx = Array.isArray(m.reactions) && m.reactions.length
        ? "\n" + m.reactions.map(r=>{
          const reactor = aiForSender(group, r.sender);
          return `(reaction from ${reactor ? reactor.name : "Someone"}: ${r.emoji || "👍"})`;
        }).join(" ")
        : "";
      const focusPrefix = latestUser && m.id === latestUser.id
        ? (lang() === "es" ? "MENSAJE PRINCIPAL DEL HUMANO - " : "MAIN USER MESSAGE - ")
        : "";
      out.push({role:"user", content:`${who}: ${focusPrefix}${replyCtx}${m.text}${reactionCtx}`});
    }
  }
  const merged = [];
  for(const m of out){
    const last = merged[merged.length-1];
    if(last && last.role===m.role){ last.content += "\n" + m.content; }
    else merged.push({...m});
  }
  return merged;
}

// Offline Simulation Engine: deterministic text, streamed word by word so the UI behaves like a live model.
async function callOffline(group, ai, opts){
  const d = opts.deliberation;
  const text = d
    ? OfflineEngine.deliberationTurn({ ai, index:d.index, phase:d.phase, target:d.target, targetIndex:d.targetIndex, idea:d.idea, lang:lang() }).text
    : OfflineEngine.reply({ ai, group, lang:lang(), userName:getUserName() });
  await sleepMs(320 + (text.length % 9) * 55);
  if(opts.onDelta){
    let acc = "";
    for(const piece of text.split(/(\s+)/)){
      acc += piece;
      if(!/\S/.test(piece)) continue;
      opts.onDelta(acc);
      await sleepMs(14);
    }
  }
  return text;
}
async function callAI(group, ai, messageLimit, opts){
  const o = opts || {};
  if(isOffline()) return callOffline(group, ai, o);
  ai.provider = "openrouter";
  ai.key = getOpenRouterKey();
  const history = buildHistory(group, ai, messageLimit);
  const system = buildSystemPrompt(group, ai) + "\n\n" + responseTuningPrompt(group) + (o.extraSystem ? "\n\n" + o.extraSystem : "");
  const cheapRoute = shouldUseCheapFallback(ai.model);
  const models = modelFallbackList(ai.model).slice(0, cheapRoute ? 1 : 4);
  let lastErr = null;
  let rateLimitHits = 0;
  for(const model of models){
    try{
      const txt = await callOpenAICompat(group, ai, PROVIDERS.openrouter, system, history, model, o.onDelta);
      if(!cheapRoute){
        ai.model = model;
        const saved = aiById(group, ai.id);
        if(saved) saved.model = model;
        saveState();
      }
      return txt;
    }catch(err){
      if(err.partial) return err.partial;   // stream broke mid-reply: keep what arrived instead of re-asking
      lastErr = err;
      if(!shouldTryNextModel(err)) break;
      if(err.status === 429){
        rateLimitHits++;
        const waitMs = err.retryAfterMs || (rateLimitHits === 1 ? 4500 : 9000);
        openRouterCooldownUntil = Math.max(openRouterCooldownUntil, Date.now() + waitMs);
        if(group.id === state.activeGroupId){
          const seconds = Math.max(1, Math.ceil(waitMs / 1000));
          const status = lang() === "es"
            ? `espera cupo · prueba otro modelo en ${seconds}s`
            : `waiting for capacity · another model in ${seconds}s`;
          showTyping(ai, status);
        }
        // A second 429 usually means the account-wide free limit, not a bad model.
        // Stop here instead of turning one message into a request avalanche.
        if(rateLimitHits >= 2){
          err.rateLimitExhausted = true;
          break;
        }
      }else if(group.id === state.activeGroupId){
        showTyping(ai, lang() === "es" ? "prueba otro modelo gratis" : "trying another free model");
      }
    }
  }
  if(!cheapRoute && shouldRouteToCheapFallback(lastErr)){
    setCheapFallbackActive(true);
    if(group.id === state.activeGroupId){
      showTyping(ai, lang() === "es" ? "free saturado · usa modelo barato" : "free busy · using cheap model");
    }
    try{
      return await callOpenAICompat(group, ai, PROVIDERS.openrouter, system, history, CHEAP_FALLBACK_MODEL, o.onDelta);
    }catch(err){
      if(err.partial) return err.partial;
      lastErr = err;
    }
  }
  throw lastErr || new Error("No free model answered");
}

function modelFallbackList(selected){
  if(shouldUseCheapFallback(selected)) return [CHEAP_FALLBACK_MODEL];
  if(selected && !isFreeModel(selected)) return [selected];
  const liveFree = (MODEL_OPTIONS.openrouter || []).filter(m=>m.free).map(m=>m.id);
  const raw = [selected, ...FREE_MODEL_FALLBACKS, ...liveFree]
    .filter(Boolean)
    .filter(isFreeModel);
  const seen = new Set();
  return raw.filter(id=>{
    if(seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function isFreeModel(id){
  return String(id || "").includes(":free") || String(id || "") === "openrouter/free";
}
function cheapFallbackActive(){
  return localStorage.getItem(OPENROUTER_ROUTE_MODE_KEY) === "cheap";
}
function setCheapFallbackActive(active){
  localStorage.setItem(OPENROUTER_ROUTE_MODE_KEY, active ? "cheap" : "free");
}
function shouldUseCheapFallback(selected){
  return cheapFallbackActive() && isFreeModel(selected || DEFAULT_MODEL);
}
function shouldRouteToCheapFallback(err){
  if(!err) return true;
  if([402,408,409,429,500,502,503,504].includes(err.status)) return true;
  return /timeout|timed out|unavailable|rate|limit|capacity|provider|empty response/i.test(err.message || "");
}

function sleepMs(ms){
  return new Promise(resolve=>setTimeout(resolve, Math.max(0, ms)));
}
function waitForOpenRouterSlot(){
  const turn = openRouterPaceChain.then(async()=>{
    const readyAt = Math.max(openRouterNextRequestAt, openRouterCooldownUntil);
    const waitMs = readyAt - Date.now();
    if(waitMs > 0) await sleepMs(waitMs);
    openRouterNextRequestAt = Date.now() + OPENROUTER_REQUEST_GAP_MS;
  });
  openRouterPaceChain = turn.catch(()=>{});
  return turn;
}
function retryAfterMs(res){
  const raw = res.headers.get("retry-after");
  if(!raw) return 0;
  const seconds = Number(raw);
  if(Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}
function shouldTryNextModel(err){
  if(!err) return true;
  if(err.status && [400,402,404,408,409,429,500,502,503,504].includes(err.status)) return true;
  return /model|unavailable|rate|limit|provider|temporarily|empty response/i.test(err.message || "");
}

// With onDelta, requests `stream: true` and parses OpenRouter's SSE; otherwise a single JSON completion.
async function callOpenAICompat(group, ai, prov, system, history, model, onDelta){
  await waitForOpenRouterSlot();
  const headers = {
    "Content-Type":"application/json",
    "Authorization":"Bearer " + ai.key,
    "HTTP-Referer":"http://localhost",
    "X-Title":"AI Group Chat"
  };
  const controller = new AbortController();
  let timer = null;
  const arm = ()=>{ clearTimeout(timer); timer = setTimeout(()=>controller.abort(), OPENROUTER_TIMEOUT_MS); };
  const timeoutError = ()=>Object.assign(new Error("Request timed out"), { status:408 });
  arm();
  let res;
  try{
    res = await fetch(prov.url, {
      method:"POST", headers,
      body: JSON.stringify({
        model,
        messages: [{role:"system", content:system}, ...history],
        max_tokens: 1024,
        temperature: groupTemperature(group),
        stream: !!onDelta
      }),
      signal: controller.signal
    });
    if(!res.ok){
      const body = await res.text().catch(()=> "");
      const err = new Error(`HTTP ${res.status} ${body.slice(0,220)}`);
      err.status = res.status;
      err.retryAfterMs = retryAfterMs(res);
      throw err;
    }
    if(!onDelta || !res.body){
      const data = await res.json();
      const txt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if(!txt) throw new Error("empty response");
      if(onDelta) onDelta(txt);
      return txt;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "";
    try{
      for(;;){
        const { done, value } = await reader.read();
        if(done) break;
        arm();   // idle timeout: reset on every chunk
        buffer += decoder.decode(value, { stream:true });
        const chunk = parseSSE(buffer);
        buffer = chunk.rest;
        for(const d of chunk.deltas){ full += d; onDelta(full); }
        if(chunk.error){
          const err = new Error(chunk.error.message);
          err.status = Number(chunk.error.code) || 502;
          throw err;
        }
        if(chunk.done) break;
      }
    }catch(e){
      const err = e && e.name === "AbortError" ? timeoutError() : e;
      if(full) err.partial = full;
      throw err;
    }finally{
      reader.cancel().catch(()=>{});
    }
    if(!full) throw new Error("empty response");
    return full;
  }catch(e){
    if(e && e.name === "AbortError") throw timeoutError();
    throw e;
  }finally{
    clearTimeout(timer);
  }
}

let openRouterHealthChecking = false;
async function checkOpenRouterStartupHealth(){
  const key = getOpenRouterKey();
  if(!key || openRouterHealthChecking) return;
  openRouterHealthChecking = true;
  try{
    await callOpenRouterProbe("openrouter/free", key);
    setCheapFallbackActive(false);
  }catch(err){
    if(err && err.status === 401) return;
    if(shouldRouteToCheapFallback(err)) setCheapFallbackActive(true);
  }finally{
    openRouterHealthChecking = false;
  }
}
async function callOpenRouterProbe(model, key){
  await waitForOpenRouterSlot();
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 12000);
  let res;
  try{
    res = await fetch(PROVIDERS.openrouter.url, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer " + key,
        "HTTP-Referer":"http://localhost",
        "X-Title":"AI Group Chat"
      },
      body: JSON.stringify({
        model,
        messages:[
          {role:"system", content:"Reply with exactly: ok"},
          {role:"user", content:"health check"}
        ],
        max_tokens: 4,
        temperature: 0
      }),
      signal: controller.signal
    });
  }catch(e){
    if(e && e.name === "AbortError"){
      const err = new Error("Request timed out");
      err.status = 408;
      throw err;
    }
    throw e;
  }finally{
    clearTimeout(timer);
  }
  if(!res.ok){
    const t = await res.text().catch(()=> "");
    const err = new Error(`HTTP ${res.status} ${t.slice(0,160)}`);
    err.status = res.status;
    err.retryAfterMs = retryAfterMs(res);
    throw err;
  }
  const data = await res.json();
  const txt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if(!txt) throw new Error("empty response");
  return true;
}

/* ---------------- quick edit (click a name in chat) ---------------- */
let quickEditId = null;

function personaOptionsHtml(selectedText){
  return `<option value="">${esc(t("choosePersonality"))}</option>` +
    PERSONAS.map((p,i)=>`<option value="${i}">${p.emoji} ${p.name}</option>`).join("");
}
function providerModels(provider){
  return MODEL_OPTIONS[provider] || [];
}
function defaultModel(provider){
  const models = providerModels(provider);
  return models.length ? models[0].id : "";
}
function modelOptionsHtml(provider, selected){
  const models = providerModels(provider);
  const hasSelected = models.some(m=>m.id === selected);
  const current = hasSelected ? selected : (selected ? CUSTOM_MODEL : defaultModel(provider));
  let html = models.map(m=>{
    const tag = m.free ? (lang() === "es" ? " (gratis)" : " (free)") : "";
    const label = m.id === CHEAP_FALLBACK_MODEL ? `Llama 3.3 70B ${t("cheapFallback")}` : m.label;
    return `<option value="${esc(m.id)}" ${current===m.id?"selected":""}>${esc(label + tag)}</option>`;
  }).join("");
  html += `<option value="${CUSTOM_MODEL}" ${current===CUSTOM_MODEL?"selected":""}>${esc(t("customModel"))}</option>`;
  return html;
}
function syncCustomModelInput(i){
  const sel = document.getElementById(`model_${i}`);
  const custom = document.getElementById(`custom_model_${i}`);
  if(!sel || !custom) return;
  custom.style.display = sel.value === CUSTOM_MODEL ? "block" : "none";
  if(sel.value === CUSTOM_MODEL) custom.focus();
}
function modelPicked(i){
  syncCustomModelInput(i);
}
function providerPicked(i){
  const model = document.getElementById(`model_${i}`);
  const custom = document.getElementById(`custom_model_${i}`);
  if(model){
    model.innerHTML = modelOptionsHtml("openrouter", "");
    model.value = DEFAULT_MODEL;
  }
  if(custom) custom.value = "";
  syncCustomModelInput(i);
  refreshOpenRouterFreeModels();
}
async function refreshOpenRouterFreeModels(){
  if(openRouterFreeModelsLoaded || openRouterFreeModelsLoading) return;
  openRouterFreeModelsLoading = true;
  try{
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if(!res.ok) return;
    const data = await res.json();
    const free = (data.data || [])
      .filter(m=>m && m.id && m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
      .map(m=>({ id:m.id, label:m.name || m.id, free:true }))
      .sort((a,b)=>rankFreeModel(a.id)-rankFreeModel(b.id) || a.label.localeCompare(b.label))
      .slice(0, 80);
    if(!free.length) return;
    MODEL_OPTIONS.openrouter = [
      ...free,
      { id:CHEAP_FALLBACK_MODEL, label:"Llama 3.3 70B cheap fallback", free:false }
    ];
    openRouterFreeModelsLoaded = true;
    updateOpenRouterModelSelects();
  }catch(e){
    // Keep the built-in fallback list if the public model list cannot be fetched.
  }finally{
    openRouterFreeModelsLoading = false;
  }
}
function rankFreeModel(id){
  const s = String(id || "").toLowerCase();
  const exact = FREE_MODEL_FALLBACKS.indexOf(id);
  if(exact >= 0) return exact;
  if(s.includes("glm") || s.includes("gemma")) return 20;
  if(s.includes("nemotron")) return 30;
  if(s.includes("poolside") || s.includes("laguna")) return 40;
  if(s.includes("deepseek") || s.includes("qwen") || s.includes("mistral") || s.includes("kimi")) return 50;
  if(s.includes("llama")) return 60;
  return 80;
}
function updateOpenRouterModelSelects(){
  settingsMembers.forEach((ai,i)=>{
    const model = document.getElementById(`model_${i}`);
    const custom = document.getElementById(`custom_model_${i}`);
    if(!model) return;
    const selected = model.value === CUSTOM_MODEL ? (custom ? custom.value.trim() : "") : model.value;
    model.innerHTML = modelOptionsHtml("openrouter", selected);
    if(model.value !== CUSTOM_MODEL && custom) custom.value = "";
    syncCustomModelInput(i);
  });
}
function openQuickEdit(aiId){
  const g = activeGroup();
  const ai = aiForSender(g, aiId);
  if(!ai) return;
  quickEditId = aiId;
  document.getElementById("qeTitle").textContent = `${ai.emoji} ${ai.name}`;
  document.getElementById("qeName").value = ai.name;
  document.getElementById("qeEmoji").value = ai.emoji;
  document.getElementById("qePrompt").value = ai.prompt;
  const sel = document.getElementById("qePersona");
  sel.innerHTML = personaOptionsHtml();
  sel.value = "";
  document.getElementById("quickEditOverlay").classList.add("open");
  document.getElementById("qePrompt").focus();
}
function qePersonaPicked(){
  const i = document.getElementById("qePersona").value;
  if(i === "") return;
  const p = PERSONAS[+i];
  document.getElementById("qeName").value = p.name;
  document.getElementById("qeEmoji").value = p.emoji;
  document.getElementById("qePrompt").value = p.prompt;
}
function closeQuickEdit(){
  document.getElementById("quickEditOverlay").classList.remove("open");
  quickEditId = null;
}
function saveQuickEdit(){
  const g = activeGroup();
  const ai = aiById(g, quickEditId);
  if(ai){
    ai.name = document.getElementById("qeName").value.trim() || ai.name;
    ai.emoji = document.getElementById("qeEmoji").value.trim() || ai.emoji;
    ai.prompt = document.getElementById("qePrompt").value.trim() || ai.prompt;
    saveState();
    renderAll();
    pushMsg(g, "system", `${ai.emoji} ${ai.name}: ${t("personalityUpdated")}`);
  }
  if(!ai){
    const p = personaById(quickEditId);
    if(p){
      if(!g.personaOverrides) g.personaOverrides = {};
      g.personaOverrides[quickEditId] = {
        name: document.getElementById("qeName").value.trim() || p.name,
        emoji: document.getElementById("qeEmoji").value.trim() || p.emoji,
        prompt: document.getElementById("qePrompt").value.trim() || p.prompt
      };
      const updated = personaResponder(p, g.personaOverrides[quickEditId]);
      saveState();
      renderAll();
      pushMsg(g, "system", `${updated.emoji} ${updated.name}: ${t("personalityUpdated")}`);
    }
  }
  closeQuickEdit();
}

/* ---------------- settings ---------------- */
let settingsMembers = []; // working copy while modal is open
let settingsNewGroupId = null;
let settingsPreviousGroupId = null;

function openSettings(isNew, previousGroupId){
  const g = activeGroup();
  settingsNewGroupId = isNew ? g.id : null;
  settingsPreviousGroupId = isNew ? previousGroupId : null;
  const title = document.getElementById("settingsTitle");
  const saveBtn = document.getElementById("settingsSaveBtn");
  if(title) title.textContent = isNew ? t("buildSquadTitle") : t("settingsTitle");
  if(saveBtn) saveBtn.textContent = isNew ? t("createSquad") : t("save");
  document.getElementById("cfgGroupName").value = g.name;
  document.getElementById("cfgGroupEmoji").value = g.emoji || "🤖";
  document.getElementById("cfgUserName").value = getUserName();
  document.getElementById("cfgCtx").value = g.ctx;
  document.getElementById("cfgMode").value = g.mode || "normal";
  document.getElementById("cfgAmbient").checked = !!g.ambient;
  document.getElementById("cfgLen").value = groupLengthBias(g);
  document.getElementById("cfgTemp").value = groupTemperature(g).toFixed(1);
  updateTuneLabels();
  updateKeyUi();
  settingsMembers = JSON.parse(JSON.stringify(g.ais));
  renderMemberCards();
  refreshOpenRouterFreeModels();
  updateFileStatus();
  document.getElementById("settingsOverlay").classList.add("open");
}
function closeSettings(){
  document.getElementById("settingsOverlay").classList.remove("open");
  if(settingsNewGroupId){
    state.groups = state.groups.filter(g=>g.id !== settingsNewGroupId);
    if(settingsPreviousGroupId && state.groups.some(g=>g.id === settingsPreviousGroupId)){
      state.activeGroupId = settingsPreviousGroupId;
    }else if(state.groups.length){
      state.activeGroupId = state.groups[0].id;
    }
    saveState();
    renderAll();
  }
  settingsNewGroupId = null;
  settingsPreviousGroupId = null;
}
function updateTuneLabels(){
  const len = document.getElementById("cfgLen");
  const lenOut = document.getElementById("cfgLenOut");
  const temp = document.getElementById("cfgTemp");
  const tempOut = document.getElementById("cfgTempOut");
  if(len && lenOut){
    const v = parseInt(len.value, 10) || 0;
    lenOut.textContent = v > 0 ? `+${v}` : String(v);
  }
  if(temp && tempOut) tempOut.textContent = Number(temp.value).toFixed(1);
}

function renderMemberCards(){
  const wrap = document.getElementById("aiCards");
  wrap.innerHTML = "";
  settingsMembers.forEach((ai,i)=>{
    ai.provider = "openrouter";
    ai.key = getOpenRouterKey();
    const modelOpts = modelOptionsHtml("openrouter", ai.model || DEFAULT_MODEL);
    const modelIsCustom = !providerModels("openrouter").some(m=>m.id === ai.model);
    const muted = !!ai.muted;
    const removeButton = settingsMembers.length > 1
      ? `<button class="mini-btn" title="${esc(t("removePerson"))}" aria-label="${esc(t("removePerson"))}: ${esc(ai.name)}" onclick="removeMemberCard(${i})">✕</button>`
      : `<span></span>`;
    const card = document.createElement("div");
    card.className = "person-card";
    card.innerHTML = `
      <div class="person-picker">
        <div class="persona-field">
          <label>${esc(t("personality"))}</label>
          <select id="persona_${i}" onchange="personaPicked(${i})">${personaOptionsHtml()}</select>
        </div>
        <div>
          <label>${esc(t("emoji"))}</label>
          <input type="text" class="emoji-in" id="emoji_${i}" value="${esc(ai.emoji)}" maxlength="4">
        </div>
        <div>
          <label>${esc(t("name"))}</label>
          <input type="text" id="name_${i}" value="${esc(ai.name)}">
        </div>
        ${removeButton}
      </div>
      <span class="ready-badge">✓ ${esc(t("freeModelReady"))}</span>
      <details class="member-advanced">
        <summary>${esc(t("advancedFor"))} ${esc(ai.name)}</summary>
        <div class="mute-row">
          <span>${esc(muted ? t("mutedState") : t("activeState"))}</span>
          <button class="btn ghost small" onclick="toggleSettingsMute(${i})">${esc(muted ? t("unmute") : t("mute"))}</button>
        </div>
        <div>
          <label>${esc(t("model"))}</label>
          <select id="model_${i}" onchange="modelPicked(${i})">${modelOpts}</select>
          <input type="text" id="custom_model_${i}" value="${modelIsCustom ? esc(ai.model) : ""}" placeholder="provider/model-id" style="display:${modelIsCustom ? "block" : "none"};margin-top:6px;">
        </div>
        <label>${esc(t("personalityPrompt"))}</label>
        <textarea id="prompt_${i}">${esc(ai.prompt)}</textarea>
      </details>
    `;
    wrap.appendChild(card);
  });
}
function personaPicked(i){
  const v = document.getElementById(`persona_${i}`).value;
  if(v === "") return;
  const p = PERSONAS[+v];
  document.getElementById(`emoji_${i}`).value = p.emoji;
  document.getElementById(`name_${i}`).value = p.name;
  document.getElementById(`prompt_${i}`).value = p.prompt;
}
function toggleSettingsMute(i){
  readMemberCards();
  if(!settingsMembers[i]) return;
  settingsMembers[i].muted = !settingsMembers[i].muted;
  renderMemberCards();
}
function readMemberCards(){
  settingsMembers.forEach((ai,i)=>{
    ai.emoji  = document.getElementById(`emoji_${i}`).value.trim() || "🤖";
    ai.name   = document.getElementById(`name_${i}`).value.trim() || ("AI " + (i+1));
    ai.provider = "openrouter";
    const modelChoice = document.getElementById(`model_${i}`).value;
    ai.model = modelChoice === CUSTOM_MODEL
      ? document.getElementById(`custom_model_${i}`).value.trim()
      : modelChoice;
    if(!ai.model) ai.model = DEFAULT_MODEL;
    ai.key = getOpenRouterKey();
    ai.prompt = document.getElementById(`prompt_${i}`).value.trim();
  });
}
function addMemberCard(){
  readMemberCards();
  const taken = new Set(settingsMembers.map(a=>a.name.toLowerCase()));
  const free = PERSONAS.filter(p=>!taken.has(p.name.toLowerCase()));
  const p = free.length ? free[Math.floor(Math.random()*free.length)] : null;
  settingsMembers.push({
    id: uid(),
    name: p ? p.name : "New AI",
    emoji: p ? p.emoji : "🤖",
    ...openRouterConfig(),
    model: recommendedFreeModel(settingsMembers.length),
    prompt: p ? p.prompt : "You are a new member of the group. Pick a vibe and stick to it."
  });
  renderMemberCards();
}
function removeMemberCard(i){
  readMemberCards();
  settingsMembers.splice(i,1);
  renderMemberCards();
}

async function saveSettings(){
  readMemberCards();
  const g = activeGroup();
  const wasNewGroup = !!settingsNewGroupId;
  g.name = document.getElementById("cfgGroupName").value.trim() || "AI Squad";
  g.emoji = document.getElementById("cfgGroupEmoji").value.trim() || "🤖";
  g.ctx = Math.max(4, parseInt(document.getElementById("cfgCtx").value,10) || 24);
  g.mode = document.getElementById("cfgMode").value;
  g.ambient = document.getElementById("cfgAmbient").checked;
  g.lenBias = Math.max(-5, Math.min(5, parseInt(document.getElementById("cfgLen").value,10) || 0));
  g.temperature = Math.max(0.2, Math.min(1.6, Number(document.getElementById("cfgTemp").value) || 1.0));
  g.ais = settingsMembers;
  setUserName(document.getElementById("cfgUserName").value);
  saveState();
  settingsNewGroupId = null;
  settingsPreviousGroupId = null;
  closeSettings();
  renderAll();
  showToast(t("settingsSaved"));
  if(wasNewGroup) setTimeout(()=>startGroupWelcome(g), 350);
  if(fileHandle){ savePromptsToFile(false); }
}

/* ---------------- prompts file (File System Access API) ---------------- */
let fileHandle = null;
const FS_SUPPORTED = "showOpenFilePicker" in window;

// tiny IndexedDB kv store so the file link survives reloads (Chrome/Edge)
function idb(){
  return new Promise((res, rej)=>{
    const req = indexedDB.open("aiGroupChat", 1);
    req.onupgradeneeded = ()=>req.result.createObjectStore("kv");
    req.onsuccess = ()=>res(req.result);
    req.onerror = ()=>rej(req.error);
  });
}
async function idbSet(k,v){
  const db = await idb();
  return new Promise((res,rej)=>{
    const tx = db.transaction("kv","readwrite");
    tx.objectStore("kv").put(v,k);
    tx.oncomplete = res; tx.onerror = ()=>rej(tx.error);
  });
}
async function idbGet(k){
  const db = await idb();
  return new Promise((res,rej)=>{
    const tx = db.transaction("kv","readonly");
    const rq = tx.objectStore("kv").get(k);
    rq.onsuccess = ()=>res(rq.result); rq.onerror = ()=>rej(rq.error);
  });
}

function updateFileStatus(msg){
  const el = document.getElementById("fileStatus");
  if(msg){ el.textContent = msg; el.className = "file-status linked"; return; }
  if(!FS_SUPPORTED){ el.textContent = t("fileUnsupported"); el.className="file-status"; return; }
  if(fileHandle){ el.textContent = t("linked") + ": " + fileHandle.name; el.className = "file-status linked"; }
  else { el.textContent = t("noFileLinked"); el.className = "file-status"; }
}

function serializePrompts(){
  readMemberCards();
  const g = activeGroup();
  let md = `# Prompts — ${g.name}\n# One section per member. Edit freely; "Load from file" matches by name.\n`;
  for(const ai of settingsMembers){
    md += `\n## ${ai.name}\n${ai.prompt}\n`;
  }
  return md;
}
function applyPromptsMd(md){
  const sections = md.split(/^## +/m).slice(1);
  let applied = 0;
  for(const sec of sections){
    const nl = sec.indexOf("\n");
    const name = (nl===-1 ? sec : sec.slice(0,nl)).trim();
    const body = (nl===-1 ? "" : sec.slice(nl+1)).trim();
    const target = settingsMembers.find(a=>a.name.toLowerCase()===name.toLowerCase());
    if(target && body){ target.prompt = body; applied++; }
  }
  renderMemberCards();
  return applied;
}

async function linkPromptsFile(){
  if(!FS_SUPPORTED){ alert(t("fileUnsupported")); return; }
  try{
    const [h] = await window.showOpenFilePicker({
      types:[{description:"Markdown", accept:{"text/markdown":[".md"], "text/plain":[".txt"]}}]
    });
    fileHandle = h;
    await idbSet("promptsFileHandle", h);
    updateFileStatus();
  }catch(e){ /* user cancelled */ }
}
async function ensurePermission(mode){
  if(!fileHandle) return false;
  const opts = {mode};
  if(await fileHandle.queryPermission(opts) === "granted") return true;
  return (await fileHandle.requestPermission(opts)) === "granted";
}
async function loadPromptsFromFile(){
  if(!fileHandle){ await linkPromptsFile(); }
  if(!fileHandle) return;
  if(!await ensurePermission("read")){ updateFileStatus(t("permissionDenied")); return; }
  const file = await fileHandle.getFile();
  const md = await file.text();
  readMemberCards();
  const n = applyPromptsMd(md);
  updateFileStatus(`${n} ${t("loadedPrompts")} ${fileHandle.name}`);
}
async function savePromptsToFile(interactive){
  if(!FS_SUPPORTED){ if(interactive) exportPromptsDownload(); return; }
  try{
    if(!fileHandle){
      if(!interactive) return;
      fileHandle = await window.showSaveFilePicker({
        suggestedName:"prompts.md",
        types:[{description:"Markdown", accept:{"text/markdown":[".md"]}}]
      });
      await idbSet("promptsFileHandle", fileHandle);
    }
    if(!await ensurePermission("readwrite")){ updateFileStatus(t("permissionDenied")); return; }
    const w = await fileHandle.createWritable();
    await w.write(serializePrompts());
    await w.close();
    updateFileStatus(t("savedTo") + " " + fileHandle.name + " ✓");
  }catch(e){
    if(e && e.name !== "AbortError") updateFileStatus(t("saveFailed") + ": " + e.message);
  }
}
function exportPromptsDownload(){
  const blob = new Blob([serializePrompts()], {type:"text/markdown"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "prompts.md";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- export, share & replay ---------------- */
function openShare(){ document.getElementById("shareOverlay").classList.add("open"); }
function closeShare(){ document.getElementById("shareOverlay").classList.remove("open"); }
function downloadFile(name, text, type){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 0);
}
function exportTranscriptMd(){
  const g = activeGroup();
  const md = transcriptToMarkdown(g, {
    lang: lang(),
    userName: getUserName() || t("you"),
    resolveSender: id=>{ const ai = aiForSender(g, id); return ai ? { name:ai.name, emoji:ai.emoji } : null; },
    formatTime: ts=>new Date(ts).toLocaleString(lang() === "es" ? "es" : "en", { dateStyle:"medium", timeStyle:"short" }),
    engineLabel: isOffline() ? t("offlineBadge") : t("liveBadge")
  });
  downloadFile(`${slugName(g.name) || "squad"}-transcript.md`, md, "text/markdown");
  showToast(t("exportedMd"));
}
function exportSquadJson(){
  const g = activeGroup();
  const includeTranscript = !!document.getElementById("shareIncludeTranscript")?.checked;
  const template = exportSquadTemplate(g, { includeTranscript });
  downloadFile(`${slugName(g.name) || "squad"}.squad.json`, JSON.stringify(template, null, 2) + "\n", "application/json");
  showToast(t("exportedJson"));
}
function importSquadJson(){ document.getElementById("squadImportInput").click(); }
async function onSquadFileChosen(input){
  const file = input.files && input.files[0];
  input.value = "";
  if(!file) return;
  const parsed = parseSquadTemplate(await file.text());
  if(!parsed.ok){
    alert(t("importFailed") + "\n\n" + parsed.errors.slice(0, 8).join("\n"));
    return;
  }
  const g = templateToGroup(parsed.template, uid, ()=>openRouterConfig());
  g.welcomedAt = Date.now();
  state.groups.unshift(g);
  state.activeGroupId = g.id;
  saveState();
  closeShare();
  closeNewGroup();
  renderAll();
  showToast(`${t("imported")}: ${g.emoji} ${g.name}`);
  if(g.messages.length) replayChat();
}
async function replayChat(){
  const g = activeGroup();
  if(isGroupBusy(g)) return;
  closeShare();
  const visible = g.messages.filter(m=>!m.hidden);
  if(!visible.length){ showToast(t("nothingToReplay")); return; }
  const session = { groupId:g.id, count:0 };
  replaying = session;
  busyGroups.add(g.id);
  updateComposerBusy();
  showToast(t("replayStarted"));
  try{
    for(const m of visible){
      if(replaying !== session || state.activeGroupId !== g.id) break;
      const ai = m.sender !== "user" && m.sender !== "system" ? aiForSender(g, m.sender) : null;
      if(ai){ showTyping(ai); await sleepMs(Math.min(1300, 300 + m.text.length * 8)); }
      else await sleepMs(m.sender === "system" ? 250 : 450);
      if(replaying !== session) break;
      session.count++;
      renderMessages();
    }
  }finally{
    if(replaying === session) replaying = null;
    busyGroups.delete(g.id);
    removeTyping();
    renderAll();
  }
}

/* ---------------- first-run setup + ambient chatter ---------------- */
function openSetup(){
  const input = document.getElementById("setupKeyInput");
  if(input) input.value = getOpenRouterKey();
  const nameInput = document.getElementById("setupNameInput");
  if(nameInput) nameInput.value = getUserName();
  document.getElementById("setupOverlay").classList.add("open");
  updateSetupUi();
}
function closeSetup(){
  document.getElementById("setupOverlay").classList.remove("open");
}
function updateSetupUi(){
  const next = document.getElementById("setupNextBtn");
  if(next) next.textContent = t("setupDone");
}
function setupNext(){
  saveSetupKey();
}
function saveSetupKey(){
  const input = document.getElementById("setupKeyInput");
  const key = (input ? input.value : "").trim();
  if(key && !/^sk-or-[A-Za-z0-9_-]/.test(key)){
    alert(t("createKeyError"));
    return;
  }
  setOpenRouterKey(key);   // an empty key switches back to the Offline Simulation Engine
  const nameInput = document.getElementById("setupNameInput");
  if(nameInput) setUserName(nameInput.value);
  closeSetup();
  if(key) setTimeout(checkOpenRouterStartupHealth, 300);
}
async function maybeAmbientChatter(group){
  if(!group || !group.ambient || isGroupBusy(group) || group.mode === "deliberation") return;
  const now = Date.now();
  const last = group.lastAmbientAt || now;
  const hasUserMessage = group.messages.some(m=>m.sender === "user");
  if(!hasUserMessage || now - last < 1000 * 60 * 60 * 6) return;
  group.lastAmbientAt = now;
  saveState();
  const available = activeAis(group);
  if(!available.length) return;
  const shuffled = [...available].sort(()=>Math.random()-0.5);
  const ambient = shuffled.slice(0, Math.min(2, shuffled.length));
  const seed = {id:uid(), sender:"system", text:t("ambientSeed"), ts:Date.now(), hidden:true};
  group.messages.push(seed);
  saveState();
  await runRepliers(group, ambient);
  group.messages = group.messages.filter(m=>m.id !== seed.id);
  saveState();
  renderAll();
}

/* ---------------- boot ---------------- */
function boot(){
  document.getElementById("settingsOverlay").addEventListener("click", e=>{
    if(e.target.id==="settingsOverlay") closeSettings();
  });
  document.getElementById("statusOverlay").addEventListener("click", e=>{
    if(e.target.id==="statusOverlay") closeStatusViewer();
  });
  document.getElementById("newGroupOverlay").addEventListener("click", e=>{
    if(e.target.id==="newGroupOverlay") closeNewGroup();
  });
  document.getElementById("quickEditOverlay").addEventListener("click", e=>{
    if(e.target.id==="quickEditOverlay") closeQuickEdit();
  });
  document.getElementById("setupOverlay").addEventListener("click", e=>{
    if(e.target.id==="setupOverlay") closeSetup();
  });
  document.getElementById("shareOverlay").addEventListener("click", e=>{
    if(e.target.id==="shareOverlay") closeShare();
  });
  (async ()=>{
    try{
      const h = await idbGet("promptsFileHandle");
      if(h) fileHandle = h;
    }catch(e){}
  })();
  document.documentElement.lang = lang();
  applyI18n();
  renderAll();
  if(getOpenRouterKey()){
    setTimeout(checkOpenRouterStartupHealth, 300);
    setTimeout(()=>maybeAmbientChatter(activeGroup()), 900);
  }
}
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", boot);
}else{
  boot();
}
