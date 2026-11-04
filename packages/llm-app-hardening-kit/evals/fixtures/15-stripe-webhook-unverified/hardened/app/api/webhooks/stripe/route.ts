import Stripe from 'stripe';
import { grantCreditsOnce } from '@/lib/credits';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers.get('stripe-signature')!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('bad signature', { status: 400 });
  }
  if (event.type === 'checkout.session.completed') {
    await grantCreditsOnce(event.id, event.data.object.client_reference_id!, 1000); // dedupe by event id
  }
  return Response.json({ received: true });
}
