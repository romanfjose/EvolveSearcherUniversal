import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

export const app = express();

app.post('/webhooks/replicate', express.raw({ type: 'application/json' }), async (req, res) => {
  const id = req.header('webhook-id'), ts = req.header('webhook-timestamp'), sig = req.header('webhook-signature') ?? '';
  const key = Buffer.from(process.env.REPLICATE_WEBHOOK_SECRET.split('_')[1], 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${req.body}`).digest('base64');
  const ok = sig.split(' ').some((s) => {
    const got = Buffer.from(s.split(',')[1] ?? '', 'base64');
    return got.length === 32 && timingSafeEqual(got, Buffer.from(expected, 'base64'));
  });
  if (!ok || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.sendStatus(401);
  const { id: predictionId, status, output } = JSON.parse(req.body.toString('utf8'));
  await db.predictions.update({ where: { id: predictionId }, data: { status, output } });
  res.sendStatus(200);
});
