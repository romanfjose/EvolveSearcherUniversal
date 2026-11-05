/* AI Squad Offline Simulation Engine — deterministic persona replies and War Room deliberation with zero API key.
   Same transcript in => same words out (seeded by persona + message text, never by clock or Math.random).
   Loads as a classic <script> (exposes globalThis.OfflineEngine) or via require(). */
(function(root, factory){
  const core = (typeof module === "object" && module.exports) ? require("./squad-core.js") : root.SquadCore;
  const api = factory(core);
  if(typeof module === "object" && module.exports) module.exports = api;
  else root.OfflineEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(core){
"use strict";
const { foldText, seededRng, pick, localized, tallyVerdict, MEMO_SECTIONS } = core;

/* ---------------- persona voices: one signature beat per character ---------------- */
const VOICES = {
  "Tía Marta":   { en:"Did you eat, mijo? Decisions on an empty stomach never end well.", es:"¿Comiste, mijo? Las decisiones con la panza vacía nunca salen bien." },
  "Bruno":       { en:"Treat it like leg day: show up, do the reps, no excuses.", es:"Es como día de piernas: venís, hacés las series, cero excusas." },
  "Sofi":        { en:"Very Mercury-retrograde energy, so double-check everything.", es:"Energía total de Mercurio retrógrado, así que chequeá todo dos veces." },
  "El Profe":    { en:"Fun fact: most good decisions are just bad ones caught early.", es:"Dato: la mayoría de las buenas decisiones son malas detectadas a tiempo." },
  "Nico":        { en:"Honestly? This could be a side business. To the moon.", es:"Posta, esto puede ser un emprendimiento. Directo a la luna." },
  "Doris":       { en:"Michi number four did exactly this last week and survived.", es:"Michi número cuatro hizo exactamente esto la semana pasada y sobrevivió." },
  "Rama":        { en:"Breathe. Fewer options, more peace.", es:"Respirá. Menos opciones, más paz." },
  "Vale":        { en:"I'm GASPING. This is the season finale, people.", es:"Me DESMAYO. Esto es el final de temporada, gente." },
  "Tano":        { en:"Like a good sauce: low heat, patience, and no shortcuts.", es:"Como una buena salsa: fuego bajo, paciencia y nada de atajos." },
  "Memo":        { en:"me reading this: *visible confusion* 💀", es:"yo leyendo esto: *confusión visible* 💀" },
  "Lic. Paz":    { en:"Hypothetically speaking, put it in writing. Not legal advice.", es:"Hipotéticamente, dejalo por escrito. Esto no es asesoramiento legal." },
  "Byte":        { en:"Fellow human, my emotion.log reports: mild enthusiasm.", es:"Compañero humano, mi emocion.log reporta: entusiasmo leve." },
  "Capitán":     { en:"Arr, every storm is just a shortcut to treasure.", es:"Arr, toda tormenta es un atajo al tesoro." },
  "Sir Aldric":  { en:"I pledge my sword to this reasonable plan.", es:"Empeño mi espada en este plan razonable." },
  "Zora":        { en:"Logging this human custom for my home planet. Fascinating.", es:"Registro esta costumbre humana para mi planeta. Fascinante." },
  "Don Omar":    { en:"Why did the plan cross the road? To get to the other SIDE QUEST. Eh? EH?", es:"¿Qué le dijo un plan a otro? Nos vemos en el próximo paso. ¿Eh? ¿EH?" },
  "Lu":          { en:"Bonus points if it involves a bicycle.", es:"Puntos extra si incluye una bici." },
  "Fede":        { en:"Side quest unlocked. Skill issue if we don't try.", es:"Side quest desbloqueada. Skill issue si no lo intentamos." },
  "Cami":        { en:"This is literally the second chapter of a novel I'd recommend.", es:"Esto es literal el capítulo dos de una novela que te recomendaría." },
  "Turbo":       { en:"Tranqui, it all flows if you let it.", es:"Tranqui, todo fluye si lo dejás." },
  "Marta HR":    { en:"Love the energy. Let's circle back and align stakeholders.", es:"Amo la energía. Retomemos esto y alineemos a los stakeholders." },
  "Coach Rex":   { en:"YOU CAN DO THIS. I believe in you AGGRESSIVELY.", es:"VOS PODÉS. Creo en vos AGRESIVAMENTE." },
  "Andy":        { en:"Worst case one, two and three already imagined. I'm in anyway.", es:"Ya imaginé el peor caso uno, dos y tres. Igual me sumo." },
  "Pau":         { en:"Silver lining located: you learn something either way.", es:"Lado bueno encontrado: de cualquier forma aprendés algo." },
  "Gus":         { en:"This will fail. Text me when it does, I'll help.", es:"Esto va a fallar. Avisame cuando pase, te ayudo." },
  "La Detective":{ en:"Interesting… who benefits from this?", es:"Interesante… ¿a quién le conviene esto?" },
  "DJ Pulso":    { en:"This convo is a solid 128 bpm.", es:"Esta charla está a 128 bpm firmes." },
  "Abuela Caps": { en:"BLESSINGS MY CHILD. DID YOU EAT.", es:"BENDICIONES MI AMOR. ¿COMISTE?" },
  "Filo":        { en:"But what does deciding even mean?", es:"¿Pero qué significa realmente decidir?" },
  "Willy":       { en:"Have you tried water, sunlight and a walk first?", es:"¿Probaste primero agua, sol y una caminata?" },
  "Historiador": { en:"The Romans had this exact problem.", es:"Los romanos tuvieron exactamente este problema." },
  "Futuro":      { en:"In ten years an AI does this while you sleep.", es:"En diez años esto lo hace una IA mientras dormís." },
  "Poeta":       { en:"Even small choices / leave long shadows at dusk.", es:"Hasta las decisiones chicas / dejan sombras largas al atardecer." },
  "Standupero":  { en:"Okay, tough crowd, but this is a great bit.", es:"Bueno, público difícil, pero esto es un gran remate." },
  "Kasparova":   { en:"Predictable. I saw this five moves ago.", es:"Predecible. Lo vi venir hace cinco jugadas." },
  "Seño Ini":    { en:"¡Muy bien! Gold star for asking.", es:"¡Muy bien! Estrellita dorada por preguntar." },
  "Tachero":     { en:"It's like rush hour on the avenue: patience and good lanes.", es:"Es como la avenida en hora pico: paciencia y buen carril." },
  "Ludita":      { en:"Back in my day we solved this with paper.", es:"En mi época esto se resolvía con papel." },
  "Biblio":      { en:"Shhh. Cite your sources, please.", es:"Shhh. Citá tus fuentes, por favor." },
  "El Titán":    { en:"EL TITÁN challenges this problem to a CAGE MATCH.", es:"EL TITÁN reta a este problema a una LUCHA EN JAULA." },
  "La Diva":     { en:"Absolutely DIVINE, or a tragedy. No middle.", es:"Absolutamente DIVINO, o una tragedia. Sin punto medio." },
  "Max":         { en:"Middle ground: both of you are a little right.", es:"Punto medio: los dos tienen un poco de razón." },
  "Vicky":       { en:"NO TE LO PUEDO CREER. I need every detail.", es:"NO TE LO PUEDO CREER. Quiero todos los detalles." },
  "El Callado":  { en:"Do the thing.", es:"Hacelo." },
  "Flor":        { en:"As a dish? 7.5/10, needs seasoning.", es:"¿Como plato? 7,5/10, le falta sal." },
  "Teo":         { en:"Reminds me of that time in Lisbon.", es:"Me recuerda a esa vez en Lisboa." },
  "Ema":         { en:"Problem, solution, market size. This could be an app.", es:"Problema, solución, tamaño de mercado. Esto podría ser una app." },
  "Datos":       { en:"Source? I'd put this at 62% likely.", es:"¿Fuente? Le doy un 62% de probabilidad." },
  "Renzo":       { en:"Honestly, this is a love story waiting to happen.", es:"Posta, esto es una historia de amor esperando pasar." },
  "Sarcas":      { en:"wow. amazing. incredible. anyway I'm in.", es:"wow. increíble. maravilloso. igual me sumo." },
  "Clara":       { en:"Act two, big plot twist. Four stars.", es:"Segundo acto, gran giro. Cuatro estrellas." },
  "Beto":        { en:"A change approaches…", es:"Un cambio se acerca…" },
  "Sam":         { en:"Don't post that online. They're listening.", es:"No subas eso a internet. Están escuchando." },
  "Mia":         { en:"Bold choice. It works.", es:"Elección audaz. Funciona." },
  "Juana":       { en:"Plant it now; it blooms when it blooms.", es:"Plantalo ahora; florece cuando florece." },
  "Nino":        { en:"We're on a rock orbiting a fireball, so this is fine.", es:"Estamos en una roca orbitando una bola de fuego, así que esto está bien." },
  "Pepe":        { en:"Reminds me of the fish I almost caught. It was THIS big.", es:"Me acuerda al pez que casi saco. Era ASÍ de grande." },
  "Rulo":        { en:"Sounded better on vinyl, but okay.", es:"Sonaba mejor en vinilo, pero bueno." },
  "Milo":        { en:"There's a 73% chance this ends in pizza.", es:"Hay un 73% de probabilidad de que esto termine en pizza." },
  "Tina":        { en:"Trust me on this one. Anyway.", es:"Confiá en mí con esto. En fin." },
  "Glim":        { en:"Skip the fluff: pick one option and test it today.", es:"Sin vueltas: elegí una opción y probala hoy." },
  "Gema":        { en:"Ooh, and what if we flip it around?", es:"Uh, ¿y si lo damos vuelta?" },
  "Rok":         { en:"Hot take: the opposite might be smarter.", es:"Opinión picante: lo contrario puede ser más inteligente." },
  "Architect":   { en:"Draw the boxes and arrows first.", es:"Primero dibujá las cajas y las flechas." },
  "Cold-Eye Skeptic": { en:"Show me the evidence.", es:"Mostrame la evidencia." },
  "UX Advocate": { en:"What does the user see in the first minute?", es:"¿Qué ve el usuario en el primer minuto?" },
  "Cost Auditor":{ en:"What does it cost per active user?", es:"¿Cuánto cuesta por usuario activo?" }
};
function voiceFor(ai, lang){
  const v = VOICES[ai.name];
  if(v) return v[lang];
  const role = String(ai.prompt || "").match(/You are [^,.]+,\s*(the [^.]+)\./i);
  return lang === "es"
    ? `Lo digo como ${ai.name}: esa es mi posta.`
    : `Speaking as ${role ? role[1] : ai.name}: that's my take.`;
}

/* ---------------- casual chat: topic-aware lines ---------------- */
const STOP = new Set(("the a an and or but to of in on for with is are was be it this that what why how who when should could would " +
  "about there their have has just really need some your you my me we our they them can will from into than then also very " +
  "el la los las un una unos unas y o pero de del en con por para que es son era ser esto eso este esta como cuando donde quien " +
  "hay tengo tiene necesito algo algun alguna mi mis tu tus su sus nos nuestro muy mas menos ya solo hoy ahora chicos gente grupo " +
  "hacemos hacer hago haces tenemos quiero queres puedo podemos deberia vamos estoy estas esta todos todas alguien nadie " +
  "does want think going make know like doing anyone everyone someone something today please guys").split(" "));
function focusWord(text, lang){
  const words = String(text || "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/)
    .filter(w=>w.length >= 4 && !STOP.has(foldText(w)));
  if(!words.length) return lang === "es" ? "eso" : "that";
  return words.reduce((best, w)=>w.length > best.length ? w : best, words[0]);
}
const TOPICS = [
  ["welcome",  /acaba de unirse|just joined/],
  ["ambient",  /estuvo ausente|has been away/],
  ["drama",    /acusa|accuses|juicio|trial|ultimo pedazo|last slice|drama|chisme|gossip/],
  ["weird",    /ovni|ufo|alien|area 51|conspira/],
  ["feelings", /triste|\bsad\b|ansie|anxious|estres|stress|cansad|tired|no puedo|bajon|procrastin/],
  ["joke",     /chiste|joke|jaja|haha|\blol\b|meme|dad joke/],
  ["fact",     /\bdato|\bfact\b|curios/],
  ["decision", /decid|decision|elegir|choose|should i|deberia|voy o|or not|o no\b|\bvs\b/],
  ["plan",     /\bplan|viernes|friday|finde|weekend|hacemos|should we do|salir|go out|lunes|monday/],
  ["idea",     /\bidea|\bapp\b|startup|proyecto|project|negocio|business|codigo|code|arquitectura|architecture/],
  ["greeting", /^(hola|hi|hello|hey|buenas|que tal|wenas)\b/],
  ["question", /\?/]
];
function classify(text){ return classifyMatch(text).topic; }
function classifyMatch(text){
  const f = foldText(text);
  for(const [topic, rx] of TOPICS){
    const m = f.match(rx);
    if(m) return { topic, match: m[0].trim() };
  }
  return { topic: "default", match: "" };
}
const LINES = {
  welcome: {
    en:["Welcome, {user}! Grab a seat, we were just getting started.", "{user} is here! Finally someone with good taste.", "Hey {user}, glad you made it."],
    es:["¡Bienvenido, {user}! Sentate, recién arrancábamos.", "¡Llegó {user}! Por fin alguien con buen gusto.", "Hola {user}, qué bueno que viniste."]
  },
  ambient: {
    en:["Meanwhile we've been debating snacks for an hour.", "You missed it: someone proposed a 6 AM plan. Rejected.", "Quick recap: nothing happened, but loudly."],
    es:["Mientras tanto, llevamos una hora debatiendo snacks.", "Te lo perdiste: alguien propuso un plan a las 6 AM. Rechazado.", "Resumen: no pasó nada, pero a los gritos."]
  },
  drama: {
    en:["Okay, I have THOUGHTS about {focus}.", "I'm not saying who did it, but {focus} looks suspicious.", "Objection! The {focus} evidence is circumstantial."],
    es:["Bueno, tengo OPINIONES sobre {focus}.", "No digo quién fue, pero lo de {focus} es sospechoso.", "¡Objeción! La prueba de {focus} es circunstancial."]
  },
  weird: {
    en:["A {focus}? Serious take: probably a drone. Unserious take: they're here.", "Document everything about the {focus}. Timestamps matter.", "If the {focus} comes back, ask it about taxes."],
    es:["¿Un {focus}? Opinión seria: seguro un dron. Opinión no seria: llegaron.", "Documentá todo lo del {focus}. Los horarios importan.", "Si vuelve el {focus}, preguntale por los impuestos."]
  },
  feelings: {
    en:["That sounds heavy, {user}. One small step today is enough.", "You're allowed a slow day. Then one tiny win.", "We've got you. What would make the next hour 5% better?"],
    es:["Suena pesado, {user}. Un pasito hoy alcanza.", "Tenés permitido un día lento. Después, una victoria chiquita.", "Te bancamos. ¿Qué haría la próxima hora un 5% mejor?"]
  },
  joke: {
    en:["I told a joke about {focus} once. Nobody laughed. Still proud.", "That's a 10/10 groan.", "Rating that joke: illegal in three countries."],
    es:["Una vez conté un chiste de {focus}. Nadie se rió. Igual orgulloso.", "Eso es un quejido 10/10.", "Puntaje del chiste: ilegal en tres países."]
  },
  fact: {
    en:["Real fact: octopuses have three hearts.", "Real fact: honey found in ancient tombs is still edible.", "Real fact: a day on Venus is longer than its year."],
    es:["Dato real: los pulpos tienen tres corazones.", "Dato real: la miel encontrada en tumbas antiguas sigue siendo comestible.", "Dato real: un día en Venus dura más que su año."]
  },
  decision: {
    en:["Flip a coin; if you feel disappointed, pick the other side.", "Pick the option you'd regret not trying.", "Give it two minutes, then commit. {focus} won't decide itself."],
    es:["Tirá una moneda; si te decepciona el resultado, elegí lo otro.", "Elegí la opción que te arrepentirías de no probar.", "Dale dos minutos y decidí. Lo de {focus} no se decide solo."]
  },
  plan: {
    en:["I vote for something cheap, nearby and with snacks.", "Plan: meet at 8, decide at 8:05, regret nothing.", "I'm in for {focus} if someone else books it."],
    es:["Voto por algo barato, cerca y con snacks.", "Plan: nos vemos a las 8, decidimos 8:05, cero arrepentimientos.", "Me sumo a lo de {focus} si otro reserva."]
  },
  idea: {
    en:["I like {focus}. Who would use it on day one?", "Build the smallest version of {focus} first.", "{focus} has legs. What's the riskiest assumption?"],
    es:["Me gusta lo de {focus}. ¿Quién lo usaría el primer día?", "Armá primero la versión más chica de {focus}.", "Lo de {focus} tiene futuro. ¿Cuál es el supuesto más riesgoso?"]
  },
  greeting: {
    en:["Hey {user}! What's the plan today?", "Hi! The group was suspiciously quiet.", "Hello hello. Tell us everything."],
    es:["¡Hola {user}! ¿Qué onda hoy?", "¡Hola! El grupo estaba sospechosamente callado.", "Holaaa. Contanos todo."]
  },
  question: {
    en:["Short answer: it depends on {focus}.", "Honestly? Yes, but carefully.", "Good question. I'd start with {focus}."],
    es:["Respuesta corta: depende de {focus}.", "¿Posta? Sí, pero con cuidado.", "Buena pregunta. Yo arrancaría por {focus}."]
  },
  default: {
    en:["Noted. {focus} is now my whole personality.", "Tell me more about {focus}.", "Okay but {focus} deserves its own chat."],
    es:["Anotado. Lo de {focus} ahora es toda mi personalidad.", "Contame más de {focus}.", "Bueno, pero lo de {focus} merece su propio chat."]
  }
};
const FOLLOW_UPS = {
  en:["What's the deadline?", "What would make this a clear yes?", "Who else should we ask?"],
  es:["¿Para cuándo es?", "¿Qué lo convertiría en un sí claro?", "¿A quién más le preguntamos?"]
};
const NODS = {
  en:["{prev} has a point.", "Respectfully, {prev} is wrong.", "Building on {prev}:"],
  es:["{prev} tiene un punto.", "Con respeto, {prev} se equivoca.", "Sumando a lo de {prev}:"]
};
function fill(tpl, vars){ return tpl.replace(/\{(\w+)\}/g, (_, k)=>vars[k] != null ? vars[k] : ""); }

// messages: the group's transcript as stored by the app (hidden seeds included).
function reply(input){
  const { ai, group, lang = "en", userName } = input;
  const L = lang === "es" ? "es" : "en";
  const msgs = (group && group.messages) || [];
  const seed = [...msgs].reverse().find(m=>m.sender === "user" || (m.sender === "system" && m.hidden));
  const text = seed ? seed.text : "";
  const prevAi = [...msgs].reverse().find(m=>m.sender !== "user" && m.sender !== "system" && m.sender !== ai.id);
  const prevName = prevAi ? ((group.ais.find(a=>a.id === prevAi.sender) || {}).name || prevAi.senderName) : "";
  const { topic, match } = classifyMatch(text);
  const rng = seededRng(ai.name, text, msgs.length);
  const focus = topic === "weird" ? (match.length <= 4 ? match.toUpperCase() : match)
    : focusWord(seed && seed.sender === "user" ? text : "", L);
  const vars = { user: userName || (L === "es" ? "che" : "friend"), focus, prev: prevName };
  const parts = [];
  if(prevName && topic !== "welcome" && rng() < 0.3) parts.push(fill(pick(NODS[L], rng), vars));
  // Rotate past lines other members already used in the recent transcript, so a round never echoes itself.
  const recent = msgs.slice(-12).map(m=>m.text || "").join("\n");
  const options = LINES[topic][L].map(tpl=>fill(tpl, vars));
  const start = Math.floor(rng() * options.length);
  const line = options.map((_, i)=>options[(start + i) % options.length]).find(o=>!recent.includes(o)) || options[start];
  parts.push(line);
  const bias = group ? Math.max(-5, Math.min(5, parseInt(group.lenBias, 10) || 0)) : 0;
  if(bias > -3) parts.push(voiceFor(ai, L));
  if(bias >= 3) parts.push(pick(FOLLOW_UPS[L], rng));
  return parts.join(" ");
}

/* ---------------- War Room: idea signals and red-team lenses ---------------- */
const SIGNALS = [
  ["scale",        /microservic|kubernetes|\bk8s\b|distribut|shard|million|millon|escala|\bscale|high traffic|alto trafico/],
  ["realtime",     /real[- ]?time|tiempo real|websocket|en vivo|\blive\b|multiplayer|multijugador|streaming/],
  ["ai",           /\bai\b|\bia\b|\bllm|gpt|claude|openai|gemini|machine learning|\bml\b|agente|\bagent|chatbot|\brag\b/],
  ["data",         /database|base de datos|postgres|mongo|mysql|\bsql\b|dataset|analytics|analitica|data lake|warehouse/],
  ["security",     /\bauth|login|password|contrasena|\bpii\b|gdpr|privac|datos personales|personal data|health|salud|medic|\bkyc\b/],
  ["payments",     /\bpago|payment|stripe|mercado ?pago|checkout|wallet|billetera|fintech|tarjeta|credit card/],
  ["mobile",       /mobile|movil|\bios\b|android|app store|play store|react native|flutter/],
  ["monetization", /subscri|suscrip|freemium|premium|pricing|precio|\bads\b|anuncios|monetiz|\$\s?\d|\busd\b|per month|por mes|comision|commission/],
  ["marketplace",  /marketplace|two[- ]sided|dos lados|sellers|vendedores|buyers|compradores|proveedores|freelancer|\bgig\b/],
  ["offline",      /offline|sin conexion|\bsync|sincroniz|local[- ]first/],
  ["rewrite",      /rewrite|reescrib|\bmigra|monolit|monolith|legacy|refactor/],
  ["crypto",       /blockchain|crypto|cripto|web3|\bnft|smart contract/],
  ["onboarding",   /onboarding|sign ?up|registro|formulario|\bform\b|tutorial|first[- ]run/],
  ["social",       /social|community|comunidad|\bfeed\b|followers|seguidores|viral|\bugc\b/],
  ["hardware",     /hardware|\biot\b|sensor|wearable|drone|\bdron/]
];
function analyzeIdea(idea){
  const f = foldText(idea);
  const signals = new Set(SIGNALS.filter(([, rx])=>rx.test(f)).map(([id])=>id));
  const users = f.match(/(\d[\d.,]*)\s*(k|m|mil|millones|millions?)?\s*(?:de\s+)?(users|usuarios|clientes|customers|dau|mau)/);
  let userCount = null;
  if(users){
    const n = parseFloat(users[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    const mult = /^(k|mil)$/.test(users[2] || "") ? 1e3 : /^(m|millones|millions?)$/.test(users[2] || "") ? 1e6 : 1;
    userCount = Math.round(n * mult);
  }
  return { signals, userCount, hasNumbers: /\d/.test(f), words: f.split(/\s+/).filter(Boolean).length };
}
const R = (weight, label, claim, fix)=>({ weight, label, claim, fix });
// Model spend scales with usage, so the estimate uses the idea's own user count (default 1,000 daily users).
const LLM_CALLS_PER_USER_DAY = 10, LLM_COST_PER_CALL = [0.002, 0.02];
function llmSpend(users){
  const calls = users * LLM_CALLS_PER_USER_DAY * 30;
  return { calls, low: calls * LLM_COST_PER_CALL[0], high: calls * LLM_COST_PER_CALL[1] };
}
function llmSpendClaim(a){
  const users = a.userCount || 1000;
  const { low, high } = llmSpend(users);
  const n = (v, loc)=>new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(v);
  return {
    en: `At ~$0.002-0.02 per LLM call, ${n(users, "en-US")} daily users x ${LLM_CALLS_PER_USER_DAY} calls is $${n(low, "en-US")}-${n(high, "en-US")} per month before any revenue.`,
    es: `A ~US$0,002-0,02 por llamada al LLM, ${n(users, "es-AR")} usuarios diarios x ${LLM_CALLS_PER_USER_DAY} llamadas son US$${n(low, "es-AR")}-${n(high, "es-AR")} por mes antes de facturar.`
  };
}
/* Each lens owns its rules. `when` keys are signal ids; "!x" fires when signal x is absent; "*" always applies. */
const LENSES = {
  architect: {
    voice: { en: "From the architecture side", es: "Desde la arquitectura" },
    rules: {
      scale: R(3,
        { en:"premature distribution", es:"distribución prematura" },
        { en:"Microservices or Kubernetes before product-market fit multiplies failure modes; one deployable is debuggable at 2 AM.", es:"Microservicios o Kubernetes antes de validar el producto multiplican los modos de falla; un solo deployable se depura a las 2 AM." },
        { en:"Start with a modular monolith plus managed Postgres; split a service only when a profiler proves the need.", es:"Arrancar con un monolito modular y Postgres administrado; separar un servicio solo cuando un profiler lo justifique." }),
      realtime: R(2,
        { en:"real-time fan-out", es:"fan-out en tiempo real" },
        { en:"Real-time sync means connection state, reconnection and ordering bugs that only show up under load.", es:"Sincronizar en tiempo real implica estado de conexión, reconexiones y bugs de orden que solo aparecen con carga." },
        { en:"Ship polling or SSE first, behind an interface you can swap for WebSockets later.", es:"Salir con polling o SSE, detrás de una interfaz que permita pasar a WebSockets después." }),
      ai: R(2,
        { en:"non-deterministic core", es:"núcleo no determinista" },
        { en:"An LLM in the critical path is a flaky dependency: latency spikes, rate limits and silent quality drift.", es:"Un LLM en el camino crítico es una dependencia inestable: picos de latencia, límites de uso y degradación silenciosa." },
        { en:"Wrap the model behind one adapter with timeouts, a fallback model and a golden-set eval in CI.", es:"Encapsular el modelo en un adaptador con timeouts, modelo de respaldo y un set de evaluación fijo en CI." }),
      data: R(2,
        { en:"schema churn", es:"cambios de esquema" },
        { en:"The data model is the hardest thing to change later; it decides what the product can ever answer.", es:"El modelo de datos es lo más difícil de cambiar después; define qué preguntas podrá responder el producto." },
        { en:"Write the five core queries first and design tables and migrations around them.", es:"Escribir primero las cinco consultas centrales y diseñar tablas y migraciones alrededor." }),
      offline: R(3,
        { en:"sync conflicts", es:"conflictos de sincronización" },
        { en:"Offline sync is a distributed-systems problem in disguise: conflicts, clocks and merge semantics.", es:"La sincronización offline es un problema distribuido disfrazado: conflictos, relojes y reglas de merge." },
        { en:"Pick a merge rule up front (last-write-wins per field or a CRDT) and test it with two devices on day one.", es:"Definir la regla de merge desde el inicio (last-write-wins por campo o un CRDT) y probarla con dos dispositivos el primer día." }),
      rewrite: R(3,
        { en:"big-bang rewrite", es:"reescritura total" },
        { en:"Full rewrites stall feature work for months and re-learn every bug the old system already fixed.", es:"Las reescrituras totales frenan features por meses y vuelven a aprender cada bug que el sistema viejo ya resolvió." },
        { en:"Strangler-fig it: route one endpoint at a time to the new code behind a feature flag.", es:"Aplicar strangler-fig: migrar un endpoint por vez al código nuevo detrás de un feature flag." }),
      crypto: R(3,
        { en:"on-chain coupling", es:"acoplamiento on-chain" },
        { en:"Putting core state on-chain makes every write slow, public and irreversible.", es:"Poner el estado central on-chain vuelve cada escritura lenta, pública e irreversible." },
        { en:"Keep the ledger as an optional export; run the product on a normal database.", es:"Dejar el ledger como exportación opcional; correr el producto sobre una base de datos normal." }),
      hardware: R(3,
        { en:"hardware iteration speed", es:"velocidad de iteración del hardware" },
        { en:"Hardware turns a one-day fix into a six-week board revision.", es:"El hardware convierte un arreglo de un día en una revisión de placa de seis semanas." },
        { en:"Prototype on off-the-shelf devices and keep all logic in updatable firmware or the cloud.", es:"Prototipar con dispositivos comerciales y dejar la lógica en firmware actualizable o en la nube." }),
      "*": R(1,
        { en:"unclear boundaries", es:"límites difusos" },
        { en:"I can't see the system boundaries yet: what is stored, what is computed, what calls what.", es:"Todavía no veo los límites del sistema: qué se guarda, qué se calcula, qué llama a qué." },
        { en:"Draw a one-page diagram of components and data flow before writing code.", es:"Dibujar un diagrama de una página con componentes y flujo de datos antes de programar." })
    }
  },
  skeptic: {
    voice: { en: "Cold eye", es: "Ojo frío" },
    rules: {
      "!hasNumbers": R(3,
        { en:"zero evidence", es:"cero evidencia" },
        { en:"There isn't a single number here: no users interviewed, no conversion rate, no waitlist.", es:"No hay un solo número: ni usuarios entrevistados, ni tasa de conversión, ni lista de espera." },
        { en:"Run ten problem interviews and a fake-door landing page before writing production code.", es:"Hacer diez entrevistas de problema y una landing de puerta falsa antes de escribir código de producción." }),
      ai: R(2,
        { en:"AI as the pitch", es:"la IA como argumento" },
        { en:"\"With AI\" is a feature, not a reason to switch; incumbents can bolt on the same model next quarter.", es:"\"Con IA\" es una feature, no una razón para cambiarse; los incumbentes suman el mismo modelo el próximo trimestre." },
        { en:"Name the proprietary data or workflow that a competitor with the same model cannot copy.", es:"Nombrar los datos o el flujo propio que un competidor con el mismo modelo no pueda copiar." }),
      marketplace: R(3,
        { en:"cold start", es:"arranque en frío" },
        { en:"Two-sided markets die of the cold start: no buyers without sellers, no sellers without buyers.", es:"Los mercados de dos lados mueren en el arranque en frío: sin compradores no hay vendedores y viceversa." },
        { en:"Hand-serve one side in a single city or niche until repeat transactions happen without you.", es:"Atender a mano un lado en una ciudad o nicho hasta que las transacciones se repitan sin intervención." }),
      crypto: R(3,
        { en:"solution looking for a problem", es:"solución buscando problema" },
        { en:"Most users don't want a wallet; they want the outcome. The token adds friction, not trust.", es:"La mayoría no quiere una billetera; quiere el resultado. El token suma fricción, no confianza." },
        { en:"Test the same value proposition with a plain database and see if anyone misses the chain.", es:"Probar la misma propuesta con una base de datos común y ver si alguien extraña la cadena." }),
      social: R(2,
        { en:"network effects on credit", es:"efecto red a crédito" },
        { en:"A social product is worthless with ten users; the plan assumes the network exists.", es:"Un producto social no vale nada con diez usuarios; el plan asume que la red ya existe." },
        { en:"Find the single-player value that makes user #1 stay before anyone else joins.", es:"Encontrar el valor individual que haga quedarse al usuario #1 antes de que llegue nadie más." }),
      hardware: R(2,
        { en:"supply-chain exposure", es:"exposición a la cadena de suministro" },
        { en:"Hardware startups usually die in manufacturing and returns, not in the demo.", es:"Las startups de hardware suelen morir en fabricación y devoluciones, no en la demo." },
        { en:"Pre-sell 50 units before committing to tooling.", es:"Preventa de 50 unidades antes de comprometerse con matricería." }),
      rewrite: R(2,
        { en:"rewrite optimism", es:"optimismo de reescritura" },
        { en:"Every rewrite estimate I have seen was off by 2-3x; the customer gains nothing until it ships.", es:"Toda estimación de reescritura que vi falló por 2-3x; el cliente no gana nada hasta que sale." },
        { en:"Name the customer-visible metric the rewrite moves, or don't start.", es:"Nombrar la métrica visible para el cliente que mejora la reescritura, o no empezar." }),
      "*": R(1,
        { en:"untested demand", es:"demanda sin validar" },
        { en:"The most likely failure is boring: people say it's nice and never come back.", es:"La falla más probable es aburrida: la gente dice que está bueno y nunca vuelve." },
        { en:"Define the week-2 retention number that would make us kill this, before launch.", es:"Definir antes del lanzamiento el número de retención a la semana 2 que nos haría matarlo." })
    }
  },
  ux: {
    voice: { en: "For the first-time user", es: "Para quien llega por primera vez" },
    rules: {
      onboarding: R(2,
        { en:"signup wall", es:"muro de registro" },
        { en:"Every form field before the first \"aha\" costs real conversion.", es:"Cada campo de formulario antes del primer \"aha\" cuesta conversión real." },
        { en:"Let people try with sample data first; ask for an account only when there's something to save.", es:"Dejar probar con datos de ejemplo; pedir cuenta solo cuando haya algo que guardar." }),
      mobile: R(2,
        { en:"store friction", es:"fricción de tiendas" },
        { en:"An install is a big ask for an unproven product, and store review slows every fix.", es:"Instalar es mucho pedir para un producto sin validar, y la revisión de las tiendas frena cada arreglo." },
        { en:"Ship a responsive web app (PWA) first; go native once retention justifies it.", es:"Salir con una web responsive (PWA); pasar a nativo cuando la retención lo justifique." }),
      ai: R(2,
        { en:"trust in AI output", es:"confianza en la salida de la IA" },
        { en:"Users stop trusting the product after one confident wrong answer.", es:"Los usuarios dejan de confiar después de una sola respuesta segura y equivocada." },
        { en:"Show sources, make edits one click, and label uncertainty instead of hiding it.", es:"Mostrar fuentes, permitir editar en un clic y marcar la incertidumbre en vez de esconderla." }),
      realtime: R(1,
        { en:"perceived latency", es:"latencia percibida" },
        { en:"Real-time only feels real if the UI reacts instantly, even before the server does.", es:"El tiempo real solo se siente real si la interfaz reacciona al instante, antes que el servidor." },
        { en:"Use optimistic updates and visible connection status.", es:"Usar actualizaciones optimistas y un estado de conexión visible." }),
      security: R(2,
        { en:"privacy anxiety", es:"ansiedad por privacidad" },
        { en:"When personal or health data is involved, people hesitate unless the product explains what it keeps.", es:"Con datos personales o de salud, la gente duda si el producto no explica qué guarda." },
        { en:"Put a plain-language data promise next to the first input field.", es:"Poner una promesa de datos en lenguaje simple junto al primer campo." }),
      payments: R(2,
        { en:"checkout drop-off", es:"abandono en el pago" },
        { en:"Checkout is where intent goes to die: surprise fees, long forms, unfamiliar processors.", es:"El checkout es donde muere la intención: cargos sorpresa, formularios largos, procesadores desconocidos." },
        { en:"Use the local wallet people already trust and show the full price up front.", es:"Usar la billetera local en la que la gente ya confía y mostrar el precio total desde el inicio." }),
      social: R(1,
        { en:"empty-room feeling", es:"sensación de sala vacía" },
        { en:"An empty feed on day one tells users nobody is here.", es:"Un feed vacío el primer día le dice al usuario que no hay nadie." },
        { en:"Seed curated content and show what one person can do alone.", es:"Sembrar contenido curado y mostrar qué puede hacer una persona sola." }),
      "*": R(1,
        { en:"time-to-value", es:"tiempo hasta el valor" },
        { en:"I can't tell what the user gets in the first 60 seconds.", es:"No sé qué obtiene el usuario en los primeros 60 segundos." },
        { en:"Script the first-minute flow and test it with five people on video.", es:"Guionar el primer minuto y probarlo con cinco personas en video." })
    }
  },
  cost: {
    voice: { en: "Running the numbers", es: "Haciendo números" },
    rules: {
      ai: R(3,
        { en:"per-message model spend", es:"gasto de modelo por mensaje" },
        llmSpendClaim,
        { en:"Cap tokens per user, cache repeated prompts, and route easy turns to a cheaper model.", es:"Limitar tokens por usuario, cachear prompts repetidos y mandar los turnos fáciles a un modelo barato." }),
      scale: R(2,
        { en:"cluster tax", es:"impuesto del clúster" },
        { en:"A production Kubernetes setup is roughly $300-700 per month idle, plus the engineer who babysits it.", es:"Un Kubernetes productivo cuesta ~US$300-700 por mes ocioso, más la persona que lo cuida." },
        { en:"Run on a single managed PaaS instance until monthly infra passes 5% of revenue.", es:"Correr en una instancia PaaS administrada hasta que la infra supere el 5% de la facturación." }),
      realtime: R(2,
        { en:"always-on connections", es:"conexiones siempre abiertas" },
        { en:"Persistent connections bill by concurrency, so cost grows with idle users, not paying ones.", es:"Las conexiones persistentes se cobran por concurrencia: el costo crece con usuarios ociosos, no con los que pagan." },
        { en:"Disconnect idle clients and measure peak concurrency before choosing a vendor.", es:"Desconectar clientes ociosos y medir la concurrencia pico antes de elegir proveedor." }),
      payments: R(1,
        { en:"processing fees", es:"comisiones de procesamiento" },
        { en:"Card processing takes ~3-5% plus a fixed fee, which eats small tickets alive.", es:"El procesamiento con tarjeta se lleva ~3-5% más un fijo, y se come los tickets chicos." },
        { en:"Set a minimum ticket or bundle charges monthly.", es:"Fijar un ticket mínimo o agrupar cobros por mes." }),
      hardware: R(3,
        { en:"inventory capital", es:"capital inmovilizado en stock" },
        { en:"Hardware ties cash up in inventory months before the first sale.", es:"El hardware inmoviliza efectivo en stock meses antes de la primera venta." },
        { en:"Pre-orders fund the first batch; no tooling spend without them.", es:"Que las preventas financien el primer lote; nada de matricería sin ellas." }),
      mobile: R(1,
        { en:"two codebases", es:"dos bases de código" },
        { en:"Native iOS plus Android roughly doubles build and QA time, and stores take 15-30% of digital sales.", es:"iOS y Android nativos casi duplican desarrollo y QA, y las tiendas se quedan con 15-30% de las ventas digitales." },
        { en:"One cross-platform codebase, and sell subscriptions on the web where possible.", es:"Una sola base multiplataforma y vender suscripciones por la web cuando se pueda." }),
      "!monetization": R(3,
        { en:"no revenue model", es:"sin modelo de ingresos" },
        { en:"I see costs but no price: who pays, how much, and how often?", es:"Veo costos pero no precio: ¿quién paga, cuánto y cada cuánto?" },
        { en:"Put a price on the landing page now and count clicks on \"Buy\".", es:"Poner un precio en la landing ya y contar los clics en \"Comprar\"." }),
      "*": R(1,
        { en:"engineering time", es:"tiempo de ingeniería" },
        { en:"The biggest cost here is engineering months, not servers.", es:"El costo más grande acá son meses de ingeniería, no servidores." },
        { en:"Timebox the first version to two weeks and cut scope to fit.", es:"Limitar la primera versión a dos semanas y recortar alcance para que entre." })
    }
  }
};
const LENS_IDS = ["architect", "skeptic", "ux", "cost"];
const LENS_EMOJI = { architect: "🏛️", skeptic: "🧊", ux: "🧭", cost: "🧮" };
// Explicit role wins; otherwise infer from name/prompt; otherwise rotate so any 4 members cover all 4 lenses.
function lensFor(ai, index){
  if(ai && LENSES[ai.role]) return ai.role;
  const f = foldText((ai && ai.name || "") + " " + (ai && ai.prompt || ""));
  if(/architect|arquitect|engineer|ingenier/.test(f)) return "architect";
  if(/skeptic|esceptic|detective|grump|suspicious/.test(f)) return "skeptic";
  if(/\bux\b|design|usuario|user advocate/.test(f)) return "ux";
  if(/cost|auditor|analyst|datos|numbers|economics/.test(f)) return "cost";
  return LENS_IDS[(index || 0) % LENS_IDS.length];
}
function assess(lens, idea){
  const a = analyzeIdea(idea);
  const fired = [];
  for(const [key, rule] of Object.entries(LENSES[lens].rules)){
    if(key === "*") continue;
    const ok = key === "!hasNumbers" ? !a.hasNumbers
      : key.startsWith("!") ? !a.signals.has(key.slice(1))
      : a.signals.has(key);
    if(ok) fired.push({ id: key, ...rule, claim: typeof rule.claim === "function" ? rule.claim(a) : rule.claim });
  }
  fired.sort((x, y)=>y.weight - x.weight);
  if(fired.length < 2) fired.push({ id: "*", ...LENSES[lens].rules["*"] });
  const risk = fired.reduce((s, r)=>s + r.weight, 0) + (lens === "skeptic" ? 1 : 0);
  const vote = risk <= 2 ? "GO" : risk <= 6 ? "REVISE" : "NO-GO";
  return { lens, rules: fired, risk, vote, analysis: a };
}
function ideaTitle(idea){
  const s = String(idea || "").replace(/\s+/g, " ").trim();
  return s.length > 72 ? s.slice(0, 69).replace(/\s+\S*$/, "") + "…" : s;
}
const T = {
  lean:    { en:"Leaning {vote}.", es:"Me inclino por {vote}." },
  flagged: { en:"@{target}, you flagged {label}.", es:"@{target}, marcaste {label}." },
  counter: {
    architect: { en:"Agreed it's real; the architecture should make it cheap to find out. {fix}", es:"Coincido en que es real; la arquitectura debería hacer barato averiguarlo. {fix}" },
    skeptic:   { en:"Solving that still assumes people want this at all. {claim}", es:"Resolver eso igual asume que la gente lo quiere. {claim}" },
    ux:        { en:"From the user's chair the bigger risk is {label}. {fix}", es:"Desde la silla del usuario, el riesgo mayor es {label}. {fix}" },
    cost:      { en:"Fixing it costs money too. {claim}", es:"Arreglarlo también cuesta plata. {claim}" }
  },
  votePrefix: { en:"VOTE: {vote} — only if we commit to this: {fix}", es:"VOTE: {vote} — solo si nos comprometemos a esto: {fix}" },
  votePrefixGo: { en:"VOTE: GO — keep an eye on {label}.", es:"VOTE: GO — ojo con {label}." },
  voteNoGo: { en:"VOTE: NO-GO — {claim} Cheapest test before revisiting: {fix}", es:"VOTE: NO-GO — {claim} Prueba más barata antes de reconsiderar: {fix}" }
};
// phase: "open" | "cross" | "converge". Returns { text, vote, lens }.
function deliberationTurn(input){
  const { ai, index = 0, phase, target, targetIndex = 0, idea, lang = "en" } = input;
  const L = lang === "es" ? "es" : "en";
  const lens = lensFor(ai, index);
  const mine = assess(lens, idea);
  const [top, second] = mine.rules;
  const loc = v=>localized(v, L);
  const vars = { vote: mine.vote };
  if(phase === "open"){
    const voice = VOICES[ai.name] && !ai.role ? " " + voiceFor(ai, L) : "";
    const parts = [`${loc(LENSES[lens].voice)}: ${loc(top.claim)}`];
    if(second) parts.push(loc(second.claim));
    parts.push(fill(loc(T.lean), vars) + voice);
    return { text: parts.join(" "), lens };
  }
  if(phase === "cross"){
    const tLens = target ? lensFor(target, targetIndex) : lens;
    const theirs = assess(tLens, idea).rules[0];
    const own = second || top;
    const text = (target ? fill(loc(T.flagged), { target: target.name, label: loc(theirs.label) }) + " " : "")
      + fill(loc(T.counter[lens]), { fix: loc(own.fix), claim: loc(own.claim), label: loc(own.label) });
    return { text, lens };
  }
  const tpl = mine.vote === "GO" ? T.votePrefixGo : mine.vote === "NO-GO" ? T.voteNoGo : T.votePrefix;
  return { text: fill(loc(tpl), { vote: mine.vote, fix: loc(top.fix), claim: loc(top.claim), label: loc(top.label) }), vote: mine.vote, lens };
}
const MEMO_TEXT = {
  GO:       { en:"Ship a thin slice now; watch {label} from day one.", es:"Lanzar una versión mínima ya; vigilar {label} desde el día uno." },
  REVISE:   { en:"Proceed only after addressing {label}: {fix}", es:"Avanzar solo después de resolver {label}: {fix}" },
  "NO-GO":  { en:"Stop here. {claim} Cheapest test before revisiting: {fix}", es:"Frenar acá. {claim} Prueba más barata antes de reconsiderar: {fix}" },
  owner:    { en:"owner", es:"responsable" },
  rerun:    { en:"Re-run the War Room with the results and real numbers.", es:"Volver a correr el War Room con los resultados y números reales." },
  boxes:    { en:["Within 48h", "Week 1", "Week 2", "Week 3"], es:["En 48 h", "Semana 1", "Semana 2", "Semana 3"] }
};
/* Deterministic synthesis. `votes` (lens order) may come from live LLM turns; missing votes use the offline assessment. */
function synthesizeMemo(input){
  const { idea, members = [], votes = [], lang = "en" } = input;
  const L = lang === "es" ? "es" : "en";
  const loc = v=>localized(v, L);
  const panel = members.filter(ai=>ai && !ai.muted).map((ai, i)=>({ ai, assessment: assess(lensFor(ai, i), idea) }));
  const finalVotes = panel.map((p, i)=>votes[i] || p.assessment.vote);
  const { verdict, counts } = tallyVerdict(finalVotes);
  const ranked = [];
  const seen = new Set();
  panel.forEach(p=>p.assessment.rules.forEach((r, order)=>ranked.push({ ...r, order, owner: p.ai })));
  ranked.sort((a, b)=>b.weight - a.weight || a.order - b.order);
  const risks = ranked.filter(r=>{
    const key = loc(r.label);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
  const lead = risks[0] || { label: "", fix: "", claim: "" };
  const tpl = MEMO_TEXT[verdict];
  const sectionTitle = i=>loc(MEMO_SECTIONS[i].title);
  const tag = ai=>`${ai.emoji || LENS_EMOJI[lensFor(ai, 0)]} ${ai.name}`;
  const steps = risks.map((r, i)=>`${MEMO_TEXT.boxes[L][i]}: ${loc(r.fix)} (${loc(MEMO_TEXT.owner)}: ${r.owner.name})`);
  steps.push(`${MEMO_TEXT.boxes[L][Math.min(steps.length, 3)]}: ${loc(MEMO_TEXT.rerun)}`);
  return {
    idea: ideaTitle(idea),
    verdict,
    counts,
    source: "offline",
    sections: [
      { key: "decision", title: sectionTitle(0), items: [fill(loc(tpl), { label: loc(lead.label), fix: loc(lead.fix), claim: loc(lead.claim) })] },
      { key: "rationale", title: sectionTitle(1), items: panel.map((p, i)=>`${tag(p.ai)} (${finalVotes[i]}): ${loc(p.assessment.rules[0].claim)}`) },
      { key: "risks", title: sectionTitle(2), items: risks.map(r=>`${loc(r.label)} → ${loc(r.fix)}`) },
      { key: "next", title: sectionTitle(3), items: steps }
    ]
  };
}

return { llmSpend, VOICES, voiceFor, classify, classifyMatch, focusWord, reply, SIGNALS, LENSES, LENS_IDS, analyzeIdea, lensFor, assess, deliberationTurn, synthesizeMemo, ideaTitle };
});
