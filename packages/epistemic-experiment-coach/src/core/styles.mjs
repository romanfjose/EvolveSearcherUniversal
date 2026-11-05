// Shared stylesheet for the React app and the standalone build.
export const CSS = `
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
  .ee-check input { flex-shrink: 0; margin-top: 4px; accent-color: var(--green); width: 17px; height: 17px; }
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

  /* Experiment rigor + calibration ledger */
  .ee-domain { display: inline-block; margin: 0 0 10px; border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--muted); background: #fff; }
  .ee-examples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .ee-example { border: 1px dashed var(--line); background: transparent; color: var(--muted); border-radius: 999px; padding: 6px 11px; font-size: 12px; cursor: pointer; }
  .ee-example:hover { color: var(--ink); border-color: var(--violet); }
  .ee-falsifier { border: 1px dashed var(--amber); border-radius: 12px; padding: 12px 14px; margin: 12px 0; font-size: 14px; }
  .ee-falsifier b { color: var(--amber); }
  .ee-choice .ee-falsifier-line { display: block; margin-top: 6px; font-size: 13px; color: var(--muted); font-style: italic; }
  .ee-root code { font: .9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: rgba(30,41,38,.07); border-radius: 5px; padding: 1px 5px; }
  .ee-caution { background: #fbe9e7; color: #7e2a24; border-radius: 12px; padding: 10px 13px; margin: 12px 0; font-size: 13px; }
  .ee-forecast { background: var(--violet-soft); border-radius: 13px; padding: 14px 16px; margin: 16px 0; }
  .ee-forecast label { display: block; font-weight: 750; margin-bottom: 4px; }
  .ee-forecast p { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
  .ee-forecast-row { display: flex; align-items: center; gap: 12px; }
  .ee-forecast-row input[type=range] { flex: 1; accent-color: var(--violet); }
  .ee-forecast-row output { min-width: 48px; text-align: right; font: 700 20px var(--serif); color: var(--violet); }
  .ee-calibration { margin-top: 30px; }
  .ee-calibration h2 { font: 700 20px var(--serif); margin-bottom: 4px; }
  .ee-cal-grid { display: grid; grid-template-columns: minmax(0, 240px) 1fr; gap: 18px; align-items: start; }
  .ee-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
  .ee-stats div { background: #fff; border: 1px solid var(--line); border-radius: 11px; padding: 9px 11px; }
  .ee-stats dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .ee-stats dd { margin: 2px 0 0; font: 700 20px var(--serif); }
  .cal-chart { width: 100%; max-width: 260px; height: auto; font: 10px var(--sans); fill: var(--muted); }
  .cal-grid { stroke: var(--line); stroke-width: 1; }
  .cal-ideal { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 4 4; }
  .cal-line { fill: none; stroke: var(--violet); stroke-width: 2; }
  .cal-dot { fill: var(--violet); stroke: var(--card); stroke-width: 2; }
  .cal-axis { font-size: 11px; fill: var(--ink); }
  @media (max-width: 560px) { .ee-cal-grid { grid-template-columns: 1fr; } }
`;
