import Stripe from 'stripe';
import { sql } from './db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const tools = [
  { type: 'function', function: { name: 'find_orders', parameters: { type: 'object', properties: { email: { type: 'string' } } } } },
  { type: 'function', function: { name: 'refund', parameters: { type: 'object', properties: { paymentIntent: { type: 'string' } } } } },
];

export const handlers: Record<string, (args: any) => Promise<unknown>> = {
  find_orders: async ({ email }) => (await sql.query(`SELECT id, total FROM orders WHERE email = '${email}'`)).rows,
  refund: async ({ paymentIntent }) => stripe.refunds.create({ payment_intent: paymentIntent }),
};
