# CashoutRails

Canonical reference and live comparator for USD-to-ARS withdrawal routes, stablecoin off-ramps, and idle USD parking from Argentina.

---

## 1. Payoneer USD → ARS Corridor (Ranked by Net Payout)

| Rank | Route | Published Fee | FX Conversion Leg | Limits | Effective Haircut | Status / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Payoneer → Bitso (Order Book)** | `2.9%` deposit + `0.6%` ARS taker | USD → USDC (`2.9%`) → `1:1` USDT (free) → `usdt_ars` book (`0.6%` taker) | Min `$10` · `$1,000/day` · `$6,000/30d` | **`3.483%` stacked** (`2.9%` if in-app quote is inclusive) | **Top net ARS yield** whenever USDT trades at a premium to MEP (`> 1.036 × MEP`). |
| **2** | **Payoneer → Santander (USD Wire)** | `3.3%` (Payoneer AR table) | Direct USD credit or official/MEP leg depending on invoice structure | Bank / BCRA export rules apply | `3.3%` + bank receiving fees | Best when keeping formal banked USD directly. |
| **3** | **Payoneer → Prex** | `3.8%` | Converts directly at **Dólar MEP** | Per Prex / Payoneer tier | `3.8%` off MEP | Simple 1-click fallback, but loses to Bitso whenever USDT > MEP. |
| **4** | **Payoneer → Belo** | `4.0%` end-to-end | USD → USDC (`4.0%`) → in-app ARS conversion | Min `$5` · `$5,000/day` · `$20,000/mo` | `4.0%` + in-app ARS spread | Fast (~1 hr max credit), higher fixed fee than Bitso. |
| **5** | **Payoneer → AirTM** | `5.0%` | P2P / retail ask-bid spread (`~4.3%` internal spread observed) | Per tier | `5.0%+` | Avoid unless other rails are unavailable. |

### Bitso Break-Even Math (Stacked Fee Model: `2.9%` + `0.6%`)
For any gross withdrawal $U$ (in USD):
$$\text{Net USDT} = 0.971 \times U$$
$$\text{Net ARS (after 0.6\% taker)} = 0.971 \times 0.994 \times \text{VWAP}_{\text{bid}} \times U = 0.965174 \times \text{VWAP}_{\text{bid}} \times U$$

* **To beat raw MEP ($1.00 \times \text{MEP}_{\text{compra}}$):** Bitso `usdt_ars` bid must exceed **`1.0361 × MEP_compra`**.
* **To beat Prex (`3.8%` at MEP $\rightarrow 0.962 \times \text{MEP}_{\text{compra}}$):** Bitso `usdt_ars` bid only needs to exceed **`0.9967 × MEP_compra`** (which it almost always does since USDT tracks CCL/crypto).

### Primary Sources
* [Payoneer × Bitso Integration (2.9% all-in)](https://pages.payoneer.com/es/partner/bitso-integration/)
* [Payoneer Argentina Withdrawal Comparison Table](https://pages.payoneer.com/es/withdrawal-of-funds/)
* [Bitso Help: Cómo funciona Payoneer con Bitso](https://support.bitso.com/hc/es-ar/articles/17537563661460-C%C3%B3mo-funciona-Payoneer-con-Bitso)
* [Bitso Digital Dollars (1:1 USDC ↔ USDT)](https://support.bitso.com/hc/en-us/articles/4414977550996-How-do-Digital-dollars-work-on-Bitso)
* [Bitso ARS Market Fees (0.600% Taker)](https://bitso.com/ar/fees)
* [Belo Help: Retirar saldo de Payoneer (4%)](https://help.belo.app/es/articles/7545909-como-retirar-saldo-de-payoneer-con-belo)

---

## 2. Crypto & Stablecoin Venues (Argentina Off-Ramps & Parking)

### Local & Regional CeFi Notes
* **Fiwind / Lemon / Buenbit**: Best checked live via `node check-routes.mjs` before any swap. Note that cross-venue stablecoin arbitrage (e.g., AirTM → Fiwind `+0.23%` gross) is wiped out by withdrawal/ACH fees (`~1.5%`).
* **Kraken (`USDG`)**: Pays up to `2.25% APY` (free) / `4.50% APY` (Kraken+) on Paxos-issued `USDG` for Argentine accounts. However, Kraken has no direct `USDG/ARS` pair, and ARS bank withdrawals carry a `1.5%` fee ($10,000 ARS min). Use only for holding idle USD on-exchange, not rapid ARS round-trips.
  * Source: [Kraken Stablecoin Rewards](https://support.kraken.com/es/articles/stablecoin-rewards) | [Kraken Cash Withdrawal Fees](https://support.kraken.com/au/articles/360000423043-cash-withdrawal-options-fees-minimums-and-processing-times-)
* **Coinbase (`USDC`)**: Lists Argentina as eligible for USDC Rewards, but **blocks ARS buy/sell** for Argentine accounts as of Jan 2026 (crypto-only market). Requires an external on-chain hop to cash out into ARS.
  * Source: [Coinbase Crypto-Only Markets](https://help.coinbase.com/en-bm/coinbase/managing-my-account/other/crypto-only-markets)
* **Bitget (`Flexible Simple Earn`)**: Runs periodic high-APR stablecoin promos (`5.5%–6.5%` on USDT/USDC up to 300k), but rates drop to baseline (`~3.5%`) once promo windows close.

### Idle USD On-Chain Parking (Only Worthwhile at `$5,000+` Treasury)
At small balances (`<$500`), gas and bridge fees outweigh annual yield. Once treasury reserves scale:
1. **L2 Low-Gas Baseline — Aave v3 USDC on Base or Arbitrum**:
   * **Yield**: `~3.79%` base APY (`30d mean ~4.64%` with incentives), ~$20.7M+ TVL on Base, sub-cent gas fees, instant withdrawal.
   * **Pool**: [DefiLlama — Aave v3 USDC (Base)](https://defillama.com/yields/pool/7e0661bf-8cf3-45e6-9424-31916d4c7b84)
2. **Mainnet Large-Cap Baseline — Sky Savings (`sUSDS`, Ethereum)**:
   * **Yield**: `~3.80%` base APY (zero reward token dependency), ~$4.76B TVL. Use only when position size justifies Ethereum mainnet gas.
   * **Pool**: [DefiLlama — Sky sUSDS](https://defillama.com/yields/pool/d8c4eff5-c8a9-46fc-a888-057c4c668e72)

### USD Yield vs. ARS Plazo Fijo Breakeven ($f^*$)
A USD yield $r_{\text{USD}}$ beats an ARS `plazo fijo` / `T+0 FCI` rate $r_{\text{ARS}}$ over a 30-day window **only if** ARS depreciates by more than $f^*$:
$$f^* \approx \frac{1 + r_{\text{ARS}, 30\text{d}}}{1 + r_{\text{USD}, 30\text{d}}} - 1$$
At `21.99% TNA` (`~1.81% / 30d`) vs. `3.80% USD APY` (`~0.31% / 30d`), **$f^* \approx 1.50\%$ per 30 days**. USD stablecoin yields are **ARS-depreciation hedges**, not positive ARS spreads when the peso is flat.

---

## 3. Live Route Comparator CLI

Run the zero-dependency script during **BYMA market hours (Mon–Fri 11:00–17:00 ART)** to compare live net ARS payouts for any USD withdrawal amount (defaults to `$100` USD):

```powershell
node check-routes.mjs 500
```
