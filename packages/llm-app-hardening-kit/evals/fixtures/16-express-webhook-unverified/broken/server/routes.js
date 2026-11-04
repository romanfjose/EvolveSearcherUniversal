import express from 'express';
import { db } from './db.js';

export const app = express();
app.use(express.json());

app.post('/webhooks/replicate', async (req, res) => {
  const { id, status, output } = req.body;
  await db.predictions.update({ where: { id }, data: { status, output } });
  res.sendStatus(200);
});
