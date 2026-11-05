// Deterministic PRNG (mulberry32) and random-book generator for property tests.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBook(r, { levels = 1 + Math.floor(r() * 30), top = 1000 + r() * 1000 } = {}) {
  const out = [];
  let p = top;
  for (let i = 0; i < levels; i++) {
    out.push({ price: p, amount: 1 + r() * 5000 });
    p -= 0.01 + r() * 5;
    if (p <= 1) break;
  }
  return out;
}

export const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
export const SEEDS = Array.from({ length: 50 }, (_, i) => 1000 + i * 7919);
