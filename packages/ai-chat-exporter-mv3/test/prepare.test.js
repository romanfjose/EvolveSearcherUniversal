/* Deduplication and PII/secret redaction — the step between harvest and
   any export builder (ChatReplayMd.prepare). */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness");

const { dedupe, createRedactor, prepare, buildMarkdown } = boot("").ChatReplayMd;
const T = (role, text) => ({ role, text, md: text });

describe("dedupe", () => {
  test("a turn read twice in a row is dropped", () => {
    const { turns, removed } = dedupe([T("user", "hi"), T("user", "hi "), T("assistant", "hello")]);
    assert.equal(turns.length, 2);
    assert.deepEqual(removed.map((r) => r.reason), ["repeat"]);
  });

  test("a streaming snapshot gives way to the finished turn", () => {
    const { turns, removed } = dedupe([T("user", "q"), T("assistant", "The answer is forty"), T("assistant", "The answer is forty-two, exactly.")]);
    assert.deepEqual(turns.map((t) => t.text), ["q", "The answer is forty-two, exactly."]);
    assert.equal(removed[0].index, 1);
    assert.equal(removed[0].reason, "partial");
  });

  test("a re-rendered exchange is dropped as a pair", () => {
    const x = [T("user", "a"), T("assistant", "b"), T("user", "c"), T("assistant", "d"), T("user", "a"), T("assistant", "b")];
    const { turns, removed } = dedupe(x);
    assert.equal(turns.length, 4);
    assert.deepEqual(removed.map((r) => [r.index, r.reason]), [[4, "exchange"], [5, "exchange"]]);
  });

  test("the same prompt with a different answer is kept", () => {
    const x = [T("user", "again?"), T("assistant", "one"), T("user", "again?"), T("assistant", "two")];
    assert.equal(dedupe(x).turns.length, 4);
  });

  test("short turns are never prefix-merged", () => {
    const x = [T("user", "q"), T("assistant", "Yes"), T("assistant", "Yes, and more")];
    assert.equal(dedupe(x).turns.length, 3);
  });

  test("deterministic: same input, same output", () => {
    const x = [T("user", "a"), T("user", "a"), T("assistant", "b"), T("user", "a"), T("assistant", "b")];
    assert.deepEqual(dedupe(x), dedupe(x.map((t) => ({ ...t }))));
  });
});

describe("redaction", () => {
  const r = () => createRedactor();

  for (const [kind, secret] of [
    ["EMAIL", "ana.perez+work@example.co.uk"],
    ["API_KEY", "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx-1234567890"],
    ["API_KEY", "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345"],
    ["API_KEY", "AKIAIOSFODNN7EXAMPLE"],
    ["API_KEY", "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"],
    ["TOKEN", "ghp_1234567890abcdefghijABCDEFGHIJ123456"],
    ["TOKEN", "xoxb-1234567890-abcdefghij"],
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
    ["CARD", "4111 1111 1111 1111"],
    ["IBAN", "DE89 3704 0044 0532 0130 00"],
    ["SSN", "123-45-6789"],
    ["PHONE", "+54 9 11 4567-8901"],
  ]) {
    test(`${kind}: ${secret.slice(0, 18)}…`, () => {
      const red = r();
      const out = red(`before ${secret} after`);
      assert.ok(!out.includes(secret), out);
      assert.match(out, new RegExp(`^before \\[${kind}_1\\] after$`));
    });
  }

  test("a private key block goes whole", () => {
    const out = r()("x\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----\ny");
    assert.equal(out, "x\n[PRIVATE_KEY_1]\ny");
  });

  test("key=value and Bearer keep the key name, lose the value", () => {
    const red = r();
    assert.equal(red('password = "hunter2hunter2"'), 'password = "[SECRET_1]"');
    assert.equal(red("Authorization: Bearer abcdefghijklmnop123456"), "Authorization: Bearer [TOKEN_1]");
  });

  test("the same value maps to the same placeholder across turns", () => {
    const red = r();
    assert.equal(red("mail a@b.io"), "mail [EMAIL_1]");
    assert.equal(red("cc c@d.io and a@b.io"), "cc [EMAIL_2] and [EMAIL_1]");
    assert.deepEqual(red.report(), { EMAIL: 2 });
  });

  test("look-alikes survive: prices, versions, a Luhn-invalid number, an ordinary IP", () => {
    const keep = "Pack $12.999,32 · v1.24.3 · order 4111 1111 1111 1112 · 192.168.0.1 · 2026-11-05";
    assert.equal(r()(keep), keep);
  });

  test("redacting inside a code fence leaves the fence intact", () => {
    const out = r()("```bash\nexport OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345\n```");
    assert.equal(out, "```bash\nexport OPENAI_API_KEY=[API_KEY_1]\n```");
  });
});

describe("prepare → export", () => {
  test("defaults: dedupe on, redaction off", () => {
    const { turns, report } = prepare([T("user", "me@x.io"), T("user", "me@x.io"), T("assistant", "ok")]);
    assert.equal(turns.length, 2);
    assert.equal(turns[0].text, "me@x.io");
    assert.equal(report.deduped, 1);
    assert.equal(report.redactedTotal, 0);
  });

  test("redaction covers both md and text, and the front matter says so", () => {
    const { turns, report } = prepare([T("user", "key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345"), T("assistant", "noted")], { redact: true, dedupe: false });
    assert.equal(turns[0].md, "key [API_KEY_1]");
    assert.equal(turns[0].text, "key [API_KEY_1]");
    const doc = buildMarkdown(turns, { site: "x", exportedAt: "2026-11-05T00:00:00Z", prep: report });
    assert.match(doc, /^redacted: 1$/m);
    assert.doesNotMatch(doc, /^deduplicated:/m);
  });
});
