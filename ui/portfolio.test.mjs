import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const portfolioHtmlPath = path.join(ROOT, 'docs/portfolio/index.html');
const verificationJsPath = path.join(ROOT, 'docs/portfolio/verification.js');

const html = fs.readFileSync(portfolioHtmlPath, 'utf8');

test('docs/portfolio/index.html is zero-dependency: no external scripts or stylesheets', () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=["']https?:/i);
});

test('hero action bar exists with prominent game launch and verified test receipts buttons', () => {
  assert.match(html, /class="hero-action-bar"/);
  assert.match(html, /🎮 LAUNCH LIVE AAA 3D GAME \(DON'T SINK, DON'T DIE\)/);
  assert.match(html, /id="hero-game-launch"/);
  assert.match(html, /href="\.\.\/\.\.\/packages\/dont-sink-dont-die-coop\/docs\/index\.html"/);
  assert.match(html, /id="hero-receipts"/);
  assert.match(html, /Inspect Verified Test Receipts/);
});

test('quick-filter tabs container exists and defines all required filters', () => {
  assert.match(html, /id="quick-tabs"/);
  assert.match(html, /"All Projects"/);
  assert.match(html, /"AI Systems & Eval"/);
  assert.match(html, /"FinTech & Quant"/);
  assert.match(html, /"Browser Automation"/);
  assert.match(html, /"3D WebGL Game"/);
});

test('all required project links, demo targets, and README entries remain intact', () => {
  const expectedProjects = [
    'EvolveSearcherUniversal',
    'multi-model-routing-bench',
    'webchat-batch-packer',
    'agent-orchestration-mcp-eval',
    'llm-app-hardening-kit',
    'form-schema-autofill-engine',
    'ai-chat-exporter-mv3',
    'latam-fx-offramp-router',
    'epistemic-experiment-coach',
    'ai-squad-group-chat',
    'dont-sink-dont-die-coop',
  ];

  for (const id of expectedProjects) {
    assert.ok(html.includes(`id: "${id}"`), `PROJECTS array must contain id "${id}"`);
  }

  // Ensure relative assets referenced in the script exist on disk
  const demoMatches = [...html.matchAll(/demo:\s*["']([^"']+)["']/g)].map(m => m[1]);
  for (const demo of demoMatches) {
    assert.ok(fs.existsSync(path.join(ROOT, demo)), `Demo path must exist: ${demo}`);
  }

  const readmeMatches = [...html.matchAll(/readme:\s*["']([^"']+)["']/g)].map(m => m[1]);
  for (const readme of readmeMatches) {
    assert.ok(fs.existsSync(path.join(ROOT, readme)), `Readme path must exist: ${readme}`);
  }
});

test('embedded script parses and executes correctly in a sandbox', () => {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(scriptMatch, 'Main inline script must be found in portfolio index.html');
  const code = scriptMatch[1];

  // Load verification.js data
  const verifCode = fs.readFileSync(verificationJsPath, 'utf8');

  // Set up mock DOM environment
  const mockElements = new Map();
  const getOrCreateMock = (sel) => {
    if (!mockElements.has(sel)) {
      mockElements.set(sel, {
        innerHTML: '',
        textContent: '',
        value: '',
        hidden: false,
        className: '',
        style: {},
        dataset: {},
        addEventListener: () => {},
        showModal: () => {},
        close: () => {},
        querySelector: (s) => getOrCreateMock(s),
        querySelectorAll: () => [],
      });
    }
    return mockElements.get(sel);
  };

  const sandbox = {
    window: {},
    document: {
      querySelector: (sel) => getOrCreateMock(sel),
      querySelectorAll: (sel) => {
        if (sel === '.card') {
          return [
            { dataset: { cats: 'apps', text: 'dont-sink-dont-die-coop game', id: 'dont-sink-dont-die-coop' }, hidden: false },
            { dataset: { cats: 'orch', text: 'evolvesearcheruniversal search', id: 'EvolveSearcherUniversal' }, hidden: false },
            { dataset: { cats: 'fin', text: 'latam-fx-offramp-router fx', id: 'latam-fx-offramp-router' }, hidden: false },
          ];
        }
        return [];
      },
    },
    location: { protocol: 'http:', pathname: '/docs/portfolio/', hash: '' },
    history: { replaceState: () => {} },
    console: console,
  };
  sandbox.window = sandbox;

  // Run verification.js then inline script in context
  const context = vm.createContext(sandbox);
  vm.runInContext(verifCode, context);
  assert.ok(sandbox.window.VERIFICATION, 'window.VERIFICATION must be defined');

  vm.runInContext(code, context);

  // Assert Quick Tabs rendered
  const quickTabsHtml = mockElements.get('#quick-tabs')?.innerHTML || '';
  assert.match(quickTabsHtml, /data-tab="all"/);
  assert.match(quickTabsHtml, /data-tab="ai-eval"/);
  assert.match(quickTabsHtml, /data-tab="fintech"/);
  assert.match(quickTabsHtml, /data-tab="browser-auto"/);
  assert.match(quickTabsHtml, /data-tab="game-3d"/);

  // Assert Grid rendered cards
  const gridHtml = mockElements.get('#grid')?.innerHTML || '';
  assert.match(gridHtml, /card-dont-sink-dont-die-coop/);
  assert.match(gridHtml, /card-EvolveSearcherUniversal/);
});
