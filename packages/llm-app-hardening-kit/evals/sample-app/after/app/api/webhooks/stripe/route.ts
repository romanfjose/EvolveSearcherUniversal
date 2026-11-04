import Stripe from 'stripe';
import { addCreditsOnce } from '@/lib/billing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get('stripe-signature') ?? '', process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
  if (event.type === 'invoice.paid') await addCreditsOnce(event.id, String(event.data.object.customer), 5000);
  return new Response('ok');
}
