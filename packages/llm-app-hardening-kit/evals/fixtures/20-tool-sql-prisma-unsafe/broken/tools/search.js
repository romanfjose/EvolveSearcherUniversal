import { prisma } from '../db.js';

export async function searchProducts({ query }) {
  return prisma.$queryRawUnsafe("SELECT id, name, price FROM products WHERE name ILIKE '%" + query + "%' LIMIT 10");
}
