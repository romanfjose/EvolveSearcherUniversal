// Deterministic coaching trees. Pure data + pure functions: no DOM, no network, no randomness.
// Shared by the React app (offline fallback), the standalone build (docs/index.html) and the tests.
//
// Each domain: 4 hypotheses, and 4 challenges where challenge i is designed to test hypothesis i
// (`tests`) and states the observation that would weaken it (`falsifier`).

export const DIFFICULTY_ORDER = ["Almost effortless", "Very easy", "Easy"];

const cooking = {
  id: "cooking",
  label: "Cooking & Sensory Mastery",
  example: "I hate cooking because it feels like too much work and the food usually disappoints me.",
  keywords: ["cook", "kitchen", "meal", "food", "recipe", "dinner", "lunch", "breakfast", "bake", "baking", "season", "groceries", "pasta", "cocina", "cocinar", "comida", "receta", "fideo"],
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
      id: "pasta", tests: ["uncertainty"], title: "Pasta with ready-made sauce", time: "15–20 min", difficulty: "Very easy",
      why: "One pot, familiar ingredients, and the package answers almost every question.",
      falsifier: "If you finish without getting stuck on any step, “I don't know how” is weaker than it felt—the blocker may be starting, not skill.",
      minimum_success: "Serve yourself one hot, edible plate. It does not need to be impressive.",
      materials: ["Pasta", "Ready-made tomato sauce", "Salt", "A pot", "A strainer or pot lid"],
      steps: ["Fill a pot about two-thirds with water.", "Heat it on high until the water bubbles strongly.", "Add a pinch of salt and the pasta.", "Set a timer for the time printed on the pasta package.", "Stir once or twice so it does not stick.", "Carefully drain the water, pouring away from you.", "Put the pasta on a plate and add the ready-made sauce.", "Taste it. You cooked a meal."],
      upgrades: ["Warm the sauce in a second small pot.", "Add grated cheese or canned vegetables.", "Make a simple tomato sauce next time."],
      success_signals: ["You started", "You served a hot meal", "You learned one thing for next time"],
    },
    {
      id: "soup", tests: ["friction"], title: "Instant soup plus toast", time: "8–12 min", difficulty: "Almost effortless",
      why: "A tiny win that removes nearly all planning, shopping, and cleanup.",
      falsifier: "If you still skip it when the whole job is one pot and under 15 minutes, effort is probably not the main blocker.",
      minimum_success: "Make the soup safely and eat some of it.",
      materials: ["Instant soup", "Water", "A pot or microwave-safe bowl", "Bread (optional)"],
      steps: ["Read the water amount on the package.", "Measure that amount into a pot or microwave-safe bowl.", "Heat the water as directed on the package.", "Add the soup mix and stir.", "Cook for the package time.", "Let it cool for one minute, then taste it.", "Toast bread if you want something more filling."],
      upgrades: ["Add frozen vegetables.", "Add an egg while the soup simmers.", "Try a basic homemade soup later."],
      success_signals: ["You made food instead of skipping", "It took under 15 minutes", "Cleanup stayed small"],
    },
    {
      id: "milanesa", tests: ["payoff"], title: "Milanesa with instant mash", time: "20–25 min", difficulty: "Easy",
      why: "A complete-feeling meal you can rate against the delivery you would otherwise order.",
      falsifier: "If your after-rating meets or beats your before-rating, or the money saved matters more than expected, “not worth it” loses support.",
      caution: "Cook the meat until it is hot all the way through; follow the package for minimum times.",
      minimum_success: "Cook the milanesa through, prepare the mash, and compare your before and after ratings.",
      materials: ["Prepared milanesa", "Instant mashed potatoes", "Oil or an oven/air fryer", "Water or milk as directed"],
      steps: ["Write the price of a comparable delivery meal and rate how good you expect this to be (1–5).", "Choose the cooking method printed on the milanesa package.", "Start heating the oven, air fryer, or pan as directed.", "Cook the milanesa for the package time, turning it if directed.", "Prepare the instant mash by following its water or milk measurements.", "Check that the milanesa is hot and fully cooked in the center.", "Eat, then rate it again (1–5) and compare with your first rating."],
      upgrades: ["Add a tomato salad.", "Make mashed potatoes from fresh potatoes.", "Bread your own milanesa another day."],
      success_signals: ["You coordinated two simple components", "The center was fully cooked", "You compared expected and actual value"],
    },
    {
      id: "salt-ladder", tests: ["failure"], title: "Season one egg three ways", time: "10–15 min", difficulty: "Easy",
      why: "Disappointing food usually comes from one adjustable variable—salt—not from a lack of talent.",
      falsifier: "If one pinch makes a difference you can clearly taste, bad results are adjustable rather than a fixed trait—the hypothesis loses support.",
      caution: "Cook the eggs until no liquid egg remains.",
      minimum_success: "Taste three versions and say which you prefer and why, in one sentence.",
      materials: ["2 eggs", "Butter or oil", "Salt", "A pan and spatula", "Black pepper or lemon (optional)"],
      steps: ["Beat the eggs in a bowl without salt.", "Heat a little butter or oil in a pan over medium-low heat.", "Cook the eggs gently, stirring, until no liquid egg remains.", "Split them into three portions on a plate.", "Leave the first plain, add a small pinch of salt to the second, and salt plus pepper or a drop of lemon to the third.", "Taste them in order, sipping water between bites.", "Write which you liked best and one word for why."],
      upgrades: ["Repeat the ladder with rice or toast.", "Compare salt added during cooking with salt added at the end.", "Have someone else choose the tasting order so it's blind."],
      success_signals: ["You tasted a difference between versions", "You know one adjustment that improves your food", "Nothing burned or stayed runny"],
    },
  ],
  faq: [
    [/pasta|fideo|noodle/i, "Use any dried pasta you like. The package cooking time is more reliable than a universal timer because shapes and brands vary."],
    [/water|agua/i, "Use enough water for the food to move freely. For pasta, a pot about two-thirds full is a simple beginner rule—leave room so it cannot boil over."],
    [/salt|season|bland|sal\b/i, "Add salt in small pinches and taste between each. You can always add more, but you can't take it out."],
    [/raw|undercook|safe|chicken|pink/i, "When in doubt, cook until the center is steaming hot with no pink or runny parts, and follow the package for minimum times."],
  ],
};

const software = {
  id: "software",
  label: "Software Architecture & Bottleneck Debugging",
  example: "Our API endpoint is slow and I keep guessing at the bottleneck instead of fixing it.",
  keywords: ["code", "coding", "bug", "debug", "latency", "performance", "refactor", "architecture", "api", "endpoint", "database", "query", "queries", "deploy", "server", "bottleneck", "memory leak", "profil", "codebase", "microservice", "flaky", "backend", "frontend", "software"],
  reflection: "“It's slow” or “this code is a mess” bundles several different claims: where the time goes, whether you can see the problem at all, and whether the design punishes change. Each one is checkable in minutes once you stop guessing and start measuring.",
  hypotheses: [
    { id: "waiting", title: "It's waiting, not computing", explanation: "Most of the time goes to network, disk, or database round-trips, so optimizing code won't help." },
    { id: "hot-path", title: "One hot path dominates", explanation: "A single function, query, or loop accounts for most of the cost, and the rest is noise." },
    { id: "invisible", title: "I can't reproduce it reliably", explanation: "The problem appears intermittently, so every fix is a guess you can't confirm." },
    { id: "coupling", title: "Every change feels risky", explanation: "The design is coupled enough that small edits ripple, so you avoid touching it." },
  ],
  challenge_intro: "Each test makes one prediction you can lose. Write the prediction down before you look at the numbers.",
  challenges: [
    {
      id: "time-split", tests: ["waiting"], title: "Split wall time from CPU time", time: "10 min", difficulty: "Almost effortless",
      why: "If the process is mostly waiting, wall time will be far larger than CPU time.",
      falsifier: "If CPU time (user + sys) is close to wall time, the program is busy computing and “it's waiting” loses support.",
      minimum_success: "Record wall, user, and sys time for one slow run and write which is larger.",
      materials: ["The slow command, script, or request", "`time` (macOS/Linux), `Measure-Command` (PowerShell), or the browser DevTools Network tab", "A note for your prediction"],
      steps: ["Write your prediction: will wall time be at least twice CPU time? Yes or no.", "Pick one slow operation you can trigger on demand.", "Run it once to warm caches, then run it under `time` or `Measure-Command`.", "Copy the real, user, and sys numbers into your note.", "Compute CPU share = (user + sys) ÷ real. Above 1 is possible for multi-threaded work and still means computing.", "For a web request, read DevTools → Network → Timing and compare Waiting (TTFB) with Content Download instead.", "Mark your prediction right or wrong."],
      upgrades: ["Repeat five runs and use the median.", "Wrap the suspected network or database call in a timer to measure its share directly.", "Use `strace -c` or the database's slow-query log to see what it waits on."],
      success_signals: ["You have numbers instead of a feeling", "Your prediction was scored", "You know whether to optimize code or round-trips"],
    },
    {
      id: "predict-profile", tests: ["hot-path"], title: "Predict, then profile one run", time: "20–25 min", difficulty: "Easy",
      why: "Writing your guess first turns profiling into a test of your mental model, not just a chart.",
      falsifier: "If the top entry accounts for less than about 20% of samples, cost is spread out and “one hot path” loses support.",
      minimum_success: "Write a ranked guess of the top three costs, capture one profile, and compare.",
      materials: ["A profiler: DevTools Performance, `node --cpu-prof`, `py-spy`, `pprof`, or `EXPLAIN ANALYZE`", "One reproducible slow operation", "A note"],
      steps: ["Write your top three guesses for where the time goes, most expensive first.", "Start the profiler with the smallest input that still feels slow.", "Trigger the slow operation once and stop the profiler.", "Sort by self time and copy the top three entries with their percentages.", "Mark each guess as hit, near miss, or miss.", "Write down the top entry's share of the total.", "If one entry is above about 20%, it is your next target; if not, look for repeated small costs such as N+1 queries."],
      upgrades: ["Profile again after one change and compare the same entry.", "Generate a flame graph and look for the widest plateau.", "Keep a log of guesses against results to watch your intuition improve."],
      success_signals: ["You scored your guesses against data", "You know the biggest cost, or that none dominates", "Your next change has a measurable target"],
    },
    {
      id: "repro-loop", tests: ["invisible"], title: "Build a ten-run reproduction loop", time: "15–25 min", difficulty: "Easy",
      why: "A bug you can trigger on demand becomes a measurement; one you can't stays a rumor.",
      falsifier: "If the issue appears in 9 or 10 of 10 runs, reproduction isn't the bottleneck—understanding the cause is.",
      minimum_success: "Run one scripted trigger ten times and record how many runs show the problem.",
      materials: ["A script, test, or curl command that exercises the suspected path", "A way to detect failure: an assertion, timing threshold, or log line", "A tally note"],
      steps: ["Write the symptom as a check, such as “response takes over 2 s” or “field X is missing”.", "Predict how many of ten runs will fail.", "Turn the trigger into one command you can rerun without manual steps.", "Run it ten times in a loop and count failures.", "Record anything that differs between failing and passing runs: input, timing, order, concurrency.", "If failures are rare, change one condition (more concurrency, a cold cache, larger input) and run ten more.", "Compare the failure rate with your prediction."],
      upgrades: ["Commit the loop as a test so it guards the fix.", "Use `git bisect run` with the loop to find the commit that introduced it.", "Add structured logs at the boundary where failing runs diverge."],
      success_signals: ["The symptom is a check, not a description", "You have a failure rate", "You found a condition that changes the rate"],
    },
    {
      id: "change-probe", tests: ["coupling"], title: "Make one harmless change and trace the ripple", time: "15–20 min", difficulty: "Very easy",
      why: "Coupling shows up as how far a trivial change travels, and that distance can be counted.",
      falsifier: "If a small behavior-preserving change touches two or fewer files and the tests stay green, coupling is not what's blocking you.",
      minimum_success: "Make one behavior-preserving change, count files touched and tests broken, then keep it or revert it.",
      materials: ["A clean branch", "The module you avoid touching", "Your test suite or a quick manual check"],
      steps: ["Create a fresh branch so reverting costs nothing.", "Predict how many files renaming one internal function in that module will touch.", "Rename it, or extract one small function, with your editor's refactor tool.", "Count the changed files with `git diff --stat`.", "Run the tests or your quickest manual check.", "Write down files touched, tests broken, and minutes spent.", "Keep the change if it's green and clearer; otherwise revert it without guilt."],
      upgrades: ["List the modules that import this one to sketch its fan-in.", "Add one characterization test before the next change.", "Introduce a small interface at the most-imported boundary."],
      success_signals: ["You have a ripple count instead of a feeling", "Reverting was cheap", "You know which boundary causes the most ripple"],
    },
  ],
  faq: [
    [/profil|flame|perf/i, "Start with the profiler built into your runtime: DevTools Performance for browsers, `node --cpu-prof` for Node, `py-spy` for Python. Use the smallest input that still reproduces the slowness so the profile stays readable."],
    [/database|query|sql|n\+1|orm/i, "Log the queries for one request and count them. Dozens of near-identical queries usually mean an N+1 pattern; then run EXPLAIN ANALYZE on the slowest one."],
    [/flaky|intermittent|random|race/i, "Intermittent issues usually depend on order, timing, or shared state. Run the same check in a loop, then vary one condition at a time: concurrency, cache state, input size."],
    [/prod|production|live/i, "Run these experiments locally or in staging first. If you must measure production, prefer read-only signals such as existing metrics and logs over adding load."],
  ],
};

const freelance = {
  id: "freelance",
  label: "Freelance & Market Demand Testing",
  example: "I want to freelance but I don't know if anyone would actually pay for what I do.",
  keywords: ["freelanc", "client", "customer", "gig", "side hustle", "side project", "pricing", "charge", "sell", "market", "demand", "offer", "consult", "business", "revenue", "startup", "clientes", "vender", "negocio"],
  reflection: "“Will anyone pay for this?” mixes four separate unknowns: whether the need exists, who has it, whether your offer is clear, and whether you're willing to put it in front of people. Each can be tested with public evidence or one honest conversation—no website or business plan required.",
  hypotheses: [
    { id: "no-demand", title: "Nobody needs this enough to pay", explanation: "The problem you solve may be real but not painful enough for people to spend money on it." },
    { id: "unclear-offer", title: "My offer isn't clear yet", explanation: "People can't tell what they would get, how long it takes, or what it costs." },
    { id: "no-buyer", title: "I don't know who would buy", explanation: "You can describe the skill, but not the specific person or company with the budget." },
    { id: "exposure", title: "I'm avoiding putting it out there", explanation: "The fear of rejection or looking salesy is larger than the evidence warrants." },
  ],
  challenge_intro: "These tests use public evidence and honest, low-pressure asks. Each one can prove your worry wrong.",
  challenges: [
    {
      id: "demand-scan", tests: ["no-demand"], title: "Find five people already paying", time: "20–25 min", difficulty: "Very easy",
      why: "Existing paid requests are the cheapest evidence that demand exists.",
      falsifier: "If you find five or more paid requests from the last 30 days, “nobody would pay” loses support.",
      minimum_success: "Search for 20 minutes and record every paid request you find, even if the count is zero.",
      materials: ["A 20-minute timer", "Job boards, freelance marketplaces, or community forums in your field", "A tally with link, date, and budget"],
      steps: ["Predict how many paid requests from the last 30 days you'll find in 20 minutes.", "Write the outcome you provide in plain words, such as “fix slow WordPress sites”.", "Search two or three places where buyers post work, using the words a buyer would use.", "Save each request from the last 30 days with its link, date, and stated budget.", "Stop when the timer rings.", "Count the requests and note the typical budget range.", "Compare the count with your prediction."],
      upgrades: ["Repeat with a narrower niche phrase and compare counts.", "Reuse the exact words buyers wrote in your own offer.", "Run the same search weekly to see whether demand is steady."],
      success_signals: ["You have a count, not a guess", "You know a realistic price range", "You collected buyers' own words"],
    },
    {
      id: "offer-echo", tests: ["unclear-offer"], title: "Get your offer explained back", time: "15 min", difficulty: "Easy",
      why: "An offer is clear when someone else can repeat it correctly without your help.",
      falsifier: "If at least two of three people explain your offer back correctly, clarity is not the bottleneck.",
      minimum_success: "Write a one-sentence offer and hear at least one person explain it back.",
      materials: ["One sentence: “I help [who] get [result] in [time] for [price]”", "Three people you already talk to—friends or peers count"],
      steps: ["Fill in the sentence with your best current guess, including a price.", "Predict how many of three people will explain it back correctly.", "Send it to three people and ask: “In your own words, what would you get and for how much?”", "Don't clarify or defend—just collect their answers.", "Mark each answer correct, partly correct, or wrong.", "Rewrite the part people got wrong most often."],
      upgrades: ["Ask “Who do you know who would need this?” as a follow-up.", "Test two price points with different people.", "Turn the clearest version into your profile headline."],
      success_signals: ["Someone repeated your offer accurately", "You found the confusing word or missing detail", "You have a sharper one-sentence offer"],
    },
    {
      id: "buyer-list", tests: ["no-buyer"], title: "Name ten specific buyers", time: "15 min", difficulty: "Almost effortless",
      why: "If you can't name buyers, outreach and marketing have no target—so naming them is the test.",
      falsifier: "If you list ten specific people or companies with evidence of the problem in 15 minutes, “I don't know who would buy” loses support.",
      minimum_success: "List as many specific buyers as you can in 15 minutes, even if it's fewer than ten.",
      materials: ["A 15-minute timer", "A list with columns: name, why they have the problem, how you know"],
      steps: ["Predict how many specific buyers you'll list in 15 minutes.", "Start with people and companies you've worked with or near.", "Add businesses showing the visible symptom your work fixes.", "Write one line of evidence for each that they have the problem.", "Stop at 15 minutes and count the names that have evidence.", "Circle the three that seem most able to pay."],
      upgrades: ["Group the list by industry and see which group dominates.", "Find where your top group gathers online.", "Study one buyer's public pain points in more depth."],
      success_signals: ["You have named targets", "Each name has evidence, not hope", "A dominant buyer type emerged"],
    },
    {
      id: "one-ask", tests: ["exposure"], title: "Make one small, honest paid offer", time: "10–15 min", difficulty: "Easy",
      why: "The fear of asking is a prediction; one real ask measures it.",
      falsifier: "If the discomfort you feel after sending is lower than you predicted, avoidance was costing more than the risk itself.",
      minimum_success: "Send one honest message offering a small, specific paid service, and rate your discomfort before and after.",
      materials: ["One contact who plausibly has the problem", "Your one-sentence offer with a price", "A discomfort scale from 1 to 10"],
      steps: ["Rate how uncomfortable you expect sending to feel, from 1 to 10.", "Choose someone you already know who plausibly has the problem.", "Write three or four sentences: what you noticed, the small fix you offer, the price, and an easy way to say no.", "Remove any pressure or exaggeration; keep every claim true.", "Send it.", "Ten minutes later, rate how you actually feel from 1 to 10.", "Write the difference between predicted and actual discomfort, whatever their reply."],
      upgrades: ["Send two more using the same template.", "Offer a fixed-scope pilot with a clear end date.", "Ask for a referral if they decline."],
      success_signals: ["You sent a real offer", "You measured discomfort instead of assuming it", "A reply—even “no”—is market data"],
    },
  ],
  faq: [
    [/price|pricing|charge|rate|how much|cobrar/i, "Anchor on the value of the outcome and on the budgets you saw in real requests, then set a fixed price for a small, well-defined scope. A clear fixed price is easier to accept than an hourly rate."],
    [/spam|salesy|pushy|cold/i, "Keep it honest and easy to decline: one specific observation, one small offer, one price, and “no worries if not”. That's a question, not spam."],
    [/portfolio|experience|no client|first client/i, "A portfolio can be one small, real result: a before-and-after, a fixed bug, a rewritten page. Ask permission to describe client work, or build a sample on a public example."],
    [/landing|website|page/i, "You don't need a website to test demand. If you build a test page, say plainly what is and isn't available yet."],
  ],
};

const habits = {
  id: "habits",
  label: "Habit & Energy Calibration",
  example: "I keep avoiding exercise and I'm always tired in the afternoon.",
  keywords: ["habit", "routine", "energy", "tired", "fatigue", "sleep", "morning", "exercise", "workout", "gym", "running", "jog", "procrastinat", "consisten", "focus", "afternoon", "meditat", "hábito", "habito", "energía", "dormir", "cansad", "ejercicio"],
  reflection: "“I can't stick with it” and “I'm always tired” are usually summaries of something more specific: when you try, how big the attempt is, what reminds you, and how you slept. Your own day is the lab, and a few cheap measurements beat another round of willpower.",
  hypotheses: [
    { id: "timing", title: "I'm trying at my low-energy time", explanation: "Your energy follows a daily pattern, and the habit lands in a dip." },
    { id: "too-big", title: "The habit is too big to start", explanation: "The first step asks for more effort than an ordinary day can supply." },
    { id: "no-cue", title: "Nothing reminds me at the right moment", explanation: "The intention exists, but nothing in your surroundings triggers it." },
    { id: "sleep", title: "My sleep is too irregular", explanation: "Inconsistent sleep timing leaves you drained regardless of the plan." },
  ],
  challenge_intro: "Your own day is the lab. Each test is cheap, and each one can show the explanation is wrong.",
  challenges: [
    {
      id: "energy-map", tests: ["timing"], title: "Map your energy for three days", time: "1 min, 3× a day", difficulty: "Almost effortless",
      why: "Three quick ratings a day reveal whether your energy really dips when you've been trying.",
      falsifier: "If your ratings at the habit's usual time are no lower than at other times, “wrong time of day” loses support.",
      minimum_success: "Log at least six energy ratings across two days.",
      materials: ["Three phone alarms: morning, early afternoon, evening", "A note with columns: day, time, energy 1–5, what you just did"],
      steps: ["Predict your lowest-energy time of day and write it down.", "Set three daily alarms at fixed times, including the time you usually try the habit.", "When each alarm rings, rate your energy 1–5 in under 30 seconds.", "Add a two-word note on what you just did, such as “ate lunch” or “long meeting”.", "Repeat for three days without changing your routine.", "Average each time slot and find the lowest one.", "Compare the real dip with your prediction and with the habit's current time."],
      upgrades: ["Move the habit to your highest-rated slot for three days.", "Add a rating 30 minutes after caffeine or meals.", "Extend to a full week so it includes a day off."],
      success_signals: ["You have ratings, not impressions", "You know your real peak and dip", "You can schedule against data"],
    },
    {
      id: "two-minute", tests: ["too-big"], title: "Do the two-minute version today", time: "2–5 min", difficulty: "Almost effortless",
      why: "If size is the blocker, a version too small to resist should happen without a fight.",
      falsifier: "If you skip even the two-minute version, size isn't the main blocker—look at timing or cues instead.",
      minimum_success: "Do the two-minute version once today. Stopping after two minutes is allowed.",
      materials: ["The habit shrunk to under two minutes", "A moment when you're already in the right place"],
      steps: ["Predict how likely you are to do it today, from 0 to 100%.", "Shrink the habit until it takes under two minutes: put on running shoes, read one page, write one sentence.", "Pick a moment today when you'll already be in the right place.", "Do the two-minute version at that moment.", "Stop after two minutes unless you genuinely want to continue.", "Note whether you did it and how much resistance you felt, from 1 to 5."],
      upgrades: ["Repeat tomorrow at the same moment.", "Add one minute only after three days in a row.", "Track a simple streak on paper."],
      success_signals: ["You started without negotiating with yourself", "Resistance was lower than expected", "You know whether size was the problem"],
    },
    {
      id: "cue-path", tests: ["no-cue"], title: "Put the cue in your path", time: "5 min", difficulty: "Very easy",
      why: "If forgetting is the problem, a visible cue at the right moment should be enough to trigger the habit.",
      falsifier: "If you see the cue and still skip the habit, the cue was not the missing piece.",
      minimum_success: "Place one cue tonight and note tomorrow whether you saw it and whether you acted.",
      materials: ["The object the habit needs: shoes, book, water bottle", "A sticky note"],
      steps: ["Write the exact moment the habit should start, such as “after I pour coffee”.", "Put the object where that moment happens: shoes by the coffee machine, book on the pillow.", "Add a sticky note naming the first physical action.", "Predict whether you'll act when you see it, from 0 to 100%.", "Tomorrow, record two things: did you see the cue, and did you act?"],
      upgrades: ["Pair it with an existing habit: “After I…, I will…”.", "Remove a competing cue, such as the phone on the nightstand.", "Keep the same cue for three days."],
      success_signals: ["The cue was impossible to miss", "You know whether forgetting or reluctance was the issue"],
    },
    {
      id: "anchor-wake", tests: ["sleep"], title: "Fix your wake time for three days", time: "3 mornings", difficulty: "Easy",
      why: "A consistent wake time is the simplest lever on sleep regularity, and three days is enough to notice a trend.",
      falsifier: "If afternoon energy doesn't improve at all after three consistent mornings, irregular sleep is probably not the main drain.",
      caution: "This is a personal experiment, not medical advice. Persistent exhaustion, loud snoring, or daytime sleepiness are worth raising with a doctor.",
      minimum_success: "Wake within 30 minutes of the same time on at least two of three days, and rate afternoon energy each day.",
      materials: ["An alarm", "A note for wake time and 3 p.m. energy (1–5)", "Morning daylight, if possible"],
      steps: ["Write today's afternoon energy (1–5) as a baseline.", "Choose a wake time you can keep on all three days, including a day off.", "Set the alarm and put it out of reach of the bed.", "Get outside light within an hour of waking if you can.", "At 3 p.m. each day, rate your energy 1–5.", "After three days, compare the ratings with your baseline."],
      upgrades: ["Keep the wake time for a full week.", "Add a wind-down alarm an hour before bed.", "Log caffeine timing next to your energy ratings."],
      success_signals: ["Wake time stayed within 30 minutes", "You compared energy to a baseline", "You know whether sleep timing matters for you"],
    },
  ],
  faq: [
    [/doctor|medical|insomnia|exhaust|always tired|depress|médico/i, "These are personal experiments, not medical advice. If tiredness is persistent or severe, or comes with snoring or low mood, it's worth talking to a doctor."],
    [/miss|skip|broke|streak/i, "A missed day is data, not failure. Note what was different that day and resume at the same tiny size—never double up to compensate."],
    [/caffeine|coffee|café/i, "Note caffeine times next to your energy ratings. Late-day caffeine can affect sleep, so that's worth its own experiment."],
  ],
};

const social = {
  id: "social",
  label: "Social & Communication Hypothesis Testing",
  example: "I want to speak up in meetings but I freeze and stay quiet.",
  keywords: ["speak up", "meeting", "conversation", "talk to", "talking to", "awkward", "shy", "social", "friends", "networking", "presentation", "public speaking", "feedback", "conflict", "small talk", "say no", "colleague", "coworker", "hablar", "reunión", "timid"],
  reflection: "Holding back in conversations usually rests on predictions—how people will react, what you'd say, when you'd say it. Predictions can be checked: say one small thing, watch what actually happens, and compare it with what you expected.",
  hypotheses: [
    { id: "harsh-judgment", title: "People will judge me harshly", explanation: "You expect a visibly negative reaction if you speak, and that expectation keeps you quiet." },
    { id: "blank", title: "I don't know what to say in the moment", explanation: "Your thoughts arrive after the conversation has moved on." },
    { id: "perfect-moment", title: "I wait for the perfect moment", explanation: "You hold back until the timing feels ideal, and the opening passes." },
    { id: "not-interested", title: "People aren't interested in what I say", explanation: "You assume others don't value your input, so contributing feels pointless." },
  ],
  challenge_intro: "Every test starts with a written prediction, so reality—not your mood afterward—scores it.",
  challenges: [
    {
      id: "reaction-bet", tests: ["harsh-judgment"], title: "Bet on the reaction, then speak once", time: "5 min + one meeting", difficulty: "Easy",
      why: "Writing the expected reaction first lets reality score your fear.",
      falsifier: "If the reaction is neutral or positive when you predicted negative, “people will judge me harshly” loses support.",
      minimum_success: "Write a predicted reaction, say one sentence in one conversation, and record the actual reaction.",
      materials: ["One upcoming meeting or group conversation", "A note with columns: prediction, what I said, what happened"],
      steps: ["Before the conversation, write the reaction you expect if you speak and how likely it is (0–100%).", "Choose one modest contribution: agreeing with a reason, a question, or a short summary.", "Say it once, at any point in the conversation.", "Notice the reaction: faces, replies, whether the conversation continued.", "Within an hour, write what actually happened in one or two sentences.", "Mark the result better than, the same as, or worse than your prediction."],
      upgrades: ["Make a slightly bolder contribution next time.", "Repeat across three meetings and tally how often the feared reaction happened.", "Ask a trusted colleague how your point came across."],
      success_signals: ["You spoke at least once", "You scored a prediction against reality", "Your fear now has a measured hit rate"],
    },
    {
      id: "prepared-line", tests: ["blank"], title: "Bring one prepared question", time: "10 min + one conversation", difficulty: "Very easy",
      why: "If blanking is the issue, having words ready in advance should make speaking noticeably easier.",
      falsifier: "If you have the prepared question and still don't use it, blanking isn't the main blocker—check timing or the fear of judgment.",
      minimum_success: "Ask one question you prepared in advance.",
      materials: ["The agenda or topic of an upcoming conversation", "One question written on paper or your phone"],
      steps: ["Look at the topic and write three questions you're genuinely curious about.", "Pick the simplest and trim it to under 15 words.", "Keep it visible during the conversation.", "Ask it when the topic comes up, or near the end if it doesn't.", "Rate how it felt from 1 (awful) to 5 (easy), and note how people responded."],
      upgrades: ["Prepare an opinion with a reason instead of a question.", "Prepare a follow-up for whatever answer you get.", "Try it without notes next time."],
      success_signals: ["You had words ready", "You asked it out loud", "You learned whether preparation lowers the barrier"],
    },
    {
      id: "first-three", tests: ["perfect-moment"], title: "Speak within the first three minutes", time: "One conversation", difficulty: "Easy",
      why: "Early contributions are low-stakes and stop the wait for a perfect moment from building.",
      falsifier: "If speaking early feels as hard as speaking later, timing isn't the blocker.",
      minimum_success: "Say one substantive sentence within the first three minutes.",
      materials: ["One upcoming conversation", "An easy opener, such as “Quick question before we start…”"],
      steps: ["Prepare one easy opener tied to the topic.", "Predict how uncomfortable speaking early will feel, from 1 to 10.", "Note the time when the conversation starts.", "Say your opener before three minutes pass.", "Afterward, rate the actual discomfort from 1 to 10.", "Compare: was early easier than, the same as, or harder than waiting usually feels?"],
      upgrades: ["Make the early contribution an opinion instead of a question.", "Do it in two conversations this week.", "Try it in a larger group."],
      success_signals: ["You spoke before the moment could build up", "You compared predicted and actual discomfort"],
    },
    {
      id: "micro-rep", tests: ["not-interested"], title: "Ask one low-stakes question", time: "2 min", difficulty: "Almost effortless",
      why: "Everyday exchanges test whether people engage with you when the stakes are near zero.",
      falsifier: "If the person engages—answers fully, smiles, or adds something—“people aren't interested” loses support for low-stakes moments.",
      minimum_success: "Ask one genuine question to someone you don't usually talk to, and note their response.",
      materials: ["An ordinary moment: a café, a shared office, a class, a shop"],
      steps: ["Predict whether the person will engage beyond a one-word answer.", "Pick a genuine, easy question: a recommendation, an opinion about something nearby, how something works.", "Ask it with a short reason, such as “I'm trying to choose…”.", "Listen to the full answer and say thanks.", "Write what happened and whether it matched your prediction."],
      upgrades: ["Ask one follow-up question next time.", "Share a small opinion of your own after their answer.", "Do three micro-reps this week and tally engagement."],
      success_signals: ["You started an exchange", "You compared your prediction with the response", "The stakes stayed tiny"],
    },
  ],
  faq: [
    [/anxious|nervous|panic|scared|ansie|nervios/i, "Some nervousness is expected and usually fades within a minute of speaking. Keep the first contribution very short so the experiment stays about reality, not endurance."],
    [/what (should|do|would) i say|words|phrase/i, "Use a question, a summary (“So we're deciding X—is that right?”), or a reason you agree. They're easy to say and invite a reply."],
    [/rude|interrupt/i, "Waiting for a natural pause, or starting with “Can I add something?”, is polite and still counts."],
    [/meeting|manager|boss|reunión/i, "In meetings, a short question or summary is a low-risk contribution that still counts as speaking up."],
  ],
};

export const DOMAINS = [cooking, software, freelance, habits, social];

const genericChallenges = [
  {
    id: "setup", tests: ["unclear"], title: "Prepare tomorrow's first step", time: "5 min", difficulty: "Almost effortless",
    why: "If the start is the unclear part, making it visible and specific should remove the hesitation.",
    falsifier: "If you still hesitate with the first step written and visible, “not knowing where to start” wasn't the main blocker.",
    minimum_success: "Make the first action possible without another decision.",
    materials: ["Whatever the first action requires", "A note"],
    steps: ["Choose a specific time and place.", "Put the needed item where you will see it.", "Write the first physical action on a note.", "Decide what counts as done after five minutes.", "Tomorrow, notice whether you started without deciding anything."],
    upgrades: ["Do the first two minutes now.", "Invite someone to join or check in."],
    success_signals: ["Tomorrow's starting point is visible", "No preparation decision remains"],
  },
  {
    id: "tiny", tests: ["effort"], title: "The ten-minute version", time: "10 min", difficulty: "Very easy",
    why: "Starting produces better information about effort than planning the perfect attempt.",
    falsifier: "If ten minutes feels manageable once you begin, the effort was mostly in the anticipation—“too much effort” loses support.",
    minimum_success: "Spend ten focused minutes doing the smallest real version of the activity.",
    materials: ["A ten-minute timer", "Only the minimum item needed to begin"],
    steps: ["Define the smallest visible result you can make.", "Remove anything you do not need for that result.", "Set a timer for ten minutes.", "Begin before trying to feel ready.", "Stop when the timer rings.", "Notice what was easier or harder than expected."],
    upgrades: ["Continue for another ten minutes.", "Repeat tomorrow with one improvement."],
    success_signals: ["You began", "You produced new evidence", "You found the next obstacle"],
  },
  {
    id: "observe", tests: ["skill"], title: "Watch one real example", time: "10–15 min", difficulty: "Easy",
    why: "A concrete example shows whether the gap is ability or just unfamiliarity.",
    falsifier: "If the observed steps look doable for you, “I'm not capable yet” loses support—what's missing is practice, not ability.",
    minimum_success: "Observe one person or example and write down three things you notice.",
    materials: ["A real example", "Notes"],
    steps: ["Find one credible example of the activity being done.", "Watch without trying to master everything.", "Write down three specific actions you observe.", "Circle the easiest action to copy.", "Try only that action once."],
    upgrades: ["Compare a second example.", "Ask someone why they chose that approach."],
    success_signals: ["You noticed concrete behavior", "You identified one copyable action"],
  },
  {
    id: "payoff-check", tests: ["meaning"], title: "Rate the payoff before and after", time: "15 min", difficulty: "Easy",
    why: "If the value is truly low, a small attempt will confirm it; if it's higher, the doubt was a forecast error.",
    falsifier: "If your after-rating of the value is higher than your before-rating, “not enough value” loses support.",
    minimum_success: "Rate the expected value 1–5, do a ten-minute version, then rate the actual value.",
    materials: ["A ten-minute timer", "A note for before and after ratings"],
    steps: ["Write the one payoff you would most like from this activity.", "Rate how valuable you expect ten minutes of it to feel, from 1 to 5.", "Do the smallest real version for ten minutes.", "Rate how valuable it actually felt, from 1 to 5.", "Write one sentence about what the payoff turned out to be."],
    upgrades: ["Repeat and see whether the rating holds.", "Try a version connected to someone you care about."],
    success_signals: ["You compared expected and actual value", "You know whether the doubt holds up"],
  },
];

export function genericDomain(problem = "") {
  const subject = String(problem).trim() || "this";
  return {
    id: "generic",
    label: "General",
    keywords: [],
    reflection: `“${subject}” may contain several different obstacles. Picking the closest one gives us enough information to try a small reality test without overanalyzing it.`,
    hypotheses: [
      { id: "unclear", title: "I don't know where to start", explanation: "The first useful action is not obvious yet." },
      { id: "effort", title: "It feels like too much effort", explanation: "The expected cost is larger than the expected payoff." },
      { id: "skill", title: "I don't feel capable yet", explanation: "Uncertainty and fear of doing it badly create resistance." },
      { id: "meaning", title: "I don't see enough value in it", explanation: "The reason to act is not personally compelling." },
    ],
    challenge_intro: "Let's replace speculation with one small, reversible attempt.",
    challenges: genericChallenges,
    faq: [
      [/easier|simple|smaller|fácil|facil/i, "Make the minimum success smaller: one serving, one page, one message. Completing the loop matters more than making it impressive."],
    ],
  };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matchers = new Map(DOMAINS.map((domain) => [domain.id, new RegExp(`(?:^|[^\\p{L}])(?:${domain.keywords.map(escapeRegex).join("|")})`, "giu")]));

/** Keyword-count scores per domain id. */
export function domainScores(problem = "") {
  const text = String(problem);
  return Object.fromEntries(DOMAINS.map((domain) => [domain.id, (text.match(matchers.get(domain.id)) || []).length]));
}

/** Highest-scoring domain id; ties keep DOMAINS order; no match → "generic". */
export function detectDomain(problem = "") {
  const scores = domainScores(problem);
  let best = "generic", bestScore = 0;
  for (const domain of DOMAINS) if (scores[domain.id] > bestScore) { best = domain.id; bestScore = scores[domain.id]; }
  return best;
}

export function getDomain(id, problem = "") {
  return DOMAINS.find((domain) => domain.id === id) || genericDomain(problem);
}

const summary = ({ id, tests, title, time, difficulty, why, falsifier }) => ({ id, tests, title, time, difficulty, why, falsifier });

/** Three challenges: the one designed for the hypothesis first, the rest easiest-first. */
export function challengesFor(domain, hypothesisId) {
  const effort = (c) => DIFFICULTY_ORDER.indexOf(c.difficulty);
  const targeted = domain.challenges.filter((c) => c.tests.includes(hypothesisId));
  const rest = domain.challenges.filter((c) => !c.tests.includes(hypothesisId)).sort((a, b) => effort(a) - effort(b));
  return [...targeted, ...rest].slice(0, 3).map(summary);
}

/** Offline equivalent of the `understand` action. */
export function fallbackUnderstanding(problem) {
  const domain = getDomain(detectDomain(problem), problem);
  return { domain: domain.id, reflection: domain.reflection, hypotheses: domain.hypotheses.map((h) => ({ ...h })) };
}

/** Offline equivalent of the `challenges` action. */
export function fallbackChallenges(journey = {}) {
  const domain = getDomain(journey.domain || detectDomain(journey.problem), journey.problem);
  return { challenge_intro: domain.challenge_intro, challenges: challengesFor(domain, journey.selectedHypothesis?.id) };
}

/** Offline equivalent of the `plan` action. Known ids resolve across every tree; custom challenges get a safe template. */
export function fallbackPlan(challenge = {}) {
  const known = [...DOMAINS.flatMap((d) => d.challenges), ...genericChallenges].find((c) => c.id === challenge.id);
  if (known) return { ...challenge, ...known };
  return {
    ...challenge,
    falsifier: "If the smallest version turns out easy once you begin, the resistance lived mostly in the anticipation.",
    minimum_success: `Try the smallest real version of “${challenge.title}” for ten minutes. Finishing perfectly is not required.`,
    materials: ["Only what is necessary to begin", "A ten-minute timer"],
    steps: ["Name the smallest visible result.", "Remove anything that is not needed for that result.", "Prepare the first item you need.", "Set a timer for ten minutes.", "Begin before trying to feel ready.", "Stop when the timer rings and notice what happened."],
    upgrades: ["Continue for ten more minutes.", "Repeat once with one improvement."],
    success_signals: ["You began", "You learned where the real friction appears"],
  };
}

/** Offline equivalent of the `chat` action. */
export function localReply(journey = {}, text = "") {
  if (journey.phase === "complete") return "That sounds worth noticing. What you felt and what surprised you are part of the evidence too—you can carry that into the next attempt without needing to turn it into a perfect lesson.";
  const domain = getDomain(journey.domain || detectDomain(journey.problem), journey.problem);
  const rule = [...domain.faq, ...genericDomain().faq].find(([pattern]) => pattern.test(text));
  if (rule) return rule[1];
  const challenge = journey.challenge;
  return challenge
    ? `For “${challenge.title},” stay with the minimum-success version first. Tell me the exact step that feels unclear and I'll make only that step more concrete.`
    : "Tell me what part feels most uncertain or annoying. We can make that one part smaller before choosing a challenge.";
}
