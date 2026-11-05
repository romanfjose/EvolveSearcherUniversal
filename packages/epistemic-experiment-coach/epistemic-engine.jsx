import { useEffect, useMemo, useState } from "react";
import { coachRequest } from "./src/services/llm.js";
import { auth, googleProvider } from "./src/services/firebase-config.js";
import { saveJourney, getUserJourneys, deleteJourney, syncLocalJourneys } from "./src/services/db.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { CSS } from "./src/core/styles.mjs";
import { DOMAINS, getDomain, fallbackUnderstanding, fallbackChallenges, fallbackPlan, localReply } from "./src/core/domains.mjs";
import {
  OUTCOMES, newJourney, progressIndex, previousPhase, goTo, goBack, setProblem, applyAnalysis, selectHypothesis,
  clearHypothesis, applyChallenges, selectChallenge, toggleStep, setPrediction, recordOutcome,
} from "./src/core/journey.mjs";
import { ledgerFromJourneys, summarize, interpret, calibrationChart, toJSON, toMarkdown } from "./src/core/calibration.mjs";

const STORAGE_KEY = "epistemic-coach-v1";

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Renders `inline code` spans inside plain text. */
function Rich({ text }) {
  return String(text ?? "").split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

function Progress({ phase }) {
  const current = progressIndex(phase);
  return <div className="ee-progress" aria-label="Journey progress">
    <div className={current === 0 ? "active" : "done"}>1 · Understand</div>
    <div className={`reality ${current === 1 ? "active" : current > 1 ? "done" : ""}`}>2 · Try</div>
    <div className={`learn ${current === 2 ? "active" : ""}`}>3 · Reflect</div>
  </div>;
}

function Chat({ journey, apply }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isComplete = journey.phase === "complete";
  const send = async (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const nextChat = [...(journey.chat || []), { role: "user", content: text }];
    apply((j) => ({ ...j, chat: [...(j.chat || []), { role: "user", content: text }] }));
    setMessage("");
    setBusy(true);
    let answer;
    try { answer = (await coachRequest({ action: "chat", journey: { ...journey, chat: nextChat }, message: text })).message; }
    catch { answer = localReply(journey, text); }
    apply((j) => ({ ...j, chat: [...(j.chat || []), { role: "assistant", content: answer }] }));
    setBusy(false);
  };
  return <section className="ee-chat">
    <h3>{isComplete ? "What did you notice?" : "Ask while you go"}</h3>
    <p>{isComplete ? "Share anything that came up—a surprise, a feeling, a small win, or something that still felt off." : "No question is too small—tools, timing, substitutions, or getting unstuck."}</p>
    {(journey.chat || []).length > 0 && <div className="ee-messages">
      {journey.chat.map((item, index) => <div key={index} className={`ee-message ${item.role === "user" ? "user" : ""}`}><Rich text={item.content} /></div>)}
      {busy && <div className="ee-message">Thinking…</div>}
    </div>}
    <form className="ee-chat-row" onSubmit={send}>
      <input className="ee-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={isComplete ? "I noticed…" : "What exactly should I do first?"} aria-label={isComplete ? "Share what you noticed" : "Ask the coach"} />
      <button className="ee-btn ai" disabled={!message.trim() || busy}>{isComplete ? "Share" : "Ask"}</button>
    </form>
  </section>;
}

function Calibration({ history }) {
  const entries = useMemo(() => ledgerFromJourneys(history), [history]);
  const s = summarize(entries);
  const pct = (v) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const stamp = new Date().toISOString().slice(0, 10);
  return <section className="ee-calibration" aria-labelledby="cal-title">
    <h2 id="cal-title">Calibration ledger</h2>
    <p className="ee-copy">{interpret(s)}</p>
    {s.n > 0 && <div className="ee-cal-grid">
      <div dangerouslySetInnerHTML={{ __html: calibrationChart(entries) }} />
      <div>
        <dl className="ee-stats">
          <div><dt>Brier score</dt><dd>{s.brier.toFixed(3)}</dd></div>
          <div><dt>Forecasts</dt><dd>{s.n}</dd></div>
          <div><dt>Mean confidence</dt><dd>{pct(s.meanConfidence)}</dd></div>
          <div><dt>Hit rate</dt><dd>{pct(s.baseRate)}</dd></div>
        </dl>
        <div className="ee-actions">
          <button className="ee-btn ghost small" onClick={() => download(`calibration-${stamp}.json`, toJSON(entries), "application/json")}>Export JSON</button>
          <button className="ee-btn ghost small" onClick={() => download(`calibration-${stamp}.md`, toMarkdown(entries), "text/markdown")}>Export Markdown</button>
        </div>
      </div>
    </div>}
  </section>;
}

function Start({ journey, history, apply, openJourney, onDeleteJourney }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const begin = async () => {
    const problem = journey.problem.trim();
    if (!problem || busy) return;
    if (journey.analyzedProblem === problem && journey.hypotheses?.length) { apply((j) => goTo(j, "hypotheses")); return; }
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "understand", problem, journey }); }
    catch (e) { result = fallbackUnderstanding(problem); source = "local"; setError(`${e.message}. I loaded the built-in coach so you can keep going.`); }
    apply((j) => applyAnalysis(j, { domain: fallbackUnderstanding(problem).domain, ...result }, source));
    setBusy(false);
  };
  return <>
    <section className="ee-card">
      <p className="ee-eyebrow">Start with the honest version</p>
      <h1 className="ee-title">What do you want to get better at—or stop avoiding?</h1>
      <p className="ee-copy">No framework to fill in. Say it normally: “I hate cooking,” “I keep avoiding exercise,” or “I want to speak up at work.”</p>
      <textarea className="ee-textarea" value={journey.problem} onChange={(e) => apply((j) => setProblem(j, e.target.value))} placeholder="I hate cooking because it feels like too much work…" autoFocus />
      <div className="ee-examples" aria-label="Examples">
        {DOMAINS.map((d) => <button type="button" className="ee-example" key={d.id} onClick={() => apply((j) => setProblem(j, d.example))}>{d.label}</button>)}
      </div>
      {error && <div className="ee-error">{error}</div>}
      <div className="ee-actions end"><button className="ee-btn ai" onClick={begin} disabled={!journey.problem.trim() || busy}>{busy ? "Finding a useful angle…" : "Help me understand it →"}</button></div>
    </section>
    {history.length > 0 && <section className="ee-history">
      <h2>Previous reality checks</h2>
      {history.slice().reverse().map((item) => <div className="ee-history-item" key={item.id}>
        <button onClick={() => openJourney(item)}><strong>{item.problem}</strong><br/><small>{item.challenge?.title || "Exploration"}{item.prediction ? ` · forecast ${item.prediction.confidence}%` : ""}</small></button>
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
    {history.length > 0 && <Calibration history={history} />}
  </>;
}

function Hypotheses({ journey, apply }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = (item) => apply((j) => selectHypothesis(j, item));
  const refresh = async () => {
    if (busy) return;
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "understand", problem: journey.problem, journey }); }
    catch (e) { result = fallbackUnderstanding(journey.problem); source = "local"; setError(`${e.message}. Showing built-in alternatives instead.`); }
    apply((j) => applyAnalysis(j, { domain: j.domain, ...result }, source));
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
    {journey.domain && journey.domain !== "generic" && <span className="ee-domain">{getDomain(journey.domain).label}</span>}
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
    <Chat journey={journey} apply={apply} />
  </section>;
}

function Insight({ journey, apply }) {
  const h = journey.selectedHypothesis;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const getChallenges = async () => {
    if (busy) return;
    if (journey.challenges?.length) { apply((j) => goTo(j, "challenges")); return; }
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "challenges", journey }); }
    catch (e) { result = fallbackChallenges(journey); source = "local"; setError(`${e.message}. I loaded built-in challenges instead.`); }
    apply((j) => applyChallenges(j, result, source));
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
        <button className="ee-btn ghost" onClick={() => apply(clearHypothesis)}>Choose another angle</button>
      </div>
    </section>
    <Chat journey={journey} apply={apply} />
  </>;
}

function Challenges({ journey, apply }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");
  const refresh = async () => {
    if (busy || loadingId) return;
    setBusy(true); setError("");
    let result; let source = "ai";
    try { result = await coachRequest({ action: "challenges", journey }); }
    catch (e) { result = fallbackChallenges(journey); source = "local"; setError(`${e.message}. Showing built-in alternatives instead.`); }
    apply((j) => applyChallenges(j, result, source));
    setBusy(false);
  };
  const choose = async (item) => {
    if (busy || loadingId) return;
    setLoadingId(item.id); setError("");
    let detail; let source = "ai";
    try { detail = { ...item, ...(await coachRequest({ action: "plan", journey: { ...journey, challenge: item }, challenge: item })) }; }
    catch (e) { detail = fallbackPlan(item); source = "local"; setError(`${e.message}. I loaded a built-in plan instead.`); }
    apply((j) => selectChallenge(j, detail, source));
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
        <span><Rich text={item.why} /></span>
        {item.falsifier && <span className="ee-falsifier-line">Could prove it wrong: <Rich text={item.falsifier} /></span>}
      </button>)}
    </div>
    <form className="ee-custom" onSubmit={useCustom}>
      <strong>Already have a better challenge in mind?</strong>
      <div className="ee-custom-row"><input className="ee-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Describe your own small test…"/><button className="ee-btn reality" disabled={!custom.trim() || !!loadingId}>Build my plan</button></div>
    </form>
    <div className="ee-actions"><button className="ee-btn ghost" onClick={() => apply((j) => goTo(j, "insight"))}>Not yet—talk more</button></div>
  </section>
  <Chat journey={journey} apply={apply} />
  </>;
}

function Forecast({ journey, apply }) {
  const value = journey.prediction?.confidence;
  return <div className="ee-forecast">
    <label htmlFor="forecast">Before you start: how likely are you to reach the minimum success?</label>
    <p>Your honest guess, recorded now, is scored against what happens. It builds your calibration ledger.</p>
    <div className="ee-forecast-row">
      <input id="forecast" type="range" min="0" max="100" step="5" value={value ?? 50} onChange={(e) => apply((j) => setPrediction(j, e.target.value))} onClick={(e) => apply((j) => setPrediction(j, e.currentTarget.value))} aria-valuetext={value === undefined ? "Not set" : `${value}%`} />
      <output htmlFor="forecast">{value === undefined ? "—" : `${value}%`}</output>
    </div>
  </div>;
}

function Plan({ journey, apply }) {
  const c = journey.challenge;
  const checked = journey.checked || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    if (busy) return;
    setBusy(true); setError("");
    let detail; let source = "ai";
    try { detail = { ...c, ...(await coachRequest({ action: "plan", journey, challenge: c })) }; }
    catch (e) { detail = fallbackPlan(c); source = "local"; setError(`${e.message}. Showing the built-in plan instead.`); }
    apply((j) => selectChallenge(j, detail, source));
    setBusy(false);
  };
  return <>
    <section className="ee-card reality">
      <p className="ee-eyebrow reality">Your tiny experiment</p>
      <h2 className="ee-h2">{c.title}</h2>
      <div className="ee-meta"><span className="ee-pill">{c.time}</span><span className="ee-pill">{c.difficulty}</span></div>
      <div className="ee-toolbar"><p>The detailed plan uses your conversation context.</p><button className="ee-btn ghost small" onClick={refresh} disabled={busy}>{busy ? "Rebuilding…" : "↻ Redo this plan"}</button></div>
      {error && <div className="ee-error">{error}</div>}
      <div className="ee-success"><b>Minimum success:</b> <Rich text={c.minimum_success} /></div>
      {c.falsifier && <div className="ee-falsifier"><b>What would prove the hypothesis wrong:</b> <Rich text={c.falsifier} /></div>}
      {c.caution && <div className="ee-caution">{c.caution}</div>}
      <Forecast journey={journey} apply={apply} />
      <details><summary>What you need</summary><ul className="ee-upgrades">{c.materials?.map((x) => <li key={x}><Rich text={x} /></li>)}</ul></details>
      <h3>Do this</h3>
      <div>{c.steps?.map((step, index) => <label className="ee-check" key={index}>
        <input type="checkbox" checked={checked.includes(index)} onChange={() => apply((j) => toggleStep(j, index))} /><span><Rich text={step} /></span>
      </label>)}</div>
      <details><summary>Too easy? Optional upgrades</summary><ul className="ee-upgrades">{c.upgrades?.map((x) => <li key={x}><Rich text={x} /></li>)}</ul></details>
      <div className="ee-actions">
        <button className="ee-btn green" onClick={() => apply((j) => goTo(j, "debrief"))}>I tried it →</button>
        <button className="ee-btn ghost" onClick={() => apply((j) => goTo(j, "challenges"))}>Choose an easier option</button>
      </div>
    </section>
    <Chat journey={journey} apply={apply} />
  </>;
}

function Debrief({ journey, apply }) {
  return <section className="ee-card learn">
    <p className="ee-eyebrow learn">One-question debrief</p>
    <h2 className="ee-h2">How did it go?</h2>
    <p className="ee-copy">No essay and no guilt. What happened is information for the next attempt.</p>
    <div className="ee-grid">{OUTCOMES.map(({ id, label }) => <button className="ee-choice" key={id} onClick={() => apply((j) => recordOutcome(j, id))}><strong>{label}</strong></button>)}</div>
    <Chat journey={journey} apply={apply} />
  </section>;
}

function Complete({ journey, restart, apply }) {
  return <>
    <section className="ee-card learn">
      <p className="ee-eyebrow learn">Reality updated the model</p>
      <h2 className="ee-h2">That counts as progress.</h2>
      <p><strong>What you tested:</strong> {journey.selectedHypothesis?.title}</p>
      <p><strong>What happened:</strong> {journey.outcome?.label}</p>
      <div className="ee-reflection"><strong>What the evidence suggests: </strong>{journey.learning}</div>
      <p className="ee-copy">The app saved the experiment{journey.prediction ? " and scored your forecast in the calibration ledger" : ""} automatically.</p>
      <div className="ee-actions"><button className="ee-btn green" onClick={restart}>Start another small improvement</button></div>
    </section>
    <Chat journey={journey} apply={apply} />
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

  const apply = (transition) => setJourney((current) => transition(current));
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
  const backTarget = previousPhase(phase);
  
  const view = useMemo(() => {
    if (phase === "start") return <Start journey={journey} history={history} apply={apply} openJourney={setJourney} onDeleteJourney={handleDeleteJourney} />;
    if (phase === "hypotheses") return <Hypotheses journey={journey} apply={apply} />;
    if (phase === "insight") return <Insight journey={journey} apply={apply} />;
    if (phase === "challenges") return <Challenges journey={journey} apply={apply} />;
    if (phase === "plan") return <Plan journey={journey} apply={apply} />;
    if (phase === "debrief") return <Debrief journey={journey} apply={apply} />;
    return <Complete journey={journey} restart={restart} apply={apply} />;
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
        {backTarget && <button className="ee-back-step" onClick={() => apply(goBack)}>← Back one step</button>}
        {view}

        <p className="ee-local">
          {user ? `Saved in Google Cloud (Firestore) as ${user.email}` : "Saved privately in this browser"}
          {" · "}
          {hasApiKey ? "AI coach connected with your key" : "Server AI coach if configured, built-in coach otherwise"}
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
