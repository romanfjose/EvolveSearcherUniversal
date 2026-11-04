import { pool } from '../db';

export async function lookupOrder(args: { email: string }, session: { email: string }) {
  if (args.email !== session.email) throw new Error('forbidden');
  const { rows } = await pool.query('SELECT id, total, status FROM orders WHERE email = $1 ORDER BY created_at DESC LIMIT 20', [args.email]);
  return rows;
}
