import { useEffect, useMemo, useState } from "react";
import { coachRequest } from "./src/services/llm.js";
import { auth, googleProvider } from "./src/services/firebase-config.js";
import { saveJourney, getUserJourneys, deleteJourney, syncLocalJourneys } from "./src/services/db.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const STORAGE_KEY = "epistemic-coach-v1";

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  button, textarea, input { font: inherit; }
  button { touch-action: manipulation; }

  .ee-root {
    --paper: #f4f2ec;
    --card: #fffdf8;
    --ink: #1e2926;
    --muted: #66716d;
    --line: #d9ddd7;
    --violet: #6254d9;
    --violet-soft: #eeecff;
    --amber: #b76521;
    --amber-soft: #fff1df;
    --green: #2f7653;
    --green-soft: #e8f4ed;
    --serif: Georgia, 'Times New Roman', serif;
    --sans: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    min-height: 100vh;
    background:
      radial-gradient(circle at 12% 0%, rgba(98,84,217,.08), transparent 30rem),
      var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.5;
  }
  .ee-shell { width: min(760px, calc(100% - 28px)); margin: 0 auto; padding: 22px 0 80px; }
  .ee-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 8px 0 24px; }
  .ee-brand { border: 0; background: none; padding: 0; color: var(--ink); cursor: pointer; text-align: left; }
  .ee-brand strong { display: block; font: 700 25px/1.05 var(--serif); }
  .ee-brand span { color: var(--muted); font-size: 12px; }
  .ee-reset { border: 1px solid var(--line); background: rgba(255,255,255,.55); color: var(--muted); padding: 8px 12px; border-radius: 999px; cursor: pointer; }
  .ee-progress { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 24px; }
  .ee-progress div { border-top: 4px solid var(--line); padding-top: 6px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .ee-progress .active, .ee-progress .done { border-color: var(--violet); color: var(--violet); font-weight: 700; }
  .ee-progress .reality.active, .ee-progress .reality.done { border-color: var(--amber); color: var(--amber); }
  .ee-progress .learn.active, .ee-progress .learn.done { border-color: var(--green); color: var(--green); }
  .ee-card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: clamp(20px, 4vw, 32px); box-shadow: 0 12px 35px rgba(30,41,38,.055); margin-bottom: 16px; }
  .ee-card.ai { border-left: 5px solid var(--violet); }
  .ee-card.reality { border-left: 5px solid var(--amber); }
  .ee-card.learn { border-left: 5px solid var(--green); }
  .ee-eyebrow { margin: 0 0 8px; color: var(--violet); text-transform: uppercase; letter-spacing: .1em; font-size: 11px; font-weight: 800; }
  .ee-eyebrow.reality { color: var(--amber); }
  .ee-eyebrow.learn { color: var(--green); }
  .ee-title { margin: 0 0 10px; font: 700 clamp(28px, 6vw, 43px)/1.08 var(--serif); letter-spacing: -.02em; }
  .ee-h2 { margin: 0 0 8px; font: 700 25px/1.15 var(--serif); }
  .ee-copy { margin: 0 0 18px; color: var(--muted); }
  .ee-textarea, .ee-input { width: 100%; border: 1px solid var(--line); border-radius: 13px; background: #fff; color: var(--ink); padding: 14px 15px; outline: 0; }
  .ee-textarea { min-height: 116px; resize: vertical; }
  .ee-textarea:focus, .ee-input:focus { border-color: var(--violet); box-shadow: 0 0 0 3px rgba(98,84,217,.12); }
  .ee-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .ee-actions.end { justify-content: flex-end; }
  .ee-btn { border: 0; border-radius: 11px; background: var(--ink); color: #fff; padding: 11px 16px; font-weight: 750; cursor: pointer; }
  .ee-btn:hover { transform: translateY(-1px); }
  .ee-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
  .ee-btn.ai { background: var(--violet); }
  .ee-btn.reality { background: var(--amber); }
  .ee-btn.green { background: var(--green); }
  .ee-btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .ee-btn.small { padding: 8px 11px; font-size: 13px; }
  .ee-back-step { border: 0; background: none; color: var(--muted); padding: 2px 0; margin: -10px 0 14px; cursor: pointer; font-size: 13px; font-weight: 700; }
  .ee-back-step:hover { color: var(--ink); }
  .ee-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin: 14px 0 4px; }
  .ee-toolbar p { margin: 0; color: var(--muted); font-size: 12px; }
  .ee-custom { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
  .ee-custom strong { display: block; margin-bottom: 8px; }
  .ee-custom-row { display: flex; gap: 8px; }
  .ee-custom-row .ee-input { min-width: 0; }
  .ee-context-note { color: var(--muted); font-size: 12px; margin: 10px 0 0; }
  .ee-grid { display: grid; gap: 10px; margin-top: 16px; }
  .ee-choice { width: 100%; text-align: left; border: 1px solid var(--line); background: #fff; border-radius: 14px; padding: 15px 16px; cursor: pointer; color: var(--ink); }
  .ee-choice:hover, .ee-choice.selected { border-color: var(--violet); background: var(--violet-soft); }
  .ee-choice strong { display: block; margin-bottom: 3px; }
  .ee-choice span { color: var(--muted); font-size: 14px; }
  .ee-reflection { padding: 16px; border-radius: 13px; background: var(--violet-soft); margin: 14px 0; }
  .ee-reflection strong { color: var(--violet); }
  .ee-challenge { position: relative; }
  .ee-meta { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 14px; }
  .ee-pill { border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; color: var(--muted); background: #fff; font-size: 12px; }
  .ee-success { background: var(--amber-soft); padding: 13px 14px; border-radius: 12px; margin: 12px 0; }
  .ee-success b { color: var(--amber); }
  .ee-list { list-style: none; padding: 0; margin: 14px 0; counter-reset: steps; }
  .ee-list li { counter-increment: steps; display: grid; grid-template-columns: 31px 1fr; gap: 10px; padding: 9px 0; border-bottom: 1px dashed var(--line); }
  .ee-list li::before { content: counter(steps); display: grid; place-items: center; width: 27px; height: 27px; background: var(--amber-soft); color: var(--amber); border-radius: 50%; font-size: 12px; font-weight: 800; }
  .ee-check { display: flex; gap: 11px; align-items: flex-start; padding: 10px 0; border-bottom: 1px dashed var(--line); cursor: pointer; }
  .ee-check input { margin-top: 4px; accent-color: var(--green); width: 17px; height: 17px; }
  details { margin-top: 15px; border: 1px solid var(--line); border-radius: 12px; padding: 11px 13px; }
  summary { cursor: pointer; font-weight: 700; }
  .ee-upgrades { margin: 10px 0 2px; padding-left: 20px; color: var(--muted); }
  .ee-chat { background: rgba(255,255,255,.65); border: 1px solid var(--line); border-radius: 18px; padding: 18px; margin-top: 16px; }
  .ee-chat h3 { margin: 0 0 3px; font: 700 18px var(--serif); }
  .ee-chat > p { margin: 0 0 13px; color: var(--muted); font-size: 13px; }
  .ee-messages { display: grid; gap: 8px; max-height: 310px; overflow: auto; margin-bottom: 11px; }
  .ee-message { width: fit-content; max-width: 88%; border-radius: 13px; padding: 10px 12px; font-size: 14px; background: var(--violet-soft); }
  .ee-message.user { margin-left: auto; background: var(--ink); color: #fff; }
  .ee-chat-row { display: flex; gap: 8px; }
  .ee-chat-row .ee-input { min-width: 0; }
  .ee-error { background: #fbe9e7; color: #9d322b; padding: 11px 13px; border-radius: 11px; margin: 12px 0; font-size: 13px; }
  .ee-history { margin-top: 30px; }
  .ee-history h2 { font: 700 20px var(--serif); }
  .ee-history-item { display: flex; justify-content: space-between; gap: 15px; align-items: center; padding: 13px 0; border-bottom: 1px solid var(--line); }
  .ee-history-item button { border: 0; background: none; padding: 0; text-align: left; color: var(--ink); cursor: pointer; }
  .ee-history-item small { color: var(--muted); }
  .ee-local { color: var(--muted); font-size: 11px; text-align: center; margin-top: 18px; }
  @media (max-width: 520px) { .ee-shell { width: min(100% - 20px, 760px); } .ee-card { border-radius: 15px; } .ee-chat-row, .ee-custom-row { align-items: stretch; } }

  /* Auth and Settings styles */
  .ee-header-right { display: flex; align-items: center; gap: 12px; }
  .ee-header-btn { border: 1px solid var(--line); background: rgba(255,255,255,.55); color: var(--ink); padding: 8px 14px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .ee-header-btn:hover { background: rgba(255,255,255,.9); border-color: var(--violet); }
  .ee-user-info { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--ink); }
  .ee-avatar { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); }

  /* Drawer / Modal Container */
  .ee-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(30,41,38,.4); backdrop-filter: blur(4px); z-index: 1000; display: flex; justify-content: flex-end; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
  .ee-overlay.open { opacity: 1; pointer-events: auto; }
  
  .ee-drawer { width: 100%; max-width: 420px; height: 100%; background: var(--card); box-shadow: -8px 0 35px rgba(30,41,38,.15); padding: 32px; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); overflow-y: auto; }
  .ee-overlay.open .ee-drawer { transform: translateX(0); }

  .ee-drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .ee-drawer-title { font: 700 24px var(--serif); margin: 0; }
  .ee-drawer-close { border: 0; background: none; font-size: 28px; line-height: 1; cursor: pointer; color: var(--muted); padding: 4px; }
  .ee-drawer-close:hover { color: var(--ink); }
  
  .ee-form-group { margin-bottom: 20px; }
  .ee-form-group label { display: block; font-weight: 700; font-size: 14px; margin-bottom: 8px; }
  .ee-form-group select, .ee-form-group input { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; font: inherit; background: #fff; outline: 0; }
  .ee-form-group select:focus, .ee-form-group input:focus { border-color: var(--violet); box-shadow: 0 0 0 3px rgba(98,84,217,.12); }
  
  .ee-form-help { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.4; }
  .ee-form-help a { color: var(--violet); text-decoration: none; font-weight: 600; }
  .ee-form-help a:hover { text-decoration: underline; }

  /* Key status indicator */
  .ee-key-status { font-size: 11px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; margin-top: 8px; font-weight: 700; width: fit-content; }
  .ee-key-status.missing { background: #fbe9e7; color: #9d322b; }
  .ee-key-status.configured { background: var(--green-soft); color: var(--green); }

  /* Delete button for history items */
  .ee-history-actions { display: flex; align-items: center; gap: 10px; }
  .ee-delete-btn { border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 12px; padding: 6px; border-radius: 6px; display: grid; place-items: center; transition: all 0.2s; }
  .ee-delete-btn:hover { color: #9d322b; background: #fbe9e7; }
`;

const cookingFallback = {
  reflection: "Cooking can feel like one task, but it is really a pile of decisions: what to buy, which tools to use, timing, cleanup, and the risk that the result is disappointing. Let's find the part creating the most resistance for you.",
  hypotheses: [
    { id: "uncertainty", title: "I don't really know how", explanation: "Every step creates a new question, so beginning feels risky." },
    { id: "friction", title: "It takes too much effort", explanation: "Planning, shopping, cooking, and cleaning seem larger than the meal is worth." },
    { id: "payoff", title: "The result isn't worth it", explanation: "Convenience feels more valuable than the money or skill you might gain." },
    { id: "failure", title: "My food usually turns out badly", explanation: "Past attempts taught you to expect wasted time or disappointing food." },
  ],
  challenge_intro: "We can test whether cooking still feels bad when the decisions and difficulty are stripped away.",
  challenges: [
    {
      id: "pasta", title: "Pasta with ready-made sauce", time: "15–20 min", difficulty: "Very easy",
      why: "One pot, familiar ingredients, and almost no timing coordination.",
      minimum_success: "Serve yourself one hot, edible plate. It does not need to be impressive.",
      materials: ["Pasta", "Ready-made tomato sauce", "Salt", "A pot", "A strainer or pot lid"],
      steps: ["Fill a pot about two-thirds with water.", "Heat it on high until the water bubbles strongly.", "Add a pinch of salt and the pasta.", "Set a timer for the time printed on the pasta package.", "Stir once or twice so it does not stick.", "Carefully drain the water.", "Put the pasta on a plate and add the ready-made sauce.", "Taste it. You cooked a meal."],
      upgrades: ["Warm the sauce in a second small pot.", "Add grated cheese or canned vegetables.", "Make a simple tomato sauce next time."],
      success_signals: ["You started", "You served a hot meal", "You learned one thing for next time"],
    },
    {
      id: "soup", title: "Instant soup plus toast", time: "8–12 min", difficulty: "Almost effortless",
      why: "A tiny win for a day when even pasta feels like too much.",
      minimum_success: "Make the soup safely and eat some of it.",
      materials: ["Instant soup", "Water", "A pot or microwave-safe bowl", "Bread (optional)"],
      steps: ["Read the water amount on the package.", "Measure that amount into a pot or microwave-safe bowl.", "Heat the water as directed on the package.", "Add the soup mix and stir.", "Cook for the package time.", "Let it cool for one minute, then taste it.", "Toast bread if you want something more filling."],
      upgrades: ["Add frozen vegetables.", "Add an egg while the soup simmers.", "Try a basic homemade soup later."],
      success_signals: ["You made food instead of skipping", "It took under 15 minutes", "Cleanup stayed small"],
    },
    {
      id: "milanesa", title: "Milanesa with instant mash", time: "20–25 min", difficulty: "Easy",
      why: "It feels like a complete meal while keeping preparation simple.",
      minimum_success: "Cook the milanesa through and prepare the mash from its package directions.",
      materials: ["Prepared milanesa", "Instant mashed potatoes", "Oil or an oven/air fryer", "Water or milk as directed"],
      steps: ["Choose the cooking method printed on the milanesa package.", "Start heating the oven, air fryer, or pan as directed.", "Cook the milanesa for the package time, turning it if directed.", "Prepare the instant mash by following its water or milk measurements.", "Check that the milanesa is hot and fully cooked in the center.", "Put both on a plate and eat."],
      upgrades: ["Add a tomato salad.", "Make mashed potatoes from fresh potatoes.", "Bread your own milanesa another day."],
      success_signals: ["You coordinated two simple components", "The center was fully cooked", "You produced a complete plate"],
    },
  ],
};

function genericFallback(problem) {
  const subject = problem.trim() || "this";
  return {
    reflection: `“${subject}” may contain several different obstacles. Picking the closest one gives us enough information to try a small reality test without overanalyzing it.`,
    hypotheses: [
      { id: "unclear", title: "I don't know where to start", explanation: "The first useful action is not obvious yet." },
      { id: "effort", title: "It feels like too much effort", explanation: "The expected cost is larger than the expected payoff." },
      { id: "skill", title: "I don't feel capable yet", explanation: "Uncertainty and fear of doing it badly create resistance." },
      { id: "meaning", title: "I don't see enough value in it", explanation: "The reason to act is not personally compelling." },
    ],
    challenge_intro: "Let's replace speculation with one small, reversible attempt.",
    challenges: [
      {
        id: "tiny", title: "The ten-minute version", time: "10 min", difficulty: "Very easy",
        why: "Starting produces better information than planning the perfect attempt.",
        minimum_success: "Spend ten focused minutes doing the smallest real version of the activity.",
        materials: ["A ten-minute timer", "Only the minimum item needed to begin"],
        steps: ["Define the smallest visible result you can make.", "Remove anything you do not need for that result.", "Set a timer for ten minutes.", "Begin before trying to feel ready.", "Stop when the timer rings.", "Notice what was easier or harder than expected."],
        upgrades: ["Continue for another ten minutes.", "Repeat tomorrow with one improvement."],
        success_signals: ["You began", "You produced new evidence", "You found the next obstacle"],
      },
      {
        id: "observe", title: "Watch one real example", time: "10–15 min", difficulty: "Easy",
        why: "A concrete example can expose what you do not yet know.",
        minimum_success: "Observe one person or example and write down three things you notice.",
        materials: ["A real example", "Notes"],
        steps: ["Find one credible example of the activity being done.", "Watch without trying to master everything.", "Write down three specific actions you observe.", "Circle the easiest action to copy.", "Try only that action once."],
        upgrades: ["Compare a second example.", "Ask someone why they chose that approach."],
        success_signals: ["You noticed concrete behavior", "You identified one copyable action"],
      },
      {
        id: "setup", title: "Prepare tomorrow's first step", time: "5 min", difficulty: "Almost effortless",
        why: "Removing setup friction makes later action more likely.",
        minimum_success: "Make the first action possible without another decision.",
        materials: ["Whatever the first action requires"],
        steps: ["Choose a specific time and place.", "Put the needed item where you will see it.", "Write the first physical action on a note.", "Decide what counts as done after five minutes."],
        upgrades: ["Do the first two minutes now.", "Invite someone to join or check in."],
        success_signals: ["Tomorrow's starting point is visible", "No preparation decision remains"],
      },
    ],
  };
}

function fallbackFor(problem) {
  return /cook|cocina|comida|meal|food|fideo|pasta/i.test(problem) ? cookingFallback : genericFallback(problem);
}

function fallbackPlan(problem, challenge) {
  const known = fallbackFor(problem).challenges.find((item) => item.id === challenge.id || item.title === challenge.title);
  if (known) return { ...challenge, ...known };
  return {
    ...challenge,
    minimum_success: `Try the smallest real version of “${challenge.title}” for ten minutes. Finishing perfectly is not required.`,
    materials: ["Only what is necessary to begin", "A ten-minute timer"],
    steps: ["Name the smallest visible result.", "Remove anything that is not needed for that result.", "Prepare the first item you need.", "Set a timer for ten minutes.", "Begin before trying to feel ready.", "Stop when the timer rings and notice what happened."],
    upgrades: ["Continue for ten more minutes.", "Repeat once with one improvement."],
    success_signals: ["You began", "You learned where the real friction appears"],
  };
}

function newJourney() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, phase: "start", problem: "", chat: [], checked: [], createdAt: Date.now(), source: "local" };
}

function progressIndex(phase) {
  if (["start", "hypotheses", "insight"].includes(phase)) return 0;
  if (["challenges", "plan"].includes(phase)) return 1;
  return 2;
}

function Progress({ phase }) {
  const current = progressIndex(phase);
  return <div className="ee-progress" aria-label="Journey progress">
    <div className={current === 0 ? "active" : "done"}>1 · Understand</div>
    <div className={`reality ${current === 1 ? "active" : current > 1 ? "done" : ""}`}>2 · Try</div>
    <div className={`learn ${current === 2 ? "active" : ""}`}>3 · Reflect</div>
  </div>;
}

function Chat({ journey, update }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isComplete = journey.phase === "complete";
  const send = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const nextChat = [...(journey.chat || []), { role: "user", content: text }];
    update({ chat: nextChat });
    setMessage("");
    setBusy(true);
    let answer;
    try {
      const data = await coachRequest({ action: "chat", journey: { ...journey, chat: nextChat }, message: text });
      answer = data.message;
    } catch {
      const challenge = journey.challenge;
      if (isComplete) answer = "That sounds worth noticing. What you felt and what surprised you are part of the evidence too—you can carry that into the next attempt without needing to turn it into a perfect lesson.";
      else if (/pasta|fideo|noodle/i.test(text)) answer = "Use any dried pasta you like. The package cooking time is more reliable than a universal timer because shapes and brands vary.";
      else if (/water|agua/i.test(text)) answer = "Use enough water for the food to move freely. For pasta, a pot about two-thirds full is a simple beginner rule—leave room so it cannot boil over.";
      else if (/easier|simple|fácil|facil/i.test(text)) answer = "Make the minimum success smaller: prepare only one serving and use premade ingredients. Completing the loop matters more than making it impressive.";
      else answer = challenge ? `For “${challenge.title},” stay with the minimum-success version first. Tell me the exact step that feels unclear and I’ll make only that step more concrete.` : "Tell me what part feels most uncertain or annoying. We can make that one part smaller before choosing a challenge.";
    }
    update({ chat: [...nextChat, { role: "assistant", content: answer }] });
    setBusy(false);
  };
  return <section className="ee-chat">
    <h3>{isComplete ? "What did you notice?" : "Ask while you go"}</h3>
    <p>{isComplete ? "Share anything that came up—a surprise, a feeling, a small win, or something that still felt off." : "No question is too small—ingredients, tools, timing, substitutions, or getting unstuck."}</p>
    {(journey.chat || []).length > 0 && <div className="ee-messages">
      {journey.chat.map((item, index) => <div key={index} className={`ee-message ${item.role === "user" ? "user" : ""}`}>{item.content}</div>)}
      {busy && <div className="ee-message">Thinking…</div>}
    </div>}
    <form className="ee-chat-row" onSubmit={send}>
      <input className="ee-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={isComplete ? "I noticed…" : "What type of pasta should I use?"} aria-label={isComplete ? "Share what you noticed" : "Ask the coach"} />
      <button className="ee-btn ai" disabled={!message.trim() || busy}>{isComplete ? "Share" : "Ask"}</button>
    </form>
  </section>;
}

function Start({ journey, history, update, openJourney, onDeleteJourney }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const begin = async () => {
    if (!journey.problem.trim() || busy) return;
    const problem = journey.problem.trim();
    if (journey.analyzedProblem === problem && journey.hypotheses?.length) {
      update({ phase: "hypotheses" });
      return;
    }
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "understand", problem, journey }); }
    catch (e) { result = fallbackFor(journey.problem); source = "local"; setError(`${e.message}. I loaded the built-in coach so you can keep going.`); }
    update({ reflection: result.reflection, hypotheses: result.hypotheses, analyzedProblem: problem, selectedHypothesis: null, challenges: [], challenge: null, source, phase: "hypotheses" });
    setBusy(false);
  };
  return <>
    <section className="ee-card">
      <p className="ee-eyebrow">Start with the honest version</p>
      <h1 className="ee-title">What do you want to get better at—or stop avoiding?</h1>
      <p className="ee-copy">No framework to fill in. Say it normally: “I hate cooking,” “I keep avoiding exercise,” or “I want to speak up at work.”</p>
      <textarea className="ee-textarea" value={journey.problem} onChange={(e) => update({ problem: e.target.value })} placeholder="I hate cooking because it feels like too much work…" autoFocus />
      {error && <div className="ee-error">{error}</div>}
      <div className="ee-actions end"><button className="ee-btn ai" onClick={begin} disabled={!journey.problem.trim() || busy}>{busy ? "Finding a useful angle…" : "Help me understand it →"}</button></div>
    </section>
    {history.length > 0 && <section className="ee-history">
      <h2>Previous reality checks</h2>
      {history.slice().reverse().map((item) => <div className="ee-history-item" key={item.id}>
        <button onClick={() => openJourney(item)}><strong>{item.problem}</strong><br/><small>{item.challenge?.title || "Exploration"}</small></button>
        <div className="ee-history-actions">
          <small>{new Date(item.createdAt).toLocaleDateString()}</small>
          {onDeleteJourney && (
            <button className="ee-delete-btn" onClick={(e) => onDeleteJourney(item.id, e)} title="Delete journey" aria-label="Delete journey">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          )}
        </div>
      </div>)}
    </section>}
  </>;
}

function Hypotheses({ journey, update }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = (item) => update({ selectedHypothesis: item, challenges: [], challenge: null, phase: "insight" });
  const refresh = async () => {
    if (busy) return;
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "understand", problem: journey.problem, journey }); }
    catch (e) { result = fallbackFor(journey.problem); source = "local"; setError(`${e.message}. Showing built-in alternatives instead.`); }
    update({ reflection: result.reflection, hypotheses: result.hypotheses, selectedHypothesis: null, challenges: [], challenge: null, source });
    setBusy(false);
  };
  const all = () => choose({ id: "all", title: "All of these contribute", explanation: `Several frictions seem active together: ${journey.hypotheses.map((item) => item.title.toLowerCase()).join(", ")}. The challenge should reduce more than one source of friction.` });
  const useCustom = (event) => {
    event.preventDefault();
    if (!custom.trim()) return;
    choose({ id: "custom", title: custom.trim(), explanation: `The user's own explanation is: “${custom.trim()}”. Treat this as the primary working hypothesis.` });
  };
  return <section className="ee-card ai">
    <p className="ee-eyebrow">A few possible angles</p>
    <h2 className="ee-h2">What sounds most like you?</h2>
    <p className="ee-copy">These are hypotheses, not judgments. Choose the closest one, or explain it in your own words below.</p>
    <div className="ee-reflection">{journey.reflection}</div>
    <div className="ee-toolbar"><p>Not seeing the right options?</p><button className="ee-btn ghost small" onClick={refresh} disabled={busy}>{busy ? "Regenerating…" : "↻ New suggestions"}</button></div>
    {error && <div className="ee-error">{error}</div>}
    <div className="ee-grid">
      {journey.hypotheses?.map((item) => <button className="ee-choice" key={item.id} onClick={() => choose(item)}>
        <strong>{item.title}</strong><span>{item.explanation}</span>
      </button>)}
      <button className="ee-choice" onClick={all}><strong>All of the above</strong><span>More than one of these frictions is contributing.</span></button>
    </div>
    <form className="ee-custom" onSubmit={useCustom}>
      <strong>Something else?</strong>
      <div className="ee-custom-row"><input className="ee-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Write your own reason…"/><button className="ee-btn ai" disabled={!custom.trim()}>Use this</button></div>
    </form>
    <Chat journey={journey} update={update} />
  </section>;
}

function Insight({ journey, update }) {
  const h = journey.selectedHypothesis;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const getChallenges = async () => {
    if (busy) return;
    if (journey.challenges?.length) { update({ phase: "challenges" }); return; }
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "challenges", journey }); }
    catch (e) { result = fallbackFor(journey.problem); source = "local"; setError(`${e.message}. I loaded built-in challenges instead.`); }
    update({ challenge_intro: result.challenge_intro, challenges: result.challenges, challenge: null, source, phase: "challenges" });
    setBusy(false);
  };
  return <>
    <section className="ee-card ai">
      <p className="ee-eyebrow">Working hypothesis</p>
      <h2 className="ee-h2">{h.title}</h2>
      <div className="ee-reflection"><strong>What this could mean: </strong>{h.explanation}</div>
      <p className="ee-copy">We do not need to decide whether this is permanently true. A tiny real-world test will give us better evidence.</p>
      <p className="ee-context-note">Your chat will be included when the next suggestions are generated.</p>
      {error && <div className="ee-error">{error}</div>}
      <div className="ee-actions">
        <button className="ee-btn reality" onClick={getChallenges} disabled={busy}>{busy ? "Creating your next options…" : "Give me a reality challenge"}</button>
        <button className="ee-btn ghost" onClick={() => update({ phase: "hypotheses", selectedHypothesis: null })}>Choose another angle</button>
      </div>
    </section>
    <Chat journey={journey} update={update} />
  </>;
}

function Challenges({ journey, update }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");
  const refresh = async () => {
    if (busy || loadingId) return;
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "challenges", journey }); }
    catch (e) { result = fallbackFor(journey.problem); source = "local"; setError(`${e.message}. Showing built-in alternatives instead.`); }
    update({ challenge_intro: result.challenge_intro, challenges: result.challenges, challenge: null, source });
    setBusy(false);
  };
  const choose = async (item) => {
    if (busy || loadingId) return;
    setLoadingId(item.id); setError("");
    let detail; let source = "ai";
    try { detail = await coachRequest({ action: "plan", journey: { ...journey, challenge: item }, challenge: item }); }
    catch (e) { detail = fallbackPlan(journey.problem, item); source = "local"; setError(`${e.message}. I loaded a built-in plan instead.`); }
    update({ challenge: { ...item, ...detail }, checked: [], source, phase: "plan" });
    setLoadingId("");
  };
  const useCustom = (event) => {
    event.preventDefault();
    if (!custom.trim()) return;
    choose({ id: `custom-${Date.now()}`, title: custom.trim(), time: "You decide", difficulty: "Custom", why: "A challenge chosen by you." });
  };
  return <>
  <section className="ee-card reality">
    <p className="ee-eyebrow reality">Reality challenge #1</p>
    <h2 className="ee-h2">Choose the version you would actually do</h2>
    <p className="ee-copy">{journey.challenge_intro || "The easiest option is valid. You can increase the difficulty after you begin."}</p>
    <div className="ee-toolbar"><p>Your selected reason and chat shaped these.</p><button className="ee-btn ghost small" onClick={refresh} disabled={busy || !!loadingId}>{busy ? "Regenerating…" : "↻ New challenges"}</button></div>
    {error && <div className="ee-error">{error}</div>}
    <div className="ee-grid">
      {journey.challenges?.map((item) => <button className="ee-choice ee-challenge" key={item.id} onClick={() => choose(item)} disabled={!!loadingId || busy}>
        <strong>{loadingId === item.id ? "Building the simple plan…" : item.title}</strong>
        <div className="ee-meta"><span className="ee-pill">{item.time}</span><span className="ee-pill">{item.difficulty}</span></div>
        <span>{item.why}</span>
      </button>)}
    </div>
    <form className="ee-custom" onSubmit={useCustom}>
      <strong>Already have a better challenge in mind?</strong>
      <div className="ee-custom-row"><input className="ee-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Cook milanesas with instant mash…"/><button className="ee-btn reality" disabled={!custom.trim() || !!loadingId}>Build my plan</button></div>
    </form>
    <div className="ee-actions"><button className="ee-btn ghost" onClick={() => update({ phase: "insight" })}>Not yet—talk more</button></div>
  </section>
  <Chat journey={journey} update={update} />
  </>;
}

function Plan({ journey, update }) {
  const c = journey.challenge;
  const checked = journey.checked || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (index) => update({ checked: checked.includes(index) ? checked.filter((i) => i !== index) : [...checked, index] });
  const refresh = async () => {
    if (busy) return;
    setBusy(true); setError("");
    let detail; let source = "ai";
    try { detail = await coachRequest({ action: "plan", journey, challenge: c }); }
    catch (e) { detail = fallbackPlan(journey.problem, c); source = "local"; setError(`${e.message}. Showing the built-in plan instead.`); }
    update({ challenge: { ...c, ...detail }, checked: [], source });
    setBusy(false);
  };
  return <>
    <section className="ee-card reality">
      <p className="ee-eyebrow reality">Your tiny experiment</p>
      <h2 className="ee-h2">{c.title}</h2>
      <div className="ee-meta"><span className="ee-pill">{c.time}</span><span className="ee-pill">{c.difficulty}</span></div>
      <div className="ee-toolbar"><p>The detailed plan uses your conversation context.</p><button className="ee-btn ghost small" onClick={refresh} disabled={busy}>{busy ? "Rebuilding…" : "↻ Redo this plan"}</button></div>
      {error && <div className="ee-error">{error}</div>}
      <div className="ee-success"><b>Minimum success:</b> {c.minimum_success}</div>
      <details><summary>What you need</summary><ul className="ee-upgrades">{c.materials?.map((x) => <li key={x}>{x}</li>)}</ul></details>
      <h3>Do this</h3>
      <div>{c.steps?.map((step, index) => <label className="ee-check" key={index}>
        <input type="checkbox" checked={checked.includes(index)} onChange={() => toggle(index)} /><span>{step}</span>
      </label>)}</div>
      <details><summary>Too easy? Optional upgrades</summary><ul className="ee-upgrades">{c.upgrades?.map((x) => <li key={x}>{x}</li>)}</ul></details>
      <div className="ee-actions">
        <button className="ee-btn green" onClick={() => update({ phase: "debrief" })}>I tried it →</button>
        <button className="ee-btn ghost" onClick={() => update({ phase: "challenges" })}>Choose an easier option</button>
      </div>
    </section>
    <Chat journey={journey} update={update} />
  </>;
}

function Debrief({ journey, update }) {
  const outcomes = [
    ["easier", "Done—it was easier than expected"], ["annoying", "Done—but it was annoying"],
    ["stuck", "I started and got stuck"], ["not-done", "I didn't do it"],
  ];
  const choose = (id, label) => {
    const lessons = {
      easier: "The activity may be less unpleasant when decisions and difficulty are reduced. The next test can add only one optional upgrade.",
      annoying: "You can complete the activity, but some friction remains. The next useful step is identifying whether setup, execution, or cleanup caused it.",
      stuck: "Starting was possible; a specific step became the real constraint. That is useful evidence, and the next challenge should simplify only that step.",
      "not-done": "The proposed action was still too large, badly timed, or not meaningful enough. The next experiment should be smaller rather than demanding more motivation.",
    };
    update({ outcome: { id, label }, learning: lessons[id], completedAt: Date.now(), phase: "complete" });
  };
  return <section className="ee-card learn">
    <p className="ee-eyebrow learn">One-question debrief</p>
    <h2 className="ee-h2">How did it go?</h2>
    <p className="ee-copy">No essay and no guilt. What happened is information for the next attempt.</p>
    <div className="ee-grid">{outcomes.map(([id, label]) => <button className="ee-choice" key={id} onClick={() => choose(id, label)}><strong>{label}</strong></button>)}</div>
    <Chat journey={journey} update={update} />
  </section>;
}

function Complete({ journey, restart, update }) {
  return <>
    <section className="ee-card learn">
      <p className="ee-eyebrow learn">Reality updated the model</p>
      <h2 className="ee-h2">That counts as progress.</h2>
      <p><strong>What you tested:</strong> {journey.selectedHypothesis?.title}</p>
      <p><strong>What happened:</strong> {journey.outcome?.label}</p>
      <div className="ee-reflection"><strong>What the evidence suggests: </strong>{journey.learning}</div>
      <p className="ee-copy">The app saved the experiment and learning automatically. There is no model-refactoring form to complete.</p>
      <div className="ee-actions"><button className="ee-btn green" onClick={restart}>Start another small improvement</button></div>
    </section>
    <Chat journey={journey} update={update} />
  </>;
}

export default function App() {
  const [journey, setJourney] = useState(newJourney);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Auth and Settings State
  const [user, setUser] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState(localStorage.getItem("coach_api_provider") || "gemini");
  const [apiKey, setApiKey] = useState(localStorage.getItem("coach_api_key") || "");
  const [modelName, setModelName] = useState(localStorage.getItem("coach_api_model") || "");

  // Monitor Auth state & sync data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Sync any guest history in localStorage to Firestore on log in
          const localSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
          const localHistory = Array.isArray(localSaved.history) ? localSaved.history : [];
          if (localHistory.length > 0) {
            await syncLocalJourneys(currentUser.uid, localHistory);
            // Clear local history after sync so we don't duplicate on next login
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: localSaved.current || newJourney(), history: [] }));
          }

          // Fetch full database history
          const dbHistory = await getUserJourneys(currentUser.uid);
          setHistory(dbHistory);
        } catch (err) {
          console.error("Error syncing user data:", err);
        }
      } else {
        // Logged out: fallback to localStorage history
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
          if (Array.isArray(saved.history)) setHistory(saved.history);
        } catch {
          setHistory([]);
        }
      }
      setLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  // Save changes to either localStorage or Firestore
  useEffect(() => {
    if (!loaded) return;
    
    const savedIndex = history.findIndex((item) => item.id === journey.id);
    const nextHistory = journey.phase !== "complete"
      ? history
      : savedIndex < 0
        ? [...history, journey]
        : history[savedIndex] === journey
          ? history
          : history.map((item, index) => index === savedIndex ? journey : item);
          
    if (nextHistory !== history) setHistory(nextHistory);

    // Save locally
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: journey, history: user ? [] : nextHistory }));

    // Save to Firestore if authenticated
    if (user) {
      saveJourney(user.uid, journey).catch((err) => console.error("Firestore sync error:", err));
      if (journey.phase === "complete") {
        saveJourney(user.uid, journey).catch((err) => console.error("Firestore sync error:", err));
      }
    }
  }, [journey, history, loaded, user]);

  const update = (patch) => setJourney((current) => ({ ...current, ...patch }));
  const restart = () => setJourney(newJourney());

  // Handle history item deletion
  const handleDeleteJourney = async (id, event) => {
    event.stopPropagation();
    if (!confirm("Are you sure you want to delete this journey?")) return;

    const nextHistory = history.filter((item) => item.id !== id);
    setHistory(nextHistory);

    if (user) {
      try {
        await deleteJourney(id);
      } catch (err) {
        console.error("Failed to delete from Firestore:", err);
      }
    } else {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, history: nextHistory }));
    }
  };

  // Auth helper operations
  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
      alert("Sign in failed: " + err.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Settings drawer operations
  const saveSettings = (newProvider, newKey, newModel) => {
    localStorage.setItem("coach_api_provider", newProvider);
    localStorage.setItem("coach_api_key", newKey);
    localStorage.setItem("coach_api_model", newModel);
    setProvider(newProvider);
    setApiKey(newKey);
    setModelName(newModel);
  };

  const hasApiKey = apiKey.trim().length > 0;

  const phase = journey.phase;
  const previousPhase = { hypotheses: "start", insight: "hypotheses", challenges: "insight", plan: "challenges", debrief: "plan", complete: "debrief" }[phase];
  
  const view = useMemo(() => {
    if (phase === "start") return <Start journey={journey} history={history} update={update} openJourney={setJourney} onDeleteJourney={handleDeleteJourney} />;
    if (phase === "hypotheses") return <Hypotheses journey={journey} update={update} />;
    if (phase === "insight") return <Insight journey={journey} update={update} />;
    if (phase === "challenges") return <Challenges journey={journey} update={update} />;
    if (phase === "plan") return <Plan journey={journey} update={update} />;
    if (phase === "debrief") return <Debrief journey={journey} update={update} />;
    return <Complete journey={journey} restart={restart} update={update} />;
  }, [phase, journey, history]);

  return (
    <div className="ee-root">
      <style>{CSS}</style>
      <main className="ee-shell">
        <header className="ee-header">
          <button className="ee-brand" onClick={restart}>
            <strong>Clash with Reality</strong>
            <span>Small actions. Better models.</span>
          </button>
          
          <div className="ee-header-right">
            {user ? (
              <div className="ee-user-info">
                {user.photoURL && <img src={user.photoURL} className="ee-avatar" alt="Avatar" referrerPolicy="no-referrer" />}
                <span>{user.displayName?.split(" ")[0]}</span>
                <button className="ee-header-btn" onClick={logout}>Sign Out</button>
              </div>
            ) : (
              <button className="ee-header-btn" onClick={login}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                Sign In
              </button>
            )}

            <button className="ee-header-btn" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Settings
            </button>
          </div>
        </header>

        {phase !== "start" && <Progress phase={phase} />}
        {previousPhase && <button className="ee-back-step" onClick={() => update({ phase: previousPhase })}>← Back one step</button>}
        {view}

        <p className="ee-local">
          {user ? `Saved in Google Cloud (Firestore) as ${user.email}` : "Saved privately in this browser"}
          {" · "}
          {hasApiKey ? "AI coach connected" : "Local fallback coach active"}
        </p>
      </main>

      {/* Settings Drawer Overlay */}
      <div className={`ee-overlay ${settingsOpen ? "open" : ""}`} onClick={() => setSettingsOpen(false)}>
        <div className="ee-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="ee-drawer-header">
            <h2 className="ee-drawer-title">Coach Settings</h2>
            <button className="ee-drawer-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">&times;</button>
          </div>

          <div className="ee-form-group">
            <label htmlFor="api-provider">AI Provider</label>
            <select
              id="api-provider"
              value={provider}
              onChange={(e) => saveSettings(e.target.value, apiKey, e.target.value === "gemini" ? "gemini-2.5-flash" : "meta-llama/llama-3.3-70b-instruct")}
            >
              <option value="gemini">Google Gemini API (Free tier available)</option>
              <option value="openrouter">OpenRouter (Multiple models)</option>
            </select>
          </div>

          <div className="ee-form-group">
            <label htmlFor="api-key">API Key</label>
            <input
              id="api-key"
              type="password"
              placeholder="Paste your API key here..."
              value={apiKey}
              onChange={(e) => saveSettings(provider, e.target.value, modelName)}
            />
            {hasApiKey ? (
              <div className="ee-key-status configured">✓ Key Configured</div>
            ) : (
              <div className="ee-key-status missing">✗ No Key Configured</div>
            )}
            
            <p className="ee-form-help">
              {provider === "gemini" ? (
                <>
                  Get a free Gemini API Key from <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
                </>
              ) : (
                <>
                  Get an OpenRouter API Key from <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer">OpenRouter</a>.
                </>
              )}
            </p>
          </div>

          <div className="ee-form-group">
            <label htmlFor="api-model">Model Name</label>
            <input
              id="api-model"
              type="text"
              placeholder={provider === "gemini" ? "gemini-2.5-flash" : "meta-llama/llama-3.3-70b-instruct"}
              value={modelName}
              onChange={(e) => saveSettings(provider, apiKey, e.target.value)}
            />
            <p className="ee-form-help">
              Leave blank to use the default model ({provider === "gemini" ? "gemini-2.5-flash" : "meta-llama/llama-3.3-70b-instruct"}).
            </p>
          </div>
          
          <div className="ee-actions" style={{ marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: "20px" }}>
            <button className="ee-btn green" onClick={() => setSettingsOpen(false)} style={{ width: "100%" }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
