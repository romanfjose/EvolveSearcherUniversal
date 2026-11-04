import { grantCredits } from '@/lib/credits';

export async function POST(req: Request) {
  const event = await req.json();
  if (event.type === 'checkout.session.completed') {
    await grantCredits(event.data.object.client_reference_id, 1000);
  }
  return Response.json({ received: true });
}
