'use client';
import Anthropic from '@anthropic-ai/sdk';

export function ChatBox({ apiKey }: { apiKey: string }) {
  const client = new Anthropic({ apiKey });
  async function send(text: string) {
    return client.messages.create({ model: 'claude-haiku-5-5', max_tokens: 512, messages: [{ role: 'user', content: text }] });
  }
  return <form action={async (fd) => { await send(String(fd.get('q'))); }} />;
}
