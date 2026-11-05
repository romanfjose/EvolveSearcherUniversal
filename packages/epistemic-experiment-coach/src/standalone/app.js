// Zero-dependency UI for the standalone build (docs/index.html). Runs only the deterministic coach.
// scripts/build-standalone.mjs inlines this file and src/core/*.mjs into one HTML page.
import { DOMAINS, getDomain, fallbackUnderstanding, fallbackChallenges, fallbackPlan, localReply } from "../core/domains.mjs";
import { OUTCOMES, newJourney, progressIndex, previousPhase, goTo, goBack, setProblem, applyAnalysis, selectHypothesis, clearHypothesis, applyChallenges, selectChallenge, toggleStep, setPrediction, recordOutcome } from "../core/journey.mjs";
import { ledgerFromJourneys, summarize, interpret, calibrationChart, toJSON, toMarkdown } from "../core/calibration.mjs";

const STORE_KEY = "epistemic-coach-v1";
const root = document.getElementById("root");

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
/** Escapes text, then renders `inline code` spans. */
const rich = (value) => esc(value).replace(/`([^`]+)`/g, "<code>$1</code>");
const percent = (value) => (value === null ? "—" : `${Math.round(value * 100)}%`);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { journey: saved.current?.phase ? saved.current : newJourney(), history: Array.isArray(saved.history) ? saved.history : [] };
  } catch { return { journey: newJourney(), history: [] }; }
}

let { journey, history } = load();

function save() {
  if (journey.phase === "complete") {
    const index = history.findIndex((item) => item.id === journey.id);
    history = index < 0 ? [...history, journey] : history.map((item, i) => (i === index ? journey : item));
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ current: journey, history })); } catch { /* private mode: keep in memory */ }
}

function commit(transition, { focus } = {}) {
  journey = transition(journey);
  save();
  render();
  if (focus) root.querySelector(focus)?.focus();
  else window.scrollTo({ top: 0 });
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const chat = () => {
  const done = journey.phase === "complete";
  const messages = journey.chat || [];
  return `<section class="ee-chat">
    <h3>${done ? "What did you notice?" : "Ask while you go"}</h3>
    <p>${done ? "Share anything that came up—a surprise, a feeling, a small win, or something that still felt off." : "No question is too small—tools, timing, substitutions, or getting unstuck."}</p>
    ${messages.length ? `<div class="ee-messages">${messages.map((m) => `<div class="ee-message ${m.role === "user" ? "user" : ""}">${rich(m.content)}</div>`).join("")}</div>` : ""}
    <form class="ee-chat-row" data-form="chat">
      <input class="ee-input" name="message" maxlength="2000" autocomplete="off" placeholder="${done ? "I noticed…" : "What exactly should I do first?"}" aria-label="${done ? "Share what you noticed" : "Ask the coach"}">
      <button class="ee-btn ai">${done ? "Share" : "Ask"}</button>
    </form>
  </section>`;
};

function calibrationPanel() {
  const entries = ledgerFromJourneys(history);
  const s = summarize(entries);
  return `<section class="ee-calibration" aria-labelledby="cal-title">
    <h2 id="cal-title">Calibration ledger</h2>
    <p class="ee-copy">${esc(interpret(s))}</p>
    ${s.n ? `<div class="ee-cal-grid">
      <div>${calibrationChart(entries)}</div>
      <div>
        <dl class="ee-stats">
          <div><dt>Brier score</dt><dd>${s.brier.toFixed(3)}</dd></div>
          <div><dt>Forecasts</dt><dd>${s.n}</dd></div>
          <div><dt>Mean confidence</dt><dd>${percent(s.meanConfidence)}</dd></div>
          <div><dt>Hit rate</dt><dd>${percent(s.baseRate)}</dd></div>
        </dl>
        <div class="ee-actions">
          <button class="ee-btn ghost small" data-act="export-json">Export JSON</button>
          <button class="ee-btn ghost small" data-act="export-md">Export Markdown</button>
        </div>
      </div>
    </div>` : ""}
  </section>`;
}

const views = {
  start: () => `<section class="ee-card">
      <p class="ee-eyebrow">Start with the honest version</p>
      <h1 class="ee-title">What do you want to get better at—or stop avoiding?</h1>
      <p class="ee-copy">No framework to fill in. Say it normally: “I hate cooking,” “I keep avoiding exercise,” or “I want to speak up at work.”</p>
      <textarea class="ee-textarea" data-input="problem" maxlength="3000" aria-label="Describe what you want to improve" placeholder="I hate cooking because it feels like too much work…">${esc(journey.problem)}</textarea>
      <div class="ee-examples" aria-label="Examples">${DOMAINS.map((d) => `<button type="button" class="ee-example" data-act="example" data-id="${d.id}">${esc(d.label)}</button>`).join("")}</div>
      <div class="ee-actions end"><button class="ee-btn ai" data-act="begin">Help me understand it →</button></div>
    </section>
    ${history.length ? `<section class="ee-history"><h2>Previous reality checks</h2>${history.slice().reverse().map((item) => `<div class="ee-history-item">
        <button data-act="open" data-id="${esc(item.id)}"><strong>${esc(item.problem)}</strong><br><small>${esc(item.challenge?.title || "Exploration")}${item.prediction ? ` · forecast ${item.prediction.confidence}%` : ""}</small></button>
        <div class="ee-history-actions"><small>${new Date(item.createdAt).toLocaleDateString()}</small><button class="ee-delete-btn" data-act="delete" data-id="${esc(item.id)}" aria-label="Delete journey" title="Delete journey">✕</button></div>
      </div>`).join("")}</section>${calibrationPanel()}` : ""}`,

  hypotheses: () => `<section class="ee-card ai">
      <p class="ee-eyebrow">A few possible angles</p>
      ${journey.domain && journey.domain !== "generic" ? `<span class="ee-domain">${esc(getDomain(journey.domain).label)}</span>` : ""}
      <h2 class="ee-h2">What sounds most like you?</h2>
      <p class="ee-copy">These are hypotheses, not judgments. Choose the closest one, or explain it in your own words below.</p>
      <div class="ee-reflection">${esc(journey.reflection)}</div>
      <div class="ee-grid">
        ${journey.hypotheses.map((h, i) => `<button class="ee-choice" data-act="hypothesis" data-index="${i}"><strong>${esc(h.title)}</strong><span>${esc(h.explanation)}</span></button>`).join("")}
        <button class="ee-choice" data-act="hypothesis-all"><strong>All of the above</strong><span>More than one of these frictions is contributing.</span></button>
      </div>
      <form class="ee-custom" data-form="custom-hypothesis"><strong>Something else?</strong>
        <div class="ee-custom-row"><input class="ee-input" name="text" maxlength="300" placeholder="Write your own reason…" aria-label="Your own reason"><button class="ee-btn ai">Use this</button></div>
      </form>
      ${chat()}
    </section>`,

  insight: () => `<section class="ee-card ai">
      <p class="ee-eyebrow">Working hypothesis</p>
      <h2 class="ee-h2">${esc(journey.selectedHypothesis.title)}</h2>
      <div class="ee-reflection"><strong>What this could mean: </strong>${esc(journey.selectedHypothesis.explanation)}</div>
      <p class="ee-copy">We do not need to decide whether this is permanently true. A tiny real-world test will give us better evidence.</p>
      <div class="ee-actions">
        <button class="ee-btn reality" data-act="get-challenges">Give me a reality challenge</button>
        <button class="ee-btn ghost" data-act="clear-hypothesis">Choose another angle</button>
      </div>
    </section>${chat()}`,

  challenges: () => `<section class="ee-card reality">
      <p class="ee-eyebrow reality">Reality challenge #1</p>
      <h2 class="ee-h2">Choose the version you would actually do</h2>
      <p class="ee-copy">${esc(journey.challenge_intro || "The easiest option is valid. You can increase the difficulty after you begin.")}</p>
      <div class="ee-grid">${journey.challenges.map((c, i) => `<button class="ee-choice ee-challenge" data-act="challenge" data-index="${i}">
          <strong>${esc(c.title)}</strong>
          <div class="ee-meta"><span class="ee-pill">${esc(c.time)}</span><span class="ee-pill">${esc(c.difficulty)}</span></div>
          <span>${rich(c.why)}</span>
          ${c.falsifier ? `<span class="ee-falsifier-line">Could prove it wrong: ${rich(c.falsifier)}</span>` : ""}
        </button>`).join("")}</div>
      <form class="ee-custom" data-form="custom-challenge"><strong>Already have a better challenge in mind?</strong>
        <div class="ee-custom-row"><input class="ee-input" name="text" maxlength="300" placeholder="Describe your own small test…" aria-label="Your own challenge"><button class="ee-btn reality">Build my plan</button></div>
      </form>
      <div class="ee-actions"><button class="ee-btn ghost" data-act="goto" data-phase="insight">Not yet—talk more</button></div>
    </section>${chat()}`,

  plan: () => {
    const c = journey.challenge;
    const value = journey.prediction?.confidence;
    const checked = journey.checked || [];
    return `<section class="ee-card reality">
      <p class="ee-eyebrow reality">Your tiny experiment</p>
      <h2 class="ee-h2">${esc(c.title)}</h2>
      <div class="ee-meta"><span class="ee-pill">${esc(c.time)}</span><span class="ee-pill">${esc(c.difficulty)}</span></div>
      <div class="ee-success"><b>Minimum success:</b> ${rich(c.minimum_success)}</div>
      ${c.falsifier ? `<div class="ee-falsifier"><b>What would prove the hypothesis wrong:</b> ${rich(c.falsifier)}</div>` : ""}
      ${c.caution ? `<div class="ee-caution">${esc(c.caution)}</div>` : ""}
      <div class="ee-forecast">
        <label for="forecast">Before you start: how likely are you to reach the minimum success?</label>
        <p>Your honest guess, recorded now, is scored against what happens. It builds your calibration ledger.</p>
        <div class="ee-forecast-row">
          <input id="forecast" type="range" min="0" max="100" step="5" value="${value ?? 50}" data-input="forecast" aria-valuetext="${value === undefined ? "Not set" : `${value}%`}">
          <output for="forecast" id="forecast-value">${value === undefined ? "—" : `${value}%`}</output>
        </div>
      </div>
      <details><summary>What you need</summary><ul class="ee-upgrades">${c.materials.map((x) => `<li>${rich(x)}</li>`).join("")}</ul></details>
      <h3>Do this</h3>
      <div>${c.steps.map((step, i) => `<label class="ee-check"><input type="checkbox" data-input="step" data-index="${i}" ${checked.includes(i) ? "checked" : ""}><span>${rich(step)}</span></label>`).join("")}</div>
      <details><summary>Too easy? Optional upgrades</summary><ul class="ee-upgrades">${c.upgrades.map((x) => `<li>${rich(x)}</li>`).join("")}</ul></details>
      <div class="ee-actions">
        <button class="ee-btn green" data-act="goto" data-phase="debrief">I tried it →</button>
        <button class="ee-btn ghost" data-act="goto" data-phase="challenges">Choose an easier option</button>
      </div>
    </section>${chat()}`;
  },

  debrief: () => `<section class="ee-card learn">
      <p class="ee-eyebrow learn">One-question debrief</p>
      <h2 class="ee-h2">How did it go?</h2>
      <p class="ee-copy">No essay and no guilt. What happened is information for the next attempt.</p>
      <div class="ee-grid">${OUTCOMES.map((o) => `<button class="ee-choice" data-act="outcome" data-id="${o.id}"><strong>${esc(o.label)}</strong></button>`).join("")}</div>
      ${chat()}
    </section>`,

  complete: () => `<section class="ee-card learn">
      <p class="ee-eyebrow learn">Reality updated the model</p>
      <h2 class="ee-h2">That counts as progress.</h2>
      <p><strong>What you tested:</strong> ${esc(journey.selectedHypothesis?.title)}</p>
      <p><strong>What happened:</strong> ${esc(journey.outcome?.label)}</p>
      <div class="ee-reflection"><strong>What the evidence suggests: </strong>${esc(journey.learning)}</div>
      <p class="ee-copy">Saved in this browser${journey.prediction ? ", and your forecast is scored in the calibration ledger on the start screen" : ""}.</p>
      <div class="ee-actions"><button class="ee-btn green" data-act="restart">Start another small improvement</button></div>
    </section>${chat()}`,
};

function render() {
  const phase = journey.phase;
  const current = progressIndex(phase);
  root.innerHTML = `<main class="ee-shell">
    <header class="ee-header">
      <button class="ee-brand" data-act="restart"><strong>Clash with Reality</strong><span>Small actions. Better models.</span></button>
    </header>
    ${phase !== "start" ? `<div class="ee-progress" aria-label="Journey progress">
      <div class="${current === 0 ? "active" : "done"}">1 · Understand</div>
      <div class="reality ${current === 1 ? "active" : current > 1 ? "done" : ""}">2 · Try</div>
      <div class="learn ${current === 2 ? "active" : ""}">3 · Reflect</div>
    </div>` : ""}
    ${previousPhase(phase) ? `<button class="ee-back-step" data-act="back">← Back one step</button>` : ""}
    ${views[phase]()}
    <p class="ee-local">Runs entirely in your browser · built-in coach · saved privately in this browser</p>
  </main>`;
}

const actions = {
  example: (el) => commit((j) => setProblem(j, getDomain(el.dataset.id).example), { focus: "[data-act=begin]" }),
  begin: () => {
    const problem = journey.problem.trim();
    if (!problem) return root.querySelector("[data-input=problem]")?.focus();
    commit((j) => (j.analyzedProblem === problem && j.hypotheses?.length ? goTo(j, "hypotheses") : applyAnalysis(j, fallbackUnderstanding(problem))));
  },
  open: (el) => { const item = history.find((h) => h.id === el.dataset.id); if (item) commit(() => item); },
  delete: (el) => {
    if (!confirm("Delete this journey?")) return;
    const id = el.dataset.id;
    history = history.filter((h) => h.id !== id);
    commit((j) => (j.id === id ? newJourney() : j), { focus: "[data-input=problem]" });
  },
  hypothesis: (el) => commit((j) => selectHypothesis(j, j.hypotheses[Number(el.dataset.index)])),
  "hypothesis-all": () => commit((j) => selectHypothesis(j, { id: "all", title: "All of these contribute", explanation: `Several frictions seem active together: ${j.hypotheses.map((h) => h.title.toLowerCase()).join(", ")}. The challenge should reduce more than one source of friction.` })),
  "clear-hypothesis": () => commit(clearHypothesis),
  "get-challenges": () => commit((j) => (j.challenges?.length ? goTo(j, "challenges") : applyChallenges(j, fallbackChallenges(j)))),
  challenge: (el) => commit((j) => selectChallenge(j, fallbackPlan(j.challenges[Number(el.dataset.index)]))),
  goto: (el) => commit((j) => goTo(j, el.dataset.phase)),
  outcome: (el) => commit((j) => recordOutcome(j, el.dataset.id)),
  back: () => commit(goBack),
  restart: () => commit(() => newJourney()),
  "export-json": () => download(`calibration-${new Date().toISOString().slice(0, 10)}.json`, toJSON(ledgerFromJourneys(history)), "application/json"),
  "export-md": () => download(`calibration-${new Date().toISOString().slice(0, 10)}.md`, toMarkdown(ledgerFromJourneys(history)), "text/markdown"),
};

const forms = {
  chat: (text) => {
    commit((j) => ({ ...j, chat: [...(j.chat || []), { role: "user", content: text }] }));
    commit((j) => ({ ...j, chat: [...j.chat, { role: "assistant", content: localReply(j, text) }] }), { focus: "[data-form=chat] input" });
    const list = root.querySelector(".ee-messages");
    if (list) list.scrollTop = list.scrollHeight;
  },
  "custom-hypothesis": (text) => commit((j) => selectHypothesis(j, { id: "custom", title: text, explanation: `Your own explanation: “${text}”. Treat it as the working hypothesis.` })),
  "custom-challenge": (text) => commit((j) => selectChallenge(j, fallbackPlan({ id: `custom-${Date.now()}`, title: text, time: "You decide", difficulty: "Custom", why: "A challenge chosen by you." }))),
};

function setForecast(input) {
  journey = setPrediction(journey, input.value);
  save();
  const value = journey.prediction?.confidence;
  root.querySelector("#forecast-value").textContent = value === undefined ? "—" : `${value}%`;
  input.setAttribute("aria-valuetext", value === undefined ? "Not set" : `${value}%`);
}

root.addEventListener("click", (event) => {
  const el = event.target.closest("[data-act]");
  if (el) actions[el.dataset.act]?.(el);
  else if (event.target.matches("[data-input=forecast]")) setForecast(event.target);
});

root.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = new FormData(event.target).get("message") ?? new FormData(event.target).get("text");
  if (String(text || "").trim()) forms[event.target.dataset.form]?.(String(text).trim());
});

root.addEventListener("input", (event) => {
  const kind = event.target.dataset.input;
  if (kind === "problem") { journey = setProblem(journey, event.target.value); save(); }
  if (kind === "forecast") setForecast(event.target);
});

root.addEventListener("change", (event) => {
  if (event.target.dataset.input === "step") { journey = toggleStep(journey, Number(event.target.dataset.index)); save(); }
});

render();
