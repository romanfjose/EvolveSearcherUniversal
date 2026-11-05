#!/usr/bin/env node
/**
 * CashoutRails — Live USD -> ARS Route, Order-Book & Contractor Corridor Comparator
 * Usage: node check-routes.mjs [usd_amount] [--json]
 * Default amount: 1000 USD
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(HERE, 'latest-routes.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CashoutRails/2.0',
  'Accept': 'application/json',
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

export function walkOrderBook(bids, targetQty) {
  let remaining = targetQty;
  let proceedsArs = 0;
  for (const b of bids) {
    const price = parseFloat(b.price);
    const amount = parseFloat(b.amount);
    const take = Math.min(remaining, amount);
    proceedsArs += take * price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }
  const filled = targetQty - remaining;
  return {
    filled,
    unfilled: remaining,
    vwap: filled > 0 ? proceedsArs / filled : 0,
    grossArs: proceedsArs,
  };
}

function fmtArs(n) {
  return 'ARS ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function computeCashoutRoutes(usdAmount = 1000) {
  const stamp = new Date().toISOString();
  const [bitsoBook, dolarApi, cyUsdt, cyUsdc] = await Promise.all([
    fetchJson('https://api.bitso.com/v3/order_book/?book=usdt_ars&aggregate=false'),
    fetchJson('https://dolarapi.com/v1/dolares'),
    fetchJson(`https://criptoya.com/api/usdt/ars/${Math.round(usdAmount)}`),
    fetchJson(`https://criptoya.com/api/usdc/ars/${Math.round(usdAmount)}`),
  ]);

  const mep = dolarApi.find((d) => d.casa === 'bolsa');
  const ccl = dolarApi.find((d) => d.casa === 'contadoconliqui');
  const mepBid = mep ? parseFloat(mep.compra) : 0;
  const cclBid = ccl ? parseFloat(ccl.compra) : 0;
  const rawMepArs = usdAmount * mepBid;

  const bids = bitsoBook?.payload?.bids || [];
  const usdtAfterPayoneer = usdAmount * (1 - 0.029); // 2.9% Payoneer -> Bitso fee
  const walk = walkOrderBook(bids, usdtAfterPayoneer);
  const bitsoNetStacked = walk.grossArs * (1 - 0.006); // 0.6% Bitso ARS taker fee
  const bitsoNetNoStack = walk.grossArs; // if 2.9% covers conversion

  const beloBid = cyUsdc?.belo?.totalBid || 0;
  const beloNetArs = usdAmount * (1 - 0.04) * beloBid; // 4.0% Payoneer -> Belo fee
  const prexNetArs = usdAmount * (1 - 0.038) * mepBid; // 3.8% Payoneer -> Prex at MEP

  const payoneerRoutes = [
    {
      id: 'payo_bitso_inclusive',
      corridor: 'payoneer',
      name: '1. Payoneer -> Bitso (2.9% only, if inclusive)',
      netArs: Number(bitsoNetNoStack.toFixed(2)),
      effRate: Number((bitsoNetNoStack / usdAmount).toFixed(2)),
      vsMepPct: Number(((bitsoNetNoStack / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 2.9,
      note: `VWAP ${walk.vwap.toFixed(2)} on ${usdtAfterPayoneer.toFixed(2)} USDT`,
    },
    {
      id: 'payo_bitso_stacked',
      corridor: 'payoneer',
      name: '2. Payoneer -> Bitso (2.9% + 0.6% book taker)',
      netArs: Number(bitsoNetStacked.toFixed(2)),
      effRate: Number((bitsoNetStacked / usdAmount).toFixed(2)),
      vsMepPct: Number(((bitsoNetStacked / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 3.483,
      note: `Conservative stacked model (unfilled: ${walk.unfilled.toFixed(2)} USDT)`,
    },
    {
      id: 'payo_belo_usdc',
      corridor: 'payoneer',
      name: '3. Payoneer -> Belo (4.0% + CriptoYa totalBid)',
      netArs: Number(beloNetArs.toFixed(2)),
      effRate: Number((beloNetArs / usdAmount).toFixed(2)),
      vsMepPct: Number(((beloNetArs / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 4.0,
      note: `Belo USDC totalBid: ${beloBid.toFixed(2)}`,
    },
    {
      id: 'payo_prex_mep',
      corridor: 'payoneer',
      name: '4. Payoneer -> Prex (3.8% @ MEP Compra)',
      netArs: Number(prexNetArs.toFixed(2)),
      effRate: Number((prexNetArs / usdAmount).toFixed(2)),
      vsMepPct: Number(((prexNetArs / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 3.8,
      note: `MEP Compra: ${mepBid.toFixed(2)}`,
    },
  ].sort((a, b) => b.netArs - a.netArs);

  const venueIds = ['bitsoalpha', 'fiwind', 'belo', 'lemoncash', 'buenbit', 'wallbit', 'ripio'];
  const venueQuotes = [];
  for (const v of venueIds) {
    const usdtBid = cyUsdt?.[v]?.totalBid || null;
    const usdcBid = cyUsdc?.[v]?.totalBid || null;
    if (usdtBid || usdcBid) {
      venueQuotes.push({
        venue: v,
        usdtBid: usdtBid ? Number(usdtBid.toFixed(2)) : null,
        usdcBid: usdcBid ? Number(usdcBid.toFixed(2)) : null,
        bestBid: Number(Math.max(usdtBid || 0, usdcBid || 0).toFixed(2)),
        bestAsset: (usdtBid || 0) >= (usdcBid || 0) ? 'USDT' : 'USDC'
      });
    }
  }
  venueQuotes.sort((a, b) => b.bestBid - a.bestBid);

  // Contractor Direct ACH / Deel / Direct USDC Corridors (bypassing Payoneer's 2.9%-4% rail tax)
  const topVenue = venueQuotes[0] || { venue: 'fiwind', bestBid: walk.vwap, bestAsset: 'USDT' };
  const directWalk = walkOrderBook(bids, usdAmount);
  const directBitsoNet = directWalk.grossArs * (1 - 0.005); // ~0.5% maker/taker on direct USDC/USDT deposit
  const directTopVenueNet = usdAmount * topVenue.bestBid; // 0% entry when paid in USDC/USDT or free USD ACH -> USDC
  const deelToAchFeePct = 0.005; // 0.5% typical virtual US ACH -> USDC bridge (Wallbit / Fiwind / Belo ACH)
  const achBridgeNetArs = usdAmount * (1 - deelToAchFeePct) * topVenue.bestBid;

  const contractorCorridors = [
    {
      id: 'direct_crypto_top_venue',
      corridor: 'direct_crypto',
      name: `A. Direct ${topVenue.bestAsset} Payout -> ${topVenue.venue} (0% rail fee)`,
      netArs: Number(directTopVenueNet.toFixed(2)),
      effRate: Number((directTopVenueNet / usdAmount).toFixed(2)),
      vsMepPct: Number(((directTopVenueNet / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 0,
      note: `For Algora/Devpost/Deel/Mercor crypto payout @ ${topVenue.bestBid.toFixed(2)} ARS/${topVenue.bestAsset}`
    },
    {
      id: 'us_ach_virtual_bridge',
      corridor: 'direct_ach',
      name: `B. US ACH (Deel/G2i/Stripe/Ashby) -> Virtual USD ACH -> ${topVenue.venue} (~0.5% fee)`,
      netArs: Number(achBridgeNetArs.toFixed(2)),
      effRate: Number((achBridgeNetArs / usdAmount).toFixed(2)),
      vsMepPct: Number(((achBridgeNetArs / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 0.5,
      note: `Bypasses Payoneer 3.48% tax via direct US routing number`
    },
    {
      id: 'direct_bitso_book',
      corridor: 'direct_ach',
      name: `C. Direct USD/USDT -> Bitso Order Book (0.5% book fee, no Payoneer)`,
      netArs: Number(directBitsoNet.toFixed(2)),
      effRate: Number((directBitsoNet / usdAmount).toFixed(2)),
      vsMepPct: Number(((directBitsoNet / rawMepArs - 1) * 100).toFixed(2)),
      haircutPct: 0.5,
      note: `Bitso live book VWAP ${directWalk.vwap.toFixed(2)} on ${usdAmount.toFixed(0)} USDT`
    }
  ].sort((a, b) => b.netArs - a.netArs);

  const bestPayoneer = payoneerRoutes[0];
  const conservativePayoneer = payoneerRoutes.find(r => r.id === 'payo_bitso_stacked') || payoneerRoutes[0];
  const bestDirect = contractorCorridors[0];
  const safeMep = mepBid > 0 ? mepBid : (bestPayoneer.effRate || 1);

  const deltaArsVsBestPayo = Number((bestDirect.netArs - bestPayoneer.netArs).toFixed(2));
  const deltaUsdVsBestPayo = Number((deltaArsVsBestPayo / safeMep).toFixed(2));
  const annualSavingsVsBestPayoAt5kMoUsd = Number(((deltaUsdVsBestPayo / (usdAmount / 1000)) * 5 * 12).toFixed(0));

  const deltaArsPerTicket = Number((bestDirect.netArs - conservativePayoneer.netArs).toFixed(2));
  const deltaUsdEquivalentPerTicket = Number((deltaArsPerTicket / safeMep).toFixed(2));
  const annualSavingsAt5kMoUsd = Number(((deltaUsdEquivalentPerTicket / (usdAmount / 1000)) * 5 * 12).toFixed(0));

  const payload = {
    generatedAt: stamp,
    ticketUsd: usdAmount,
    benchmarks: {
      mepCompra: mepBid,
      cclCompra: cclBid,
      mepUpdatedAt: mep?.fechaActualizacion || null,
      rawMepArs: Number(rawMepArs.toFixed(2))
    },
    payoneerRoutes,
    contractorCorridors,
    venueQuotes,
    arbitrageSummary: {
      bestPayoneerRoute: bestPayoneer.name,
      bestPayoneerEffRate: bestPayoneer.effRate,
      conservativePayoneerEffRate: conservativePayoneer.effRate,
      bestDirectRoute: bestDirect.name,
      bestDirectEffRate: bestDirect.effRate,
      extraArsVsBestPayoneerPerTicket: deltaArsVsBestPayo,
      extraUsdVsBestPayoneerPerTicket: deltaUsdVsBestPayo,
      annualUsdSavedVsBestPayoneerAt5kMo: annualSavingsVsBestPayoAt5kMoUsd,
      extraArsPerTicketByBypassingPayoneer: deltaArsPerTicket,
      extraUsdPerTicketByBypassingPayoneer: deltaUsdEquivalentPerTicket,
      annualUsdSavedAt5kMonthlyIncome: annualSavingsAt5kMoUsd
    }
  };

  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch {}

  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const numArg = args.find(a => !a.startsWith('-'));
  const usdAmount = parseFloat(numArg || '1000');
  if (isNaN(usdAmount) || usdAmount <= 0) {
    console.error('Usage: node check-routes.mjs [usd_amount] [--json]');
    process.exit(1);
  }

  const data = await computeCashoutRoutes(usdAmount);
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`\n=== CashoutRails Live Comparator | Ticket: USD ${usdAmount.toFixed(2)} | ${data.generatedAt} ===\n`);
  console.log(`Benchmarks (DolarAPI):`);
  console.log(`  MEP Compra : ${fmtArs(data.benchmarks.mepCompra)} (100% Baseline = ${fmtArs(data.benchmarks.rawMepArs)}) [updated: ${data.benchmarks.mepUpdatedAt}]`);
  console.log(`  CCL Compra : ${fmtArs(data.benchmarks.cclCompra)} (100% Baseline = ${fmtArs(usdAmount * data.benchmarks.cclCompra)})\n`);

  console.log(`Payoneer Corridor Comparison (for USD ${usdAmount.toFixed(2)}):`);
  for (const r of data.payoneerRoutes) {
    const sign = r.vsMepPct >= 0 ? '+' : '';
    console.log(`  ${r.name.padEnd(47)} | ${fmtArs(r.netArs).padStart(14)} | Eff: ${r.effRate.toFixed(2)} | vs MEP: ${sign}${r.vsMepPct.toFixed(2)}% | ${r.note}`);
  }

  console.log(`\nDirect Contractor ACH / Crypto Corridors (Bypassing Payoneer 2.9%-4.0% Tax):`);
  for (const r of data.contractorCorridors) {
    const sign = r.vsMepPct >= 0 ? '+' : '';
    console.log(`  ${r.name.padEnd(74)} | ${fmtArs(r.netArs).padStart(14)} | Eff: ${r.effRate.toFixed(2)} | vs MEP: ${sign}${r.vsMepPct.toFixed(2)}%`);
  }
  console.log(`  -> Arbitrage Edge vs Payoneer Stacked: +${fmtArs(data.arbitrageSummary.extraArsPerTicketByBypassingPayoneer)} (+USD ${data.arbitrageSummary.extraUsdPerTicketByBypassingPayoneer} per $${usdAmount} ticket | ~USD ${data.arbitrageSummary.annualUsdSavedAt5kMonthlyIncome}/yr on $5k/mo contract)\n`);

  console.log(`Top Local Venues — Direct 1 USDT / 1 USDC Sale (CriptoYa totalBid):`);
  for (const v of data.venueQuotes) {
    console.log(
      `  ${v.venue.padEnd(14)} | USDT totalBid: ${v.usdtBid ? v.usdtBid.toFixed(2).padStart(8) : '     N/A'} | USDC totalBid: ${v.usdcBid ? v.usdcBid.toFixed(2).padStart(8) : '     N/A'}`
    );
  }
  console.log('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
