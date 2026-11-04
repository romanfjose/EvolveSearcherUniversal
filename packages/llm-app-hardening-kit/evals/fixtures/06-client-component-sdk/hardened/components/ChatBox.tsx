'use client';
import { useChat } from '@ai-sdk/react';

export function ChatBox() {
  const { messages, sendMessage } = useChat(); // streams from /api/chat on the server
  return <form action={async (fd) => { await sendMessage({ text: String(fd.get('q')) }); }}>{messages.length}</form>;
}
