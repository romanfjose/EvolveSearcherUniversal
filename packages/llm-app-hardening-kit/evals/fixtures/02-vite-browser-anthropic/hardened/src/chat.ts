// The browser talks to our own authenticated endpoint; the provider key never leaves the server.
export async function ask(question: string) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ask failed: ${res.status}`);
  return (await res.json()) as { answer: string };
}
