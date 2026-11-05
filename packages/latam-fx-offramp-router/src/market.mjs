/**
 * Market adapter: raw API payloads (live or bundled snapshot) → one normalized market object.
 * The only module that touches the network.
 */

import { normalizeBook } from './orderbook.mjs';

export const VENUE_IDS = Object.freeze(['bitsoalpha', 'fiwind', 'belo', 'lemoncash', 'buenbit', 'wallbit', 'ripio']);

const HEADERS = { 'User-Agent': 'CashoutRails/3.0', Accept: 'application/json' };

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

export async function fetchLiveRaw(usdAmount) {
  const q = Math.max(1, Math.round(usdAmount));
  const [bitsoBook, dolares, criptoyaUsdt, criptoyaUsdc] = await Promise.all([
    fetchJson('https://api.bitso.com/v3/order_book/?book=usdt_ars&aggregate=true'),
    fetchJson('https://dolarapi.com/v1/dolares'),
    fetchJson(`https://criptoya.com/api/usdt/ars/${q}`),
    fetchJson(`https://criptoya.com/api/usdc/ars/${q}`),
  ]);
  return { meta: { stamp: new Date().toISOString(), source: 'live' }, bitsoBook, dolares, criptoyaUsdt, criptoyaUsdc };
}

export function marketFromRaw(raw) {
  const find = (casa) => (raw.dolares || []).find((d) => d.casa === casa);
  const mep = find('bolsa');
  const ccl = find('contadoconliqui');
  const venues = {};
  for (const id of VENUE_IDS) {
    const usdtBid = Number(raw.criptoyaUsdt?.[id]?.totalBid) || null;
    const usdcBid = Number(raw.criptoyaUsdc?.[id]?.totalBid) || null;
    if (usdtBid || usdcBid) {
      venues[id] = { usdtBid, usdcBid, bestBid: Math.max(usdtBid || 0, usdcBid || 0),
        bestAsset: (usdtBid || 0) >= (usdcBid || 0) ? 'USDT' : 'USDC' };
    }
  }
  const ranked = Object.entries(venues).map(([venue, v]) => ({ venue, ...v })).sort((a, b) => b.bestBid - a.bestBid);
  const bids = normalizeBook(raw.bitsoBook?.payload?.bids, 'bids');
  return {
    stamp: raw.meta?.stamp ?? null,
    source: raw.meta?.source ?? 'unknown',
    mepBid: Number(mep?.compra) || 0,
    mepAsk: Number(mep?.venta) || 0,
    cclBid: Number(ccl?.compra) || 0,
    cclAsk: Number(ccl?.venta) || 0,
    mepUpdatedAt: mep?.fechaActualizacion ?? null,
    bids,
    asks: normalizeBook(raw.bitsoBook?.payload?.asks, 'asks'),
    venues,
    venueRanking: ranked,
    topVenue: ranked[0] || (bids.length ? { venue: 'bitso', bestBid: bids[0].price, bestAsset: 'USDT' } : null),
  };
}
