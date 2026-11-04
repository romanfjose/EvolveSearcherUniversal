import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { maxOutputTokens: 1024 },
});

export async function describe(contents) {
  const result = await model.generateContent({ contents });
  return result.response.text();
}
