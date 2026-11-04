'use client';
import { useState } from 'react';

export default function Playground() {
  const [out, setOut] = useState('');
  async function run(prompt: string) {
    // Session cookie authenticates the user; /api/proxy holds GROQ_API_KEY server-side.
    const res = await fetch('/api/proxy', { method: 'POST', body: JSON.stringify({ prompt }) });
    setOut(await res.text());
  }
  return <button onClick={() => run('hello')}>{out || 'Run'}</button>;
}
