/**
 * Bundled offline market snapshot, in the exact response shapes of the live APIs
 * (Bitso /v3/order_book usdt_ars, DolarAPI /v1/dolares, CriptoYa /api/{coin}/ars/{qty}).
 *
 * ILLUSTRATIVE, NOT LIVE: levels are calibrated to a typical BYMA-hours usdt_ars book
 * (≈0.3% top spread, ≈264k USDT resting bid depth, 5% deep tail) so offline runs, tests
 * and the visualizer are deterministic. Never trade on it — run without --offline.
 */

const STAMP = "2026-11-05T15:00:00.000Z";
const lv = (rows) => rows.map(([price, amount]) => ({ book: "usdt_ars", price: price.toFixed(2), amount: amount.toFixed(2) }));

export const SNAPSHOT = Object.freeze({
  meta: { stamp: STAMP, source: "bundled-illustrative", note: "Deterministic offline fixture; not a live quote." },
  bitsoBook: {
    success: true,
    payload: {
      updated_at: STAMP,
      sequence: "0",
      bids: lv([
    [1514.80, 273.10], [1514.01, 666.08], [1513.72, 362.18], [1512.84, 158.65],
    [1512.56, 758.14], [1511.59, 442.17], [1510.84, 3026.56], [1509.80, 2020.14],
    [1509.31, 6192.00], [1508.74, 1535.46], [1508.50, 1990.54], [1505.70, 755.86],
    [1503.81, 1712.88], [1501.72, 4017.44], [1499.97, 2045.42], [1497.71, 1412.13],
    [1496.63, 2235.44], [1494.31, 7841.97], [1493.03, 639.33], [1491.64, 3225.17],
    [1489.70, 8614.06], [1486.74, 7305.98], [1485.65, 3085.84], [1484.69, 8747.83],
    [1482.23, 4373.31], [1481.28, 2954.23], [1478.88, 24129.90], [1476.35, 5873.86],
    [1475.71, 4357.15], [1474.89, 7782.78], [1473.92, 6451.53], [1471.82, 6242.00],
    [1469.61, 3394.35], [1468.58, 9376.30], [1467.70, 10020.47], [1466.16, 19967.89],
    [1463.81, 4325.84], [1462.93, 4020.84], [1459.95, 3698.88], [1457.64, 6781.54],
    [1454.78, 5775.36], [1452.06, 8144.46], [1450.69, 6745.53], [1449.85, 8655.95],
    [1448.74, 17998.04], [1446.02, 7438.07], [1444.14, 9160.60], [1441.42, 7539.59],
      ]),
      asks: lv([
    [1519.90, 1162.65], [1520.29, 4149.79], [1521.43, 2666.75], [1523.14, 4189.12],
    [1523.57, 1928.53], [1524.64, 803.32], [1525.46, 2980.86], [1527.09, 1798.19],
    [1528.16, 1012.31], [1529.55, 469.85], [1530.60, 3257.41], [1531.01, 2090.44],
    [1532.33, 2983.66], [1533.44, 234.86], [1534.88, 3589.69], [1535.89, 1475.38],
      ]),
    },
  },
  dolares: [
    { moneda: "USD", casa: "oficial", nombre: "Oficial", compra: 1425, venta: 1475, fechaActualizacion: STAMP },
    { moneda: "USD", casa: "blue", nombre: "Blue", compra: 1465, venta: 1485, fechaActualizacion: STAMP },
    { moneda: "USD", casa: "bolsa", nombre: "Bolsa", compra: 1478.4, venta: 1486.9, fechaActualizacion: STAMP },
    { moneda: "USD", casa: "contadoconliqui", nombre: "Contado con liquidación", compra: 1501.2, venta: 1509.6, fechaActualizacion: STAMP },
    { moneda: "USD", casa: "cripto", nombre: "Cripto", compra: 1512.5, venta: 1522.0, fechaActualizacion: STAMP },
  ],
  criptoyaUsdt: {
    bitsoalpha: { ask: 1521.3, totalAsk: 1521.3, bid: 1514.8, totalBid: 1514.8, time: 1793890800 },
    fiwind: { ask: 1524.0, totalAsk: 1524.0, bid: 1513.9, totalBid: 1513.9, time: 1793890800 },
    belo: { ask: 1526.5, totalAsk: 1526.5, bid: 1508.2, totalBid: 1508.2, time: 1793890800 },
    lemoncash: { ask: 1528.1, totalAsk: 1528.1, bid: 1506.7, totalBid: 1506.7, time: 1793890800 },
    buenbit: { ask: 1525.6, totalAsk: 1525.6, bid: 1510.4, totalBid: 1510.4, time: 1793890800 },
    ripio: { ask: 1530.2, totalAsk: 1530.2, bid: 1503.9, totalBid: 1503.9, time: 1793890800 },
  },
  criptoyaUsdc: {
    fiwind: { ask: 1525.1, totalAsk: 1525.1, bid: 1512.6, totalBid: 1512.6, time: 1793890800 },
    belo: { ask: 1527.4, totalAsk: 1527.4, bid: 1509.1, totalBid: 1509.1, time: 1793890800 },
    lemoncash: { ask: 1529.0, totalAsk: 1529.0, bid: 1505.8, totalBid: 1505.8, time: 1793890800 },
    buenbit: { ask: 1526.3, totalAsk: 1526.3, bid: 1509.7, totalBid: 1509.7, time: 1793890800 },
    wallbit: { ask: 1527.0, totalAsk: 1527.0, bid: 1511.0, totalBid: 1511.0, time: 1793890800 },
  },
});
