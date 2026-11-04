'use client';
import { useState } from 'react';

export default function Playground() {
  const [out, setOut] = useState('');
  async function run(prompt: string) {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}` },
      body: JSON.stringify({ prompt }),
    });
    setOut(await res.text());
  }
  return <button onClick={() => run('hello')}>{out || 'Run'}</button>;
}
