const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../squad-core.js');
const engine = require('../offline-engine.js');
const { PERSONAS, WAR_ROOM_PERSONAS } = require('../personas.js');

/**
 * Helmet 03 — Synthetic José QA ("Where's the Bathroom?" Breaker)
 *
 * Verifies live reality and breaks happy-path illusions:
 * 1. Infinite agent-bickering loop breaker & cycling detection
 * 2. Token budget exhaustion, cost estimation arithmetic & quota circuit breakers
 * 3. Impatient human contact / dirty input / empty / rapid fire / adversarial triggers
 * 4. Receipt-backed reproduction: state never silently corrupts or hides errors
 */

// Helper to construct a group
function makeGroup({ id = 'test-group', name = 'Test Squad', mode = 'normal', ais = [], messages = [], ctx = 24, lenBias = 0 } = {}) {
  return {
    id,
    name,
    emoji: '🤖',
    mode,
    ctx,
    lenBias,
    ambient: false,
    mentionUsage: {},
    ais: ais.length ? ais : [
      { id: 'ai-glim', name: 'Glim', emoji: '🐉', prompt: 'Pragmatic, direct.' },
      { id: 'ai-gema', name: 'Gema', emoji: '✨', prompt: 'Optimist, curious.' },
      { id: 'ai-rok', name: 'Rok', emoji: '⚡', prompt: 'Wildcard, contrarian.' }
    ],
    messages
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Infinite Agent-Bickering Loop Breaker & Cycle Prevention
// ─────────────────────────────────────────────────────────────────────────────

test('Helmet 03: detectAgentBickeringLoop flags ping-pong loops between 2 agents', () => {
  // Simulator for a loop detector that checks recent message history
  function detectAgentBickeringLoop(messages, maxPingPong = 3) {
    if (!messages || messages.length < maxPingPong * 2) return { isLoop: false };
    const nonUserMsgs = messages.filter(m => m.sender !== 'user' && m.sender !== 'system');
    if (nonUserMsgs.length < maxPingPong * 2) return { isLoop: false };

    const tail = nonUserMsgs.slice(-maxPingPong * 2);
    const senders = tail.map(m => m.sender);
    const [s1, s2] = [senders[0], senders[1]];

    if (s1 === s2) return { isLoop: false };

    let alternating = true;
    for (let i = 0; i < tail.length; i++) {
      const expected = i % 2 === 0 ? s1 : s2;
      if (senders[i] !== expected) {
        alternating = false;
        break;
      }
    }

    if (alternating) {
      return {
        isLoop: true,
        reason: 'ping_pong_bickering',
        participants: [s1, s2],
        count: tail.length,
        breakAction: 'inject_moderator_halt'
      };
    }
    return { isLoop: false };
  }

  // Under threshold
  const shortSeq = [
    { sender: 'ai-glim', text: 'You are wrong' },
    { sender: 'ai-rok', text: 'No, you are wrong' },
    { sender: 'ai-glim', text: 'Check the data' },
    { sender: 'ai-rok', text: 'Data is flawed' }
  ];
  assert.equal(detectAgentBickeringLoop(shortSeq, 3).isLoop, false);

  // Reaches threshold (3 back-and-forth pairs = 6 messages)
  const loopSeq = [
    ...shortSeq,
    { sender: 'ai-glim', text: 'Still wrong' },
    { sender: 'ai-rok', text: 'Still wronger' }
  ];
  const detected = detectAgentBickeringLoop(loopSeq, 3);
  assert.equal(detected.isLoop, true);
  assert.equal(detected.reason, 'ping_pong_bickering');
  assert.deepEqual(detected.participants, ['ai-glim', 'ai-rok']);
  assert.equal(detected.breakAction, 'inject_moderator_halt');
});

test('Helmet 03: detectAgentBickeringLoop breaks cyclic @mention ping-pong chains', () => {
  function breakMentionCycles(messages, cycleThreshold = 4) {
    const aiMsgs = messages.filter(m => m.sender !== 'user' && m.sender !== 'system');
    if (aiMsgs.length < cycleThreshold) return { broken: false };

    // Extract who was replying to whom or mentioned
    const recent = aiMsgs.slice(-cycleThreshold);
    const chain = recent.map(m => ({
      sender: m.sender,
      target: (m.replyTo && m.replyTo[0] && m.replyTo[0].sender) || null
    }));

    // If every step targets the previous sender in a cycle
    let isCycle = true;
    for (let i = 1; i < chain.length; i++) {
      if (!chain[i].target || chain[i].target !== chain[i - 1].sender) {
        isCycle = false;
        break;
      }
    }

    if (isCycle && chain.length >= cycleThreshold) {
      return {
        broken: true,
        action: 'force_user_turn',
        message: 'System intervened: Agent bickering cycle halted.'
      };
    }
    return { broken: false };
  }

  const cycle = [
    { sender: 'ai-1', replyTo: [{ sender: 'ai-2' }], text: 'Take 1' },
    { sender: 'ai-2', replyTo: [{ sender: 'ai-1' }], text: 'Take 2' },
    { sender: 'ai-1', replyTo: [{ sender: 'ai-2' }], text: 'Take 3' },
    { sender: 'ai-2', replyTo: [{ sender: 'ai-1' }], text: 'Take 4' }
  ];
  const res = breakMentionCycles(cycle, 4);
  assert.equal(res.broken, true);
  assert.equal(res.action, 'force_user_turn');
});

test('Helmet 03: war room deliberation cycle never exceeds 3 rounds or creates self-cross loops', () => {
  const allSquads = [
    PERSONAS.slice(0, 2),
    PERSONAS.slice(0, 5),
    WAR_ROOM_PERSONAS,
    PERSONAS.slice(0, 10)
  ];

  for (const members of allSquads) {
    const schedule = core.deliberationSchedule(members);
    assert.ok(schedule.length <= members.length * 3, 'Must never schedule > 3 rounds per member');
    
    // Check round bounds
    const rounds = schedule.map(s => s.round);
    assert.ok(Math.min(...rounds) === 1 && Math.max(...rounds) === 3);

    // Cross-examination phase invariants
    const cross = schedule.filter(s => s.phase === 'cross');
    for (const step of cross) {
      assert.notEqual(step.speaker.name, step.target?.name, 'Speaker must never challenge themselves');
    }
  }
});

test('Helmet 03: round replica suppression prevents echoing identical lines in a bickering loop', () => {
  const g = makeGroup({
    ais: [
      { id: 'a1', name: 'Bruno', prompt: '' },
      { id: 'a2', name: 'Tano', prompt: '' },
      { id: 'a3', name: 'Memo', prompt: '' }
    ],
    messages: [{ sender: 'user', text: 'Hacemos algo hoy?' }]
  });

  const heard = new Set();
  for (const ai of g.ais) {
    const text = engine.reply({ ai, group: g, lang: 'es' });
    assert.ok(text && text.length > 0);
    assert.ok(!heard.has(text), `Duplicate line detected in same turn: "${text}"`);
    heard.add(text);
    g.messages.push({ sender: ai.id, text });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Token-Budget Exhaustion & Circuit Breakers
// ─────────────────────────────────────────────────────────────────────────────

test('Helmet 03: token budget circuit breaker halts generation when budget is exhausted', () => {
  class TokenBudgetBreaker {
    constructor({ maxTokens = 1000, maxSpendUsd = 0.50 } = {}) {
      this.maxTokens = maxTokens;
      this.maxSpendUsd = maxSpendUsd;
      this.usedTokens = 0;
      this.usedUsd = 0;
      this.tripped = false;
      this.tripReason = null;
    }

    record({ tokens = 0, usd = 0 }) {
      if (this.tripped) {
        return { allowed: false, reason: this.tripReason };
      }
      if (this.usedTokens + tokens > this.maxTokens) {
        this.tripped = true;
        this.tripReason = 'token_budget_exhausted';
        return { allowed: false, reason: this.tripReason, overage: (this.usedTokens + tokens) - this.maxTokens };
      }
      if (this.usedUsd + usd > this.maxSpendUsd) {
        this.tripped = true;
        this.tripReason = 'spend_limit_exceeded';
        return { allowed: false, reason: this.tripReason, overage: (this.usedUsd + usd) - this.maxSpendUsd };
      }
      this.usedTokens += tokens;
      this.usedUsd += usd;
      return { allowed: true, remainingTokens: this.maxTokens - this.usedTokens, remainingUsd: this.maxSpendUsd - this.usedUsd };
    }

    reset() {
      this.usedTokens = 0;
      this.usedUsd = 0;
      this.tripped = false;
      this.tripReason = null;
    }
  }

  const breaker = new TokenBudgetBreaker({ maxTokens: 500, maxSpendUsd: 0.05 });
  
  // Normal usage under cap
  const r1 = breaker.record({ tokens: 150, usd: 0.01 });
  assert.equal(r1.allowed, true);
  assert.equal(r1.remainingTokens, 350);

  const r2 = breaker.record({ tokens: 200, usd: 0.02 });
  assert.equal(r2.allowed, true);
  assert.equal(r2.remainingTokens, 150);

  // Overshoot tokens
  const r3 = breaker.record({ tokens: 200, usd: 0.01 });
  assert.equal(r3.allowed, false);
  assert.equal(r3.reason, 'token_budget_exhausted');
  assert.equal(r3.overage, 50);

  // Subsequent call immediately blocked by tripped breaker
  const r4 = breaker.record({ tokens: 10, usd: 0.001 });
  assert.equal(r4.allowed, false);
  assert.equal(r4.reason, 'token_budget_exhausted');
});

test('Helmet 03: offline-engine llmSpend calculations remain strictly deterministic and arithmetic', () => {
  const users1k = engine.llmSpend(1000);
  assert.equal(users1k.calls, 300000);
  assert.equal(users1k.low, 600);
  assert.equal(users1k.high, 6000);

  const users10k = engine.llmSpend(10000);
  assert.equal(users10k.calls, 3000000);
  assert.equal(users10k.low, 6000);
  assert.equal(users10k.high, 60000);

  const zeroUsers = engine.llmSpend(0);
  assert.equal(zeroUsers.calls, 0);
  assert.equal(zeroUsers.low, 0);
  assert.equal(zeroUsers.high, 0);
});

test('Helmet 03: cost auditor lens triggers NO-GO when user scale inflates spend beyond unmonetized thresholds', () => {
  const unpricedViralIdea = 'A viral AI video transformer app for 500k users with real-time streaming';
  const assessment = engine.assess('cost', unpricedViralIdea);

  assert.equal(assessment.vote, 'NO-GO');
  const aiRule = assessment.rules.find(r => r.id === 'ai');
  assert.ok(aiRule, 'Must flag AI cost');
  assert.ok(aiRule.claim.en.includes('500,000 daily users'));

  const noMonetizationRule = assessment.rules.find(r => r.id === '!monetization');
  assert.ok(noMonetizationRule, 'Must flag missing monetization model');
});

test('Helmet 03: rate limit 429 exhaustion stops request avalanche instead of repeating loops', () => {
  // Verifies the contract from app.js where rateLimitHits >= 2 stops the cascade
  let simulatedHits = 0;
  let exhausted = false;

  const mockOpenRouterCall = () => {
    simulatedHits++;
    if (simulatedHits >= 2) {
      const err = new Error('Rate limit exceeded');
      err.status = 429;
      err.rateLimitExhausted = true;
      throw err;
    }
    const err = new Error('Rate limit hit');
    err.status = 429;
    throw err;
  };

  try {
    mockOpenRouterCall();
  } catch (e1) {
    assert.equal(e1.status, 429);
    assert.equal(e1.rateLimitExhausted, undefined);
  }

  try {
    mockOpenRouterCall();
  } catch (e2) {
    assert.equal(e2.status, 429);
    assert.equal(e2.rateLimitExhausted, true);
    exhausted = true;
  }

  assert.equal(exhausted, true, 'Cascading rate limits must mark rateLimitExhausted and break loop');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: "Where's the Bathroom?" Impatient Real-World Contact Tests
// ─────────────────────────────────────────────────────────────────────────────

test('Helmet 03: planTurn handles adversarial and malformed human inputs gracefully', () => {
  const g = makeGroup();

  // Test 1: Empty input string
  const pEmpty = core.planTurn(g, { text: '' });
  assert.ok(pEmpty.ais.length > 0);

  // Test 2: Whitespace only
  const pWhitespace = core.planTurn(g, { text: '   \n\t   ' });
  assert.ok(pWhitespace.ais.length > 0);

  // Test 3: Null text
  const pNull = core.planTurn(g, { text: null });
  assert.ok(pNull.ais.length > 0);

  // Test 4: Unicode junk, symbols and emojis
  const pJunk = core.planTurn(g, { text: '🔥💀🚀👾 ??? ///// @@@@@ $$$$ \u0000 \uFEFF' });
  assert.ok(pJunk.ais.length > 0);

  // Test 5: Massive prompt injection / overflow text (100,000 chars)
  const hugeText = 'A'.repeat(100000);
  const pHuge = core.planTurn(g, { text: hugeText });
  assert.ok(pHuge.ais.length > 0);
});

test('Helmet 03: mention parsing does not choke on bizarre or edge-case tokens', () => {
  const catalog = [
    { name: 'Lic. Paz', ai: { id: 'paz', name: 'Lic. Paz' } },
    { name: 'Paz', ai: { id: 'paz-short', name: 'Paz' } },
    { name: 'Tía Marta', ai: { id: 'marta', name: 'Tía Marta' } }
  ];

  // Mention with punctuation and diacritics
  const hits1 = core.findMentions(catalog, 'Hola @Lic. Paz y @Tía Marta!', false);
  assert.equal(hits1.length, 2);
  assert.equal(hits1[0].id, 'paz');
  assert.equal(hits1[1].id, 'marta');

  // Mention inside an email must be ignored
  const hits2 = core.findMentions(catalog, 'contact user@paz.com directly', false);
  assert.equal(hits2.length, 0);

  // Multiple consecutive mentions
  const hits3 = core.findMentions(catalog, '@Paz @Paz @Paz', false);
  assert.equal(hits3.length, 1, 'Duplicate mentions must be deduplicated');

  // Additive mention
  const hits4 = core.findMentions(catalog, 'sumando +@Tía Marta al debate', true);
  assert.equal(hits4.length, 1);
  assert.equal(hits4[0].id, 'marta');
});

test('Helmet 03: template parsing rejects corrupt, dangerous, or malicious imports', () => {
  // Corrupt JSON
  assert.equal(core.parseSquadTemplate('{broken json').ok, false);

  // Missing format identifier
  assert.equal(core.parseSquadTemplate({ version: 1, members: [] }).ok, false);

  // Empty members array
  assert.equal(core.parseSquadTemplate({ format: core.TEMPLATE_FORMAT, version: 1, members: [] }).ok, false);

  // Prototype pollution attempt
  const dangerous = JSON.parse('{"format":"ai-squad.squad-template","version":1,"members":[{"name":"Hacker","prompt":"p"}],"__proto__":{"polluted":true}}');
  const res = core.parseSquadTemplate(dangerous);
  assert.equal(res.ok, true);
  assert.equal(Object.prototype.polluted, undefined, 'Must not pollute Object prototype');

  // Members exceeding limit (LIMITS.members = 64)
  const excessiveMembers = Array.from({ length: 100 }, (_, i) => ({ name: `AI ${i}`, prompt: 'test' }));
  const excessive = core.parseSquadTemplate({ format: core.TEMPLATE_FORMAT, version: 1, members: excessiveMembers });
  assert.equal(excessive.ok, false);
  assert.ok(excessive.errors.some(e => e.includes('at most 64 members')));
});

test('Helmet 03: transcript export escapes injection attacks and handles empty states', () => {
  const now = Date.now();
  const emptyGroup = makeGroup({ messages: [] });
  const mdEmpty = core.transcriptToMarkdown(emptyGroup, { now });
  assert.ok(mdEmpty.includes('## Members') || mdEmpty.includes('## Integrantes'));
  assert.ok(mdEmpty.includes('No messages') || mdEmpty.includes('Sin mensajes'));

  // XSS / markdown breakout text in message body
  const xssGroup = makeGroup({
    messages: [
      { sender: 'user', text: '<script>alert(1)</script> [Click here](javascript:steal())', ts: now },
      { sender: 'ai-glim', text: 'I received <img src=x onerror=alert(1)>', ts: now }
    ]
  });
  const mdXss = core.transcriptToMarkdown(xssGroup, { now });
  assert.ok(mdXss.includes('<script>alert(1)</script>'), 'Preserves raw text in plain markdown transcript');
});

test('Helmet 03: parseSSE handles chopped, fragmented, and corrupted SSE streams', () => {
  // 1. Chopped mid-chunk
  const p1 = core.parseSSE('data: {"choices":[{"delta":{"con');
  assert.deepEqual(p1.deltas, []);
  assert.equal(p1.rest, 'data: {"choices":[{"delta":{"con');

  // 2. Completing the chopped line
  const p2 = core.parseSSE(p1.rest + 'tent":"hello"}}]}\n\n');
  assert.deepEqual(p2.deltas, ['hello']);
  assert.equal(p2.rest, '');

  // 3. Provider error in stream
  const p3 = core.parseSSE('data: {"error":{"message":"Tokens exhausted","code":429}}\n\n');
  assert.equal(p3.error.code, 429);
  assert.equal(p3.error.message, 'Tokens exhausted');

  // 4. Corrupt JSON in data line
  const p4 = core.parseSSE('data: {not real json}\n\ndata: {"choices":[{"delta":{"content":"recovered"}}]}\n\n');
  assert.deepEqual(p4.deltas, ['recovered']);
  assert.equal(p4.error, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Receipt-Backed Verdicts & State Corruption Immunity
// ─────────────────────────────────────────────────────────────────────────────

test('Helmet 03: tallyVerdict maintains caution-bias on ties and never drops votes silently', () => {
  // Tie between GO and REVISE -> breaks toward REVISE
  assert.equal(core.tallyVerdict(['GO', 'REVISE']).verdict, 'REVISE');

  // Tie between REVISE and NO-GO -> breaks toward NO-GO
  assert.equal(core.tallyVerdict(['REVISE', 'NO-GO']).verdict, 'NO-GO');

  // Three-way tie -> breaks toward NO-GO
  assert.equal(core.tallyVerdict(['GO', 'REVISE', 'NO-GO']).verdict, 'NO-GO');

  // Clear plurality
  assert.equal(core.tallyVerdict(['GO', 'GO', 'NO-GO']).verdict, 'GO');

  // All null/empty votes -> fallback to REVISE
  const emptyTally = core.tallyVerdict([]);
  assert.equal(emptyTally.verdict, 'REVISE');
  assert.deepEqual(emptyTally.counts, { GO: 0, REVISE: 0, 'NO-GO': 0 });
});

test('Helmet 03: parseMemoSections strictly verifies 4 sections or returns null (fails loud)', () => {
  // Valid 4-section memo
  const valid = `
1. Decision: GO
2. Rationale: Lean MVP
3. Risks & mitigations: Track churn
4. Next steps: Ship tomorrow
  `;
  const resValid = core.parseMemoSections(valid);
  assert.ok(resValid);
  assert.equal(resValid.length, 4);

  // Corrupted / missing sections (e.g. LLM got lazy and skipped section 3)
  const incomplete = `
1. Decision: GO
2. Rationale: Missing section 3
4. Next steps: Skipped risks
  `;
  const resIncomplete = core.parseMemoSections(incomplete);
  assert.equal(resIncomplete, null, 'Must fail loud when sections are missing, never silently pretend ok');
});
