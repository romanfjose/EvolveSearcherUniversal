import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const refundTool = {
  name: 'issue_refund',
  async run(args: { paymentIntentId: string; amount: number }, ctx: { toolCallId: string }) {
    const refund = await stripe.refunds.create(
      { payment_intent: args.paymentIntentId, amount: args.amount },
      { idempotencyKey: `refund:${ctx.toolCallId}` },
    );
    return { id: refund.id, status: refund.status };
  },
};
