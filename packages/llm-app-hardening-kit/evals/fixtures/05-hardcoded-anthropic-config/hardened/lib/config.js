// Example value for docs: "sk-ant-your-key-here"
export const config = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-5-5",
  temperature: 0.2,
};
if (!config.anthropicKey) throw new Error("ANTHROPIC_API_KEY missing");
