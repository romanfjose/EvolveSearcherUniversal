import { addCredits } from '@/lib/billing';

export async function POST(req: Request) {
  const event = await req.json();
  if (event.type === 'invoice.paid') await addCredits(event.data.object.customer, 5000);
  return new Response('ok');
}
