import Stripe from 'stripe';
import { sql } from './db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const tools = [
  { type: 'function', function: { name: 'find_orders', strict: true, parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'refund', strict: true, parameters: { type: 'object', required: ['paymentIntent'], properties: { paymentIntent: { type: 'string', pattern: '^pi_[A-Za-z0-9]+$' } }, additionalProperties: false } } },
];

type Ctx = { user: { email: string; orgId: string }; toolCallId: string };

export const handlers: Record<string, (args: any, ctx: Ctx) => Promise<unknown>> = {
  // The model never chooses whose orders to read: scope comes from the session.
  find_orders: async (_args, { user }) => (await sql.query('SELECT id, total FROM orders WHERE email = $1 LIMIT 50', [user.email])).rows,
  refund: async ({ paymentIntent }, { user, toolCallId }) => {
    const { rows } = await sql.query('SELECT 1 FROM orders WHERE payment_intent = $1 AND email = $2', [paymentIntent, user.email]);
    if (!rows.length) throw new Error('payment not found for this customer');
    return stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `refund:${toolCallId}` });
  },
};
