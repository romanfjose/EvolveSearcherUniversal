import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ENGINES,
  discoverLanes,
  safeLaneDir,
  readLeadsWithDiagnostics,
  groupLeads,
  safeFile,
  listFiles,
  buildPrompt,
} from './data.mjs';

const UI = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(UI, 'data.mjs');
const DEFAULT_ROOT = path.resolve(UI, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.SEA_UI_PORT || 4489);

let cachedDataMod = null;
let cachedDataMtime = 0;
async function getDataModule() {
  const mtime = fs.statSync(DATA_PATH).mtimeMs;
  if (!cachedDataMod || mtime !== cachedDataMtime) {
    cachedDataMtime = mtime;
    cachedDataMod = await import(`${pathToFileURL(DATA_PATH).href}?v=${mtime}`);
  }
  return cachedDataMod;
}

const json = (res, data, code = 200) => {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

export function buildDashboardPayload(root = DEFAULT_ROOT) {
  const discovered = discoverLanes(root);
  const errors = [];
  const formatErrors = [];
  const allLeads = [];

  const lanes = discovered.map(lane => {
    const laneDir = path.join(root, lane.id);
    const engines = lane.engines.map(eng => {
      let leads = [];
      let engFormatErrors = [];
      try {
        const res = readLeadsWithDiagnostics(laneDir, eng, lane.id);
        leads = res.leads;
        engFormatErrors = res.formatErrors;
      } catch (e) {
        errors.push({ lane: lane.id, project: eng.id, error: e.message });
      }
      allLeads.push(...leads);
      formatErrors.push(...engFormatErrors);
      const activeCount = leads.filter(l => !l.rejected).length;
      const rejectedCount = leads.filter(l => l.rejected).length;
      return {
        ...eng,
        total: activeCount,
        rejectedTotal: rejectedCount,
        formatErrorCount: engFormatErrors.length,
      };
    });

    const activeTotal = engines.reduce((sum, e) => sum + e.total, 0);
    const rejectedTotal = engines.reduce((sum, e) => sum + e.rejectedTotal, 0);
    const formatErrorCount = engines.reduce((sum, e) => sum + e.formatErrorCount, 0);

    return {
      ...lane,
      engines,
      total: activeTotal,
      rejectedTotal,
      formatErrorCount,
    };
  });

  return {
    lanes,
    engines: ENGINES,
    groups: groupLeads(allLeads),
    formatErrors,
    errors,
  };
}

export function createDashboardServer(root = DEFAULT_ROOT, port = PORT) {
  const server = http.createServer(async (req, res) => {
    try {
      const activePort = server.address()?.port || port;
      const allowedHosts = [`${HOST}:${activePort}`, `localhost:${activePort}`, HOST, 'localhost'];
      if (req.headers.host && !allowedHosts.includes(req.headers.host)) {
        return json(res, { error: 'Invalid host' }, 403);
      }
      if (req.method !== 'GET') {
        return json(res, { error: 'Dashboard is strictly read-only (GET only)' }, 405);
      }

      const dataMod = await getDataModule();
      const url = new URL(req.url, `http://${HOST}:${activePort}`);
      if (url.pathname === '/api/dashboard') {
        const discovered = dataMod.discoverLanes(root);
        const errors = [];
        const formatErrors = [];
        const allLeads = [];
        const lanes = discovered.map(lane => {
          const laneDir = path.join(root, lane.id);
          const engines = lane.engines.map(eng => {
            let leads = [];
            let engFormatErrors = [];
            try {
              const r = dataMod.readLeadsWithDiagnostics(laneDir, eng, lane.id);
              leads = r.leads;
              engFormatErrors = r.formatErrors;
            } catch (e) {
              errors.push({ lane: lane.id, project: eng.id, error: e.message });
            }
            allLeads.push(...leads);
            formatErrors.push(...engFormatErrors);
            return {
              ...eng,
              total: leads.filter(l => !l.rejected).length,
              rejectedTotal: leads.filter(l => l.rejected).length,
              formatErrorCount: engFormatErrors.length,
            };
          });
          return {
            ...lane,
            engines,
            total: engines.reduce((s, e) => s + e.total, 0),
            rejectedTotal: engines.reduce((s, e) => s + e.rejectedTotal, 0),
            formatErrorCount: engines.reduce((s, e) => s + e.formatErrorCount, 0),
          };
        });
        return json(res, { lanes, engines: dataMod.ENGINES, groups: dataMod.groupLeads(allLeads), formatErrors, errors });
      }

      if (url.pathname.startsWith('/api/')) {
        const input = Object.fromEntries(url.searchParams);
        const laneDir = dataMod.safeLaneDir(root, input.lane);
        const project = dataMod.ENGINES.find(p => p.id === input.project);
        if (!project) throw new Error('Unknown engine architecture');

        if (url.pathname === '/api/file') {
          const filePath = dataMod.safeFile(laneDir, project, input.path);
          return json(res, { text: fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') });
        }
        if (url.pathname === '/api/files') {
          return json(res, { files: dataMod.listFiles(laneDir, project) });
        }
        if (url.pathname === '/api/prompt') {
          return json(res, { text: dataMod.buildPrompt(root, input.lane, project, Number(input.iterations)) });
        }
        if (url.pathname === '/api/neighbor-prompt') {
          const builders = {
            apply: dataMod.buildNeighborApplyPrompt,
            both: dataMod.buildNeighborOnePassPrompt,
          };
          const build = builders[input.phase] || dataMod.buildNeighborPrompt;
          return json(res, { text: build(root, input.lane, project) });
        }
        return json(res, { error: 'Route not found' }, 404);
      }

      const assets = {
        '/': ['index.html', 'text/html'],
        '/index.html': ['index.html', 'text/html'],
        '/app.js': ['app.js', 'text/javascript'],
        '/style.css': ['style.css', 'text/css'],
      };
      const asset = assets[url.pathname];
      if (!asset) return json(res, { error: 'Not found' }, 404);
      res.writeHead(200, {
        'content-type': asset[1] + '; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy':
          "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      res.end(fs.readFileSync(path.join(UI, asset[0])));
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createDashboardServer(DEFAULT_ROOT, PORT);
  server.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? `Dashboard already running? Open http://${HOST}:${PORT}/` : e);
    process.exitCode = 1;
  });
  server.listen(PORT, HOST, () => console.log(`Universal Read-Only Self-Evolve Dashboard: http://${HOST}:${PORT}/`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
