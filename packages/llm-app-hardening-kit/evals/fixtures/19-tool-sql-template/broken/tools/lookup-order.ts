import { pool } from '../db';

export async function lookupOrder(args: { email: string }) {
  const { rows } = await pool.query(`SELECT id, total, status FROM orders WHERE email = '${args.email}' ORDER BY created_at DESC`);
  return rows;
}
