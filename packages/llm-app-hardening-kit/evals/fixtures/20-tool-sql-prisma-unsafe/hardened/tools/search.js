import { prisma } from '../db.js';

export async function searchProducts({ query }) {
  const term = `%${String(query).slice(0, 100)}%`;
  return prisma.$queryRaw`SELECT id, name, price FROM products WHERE name ILIKE ${term} LIMIT 10`;
}
