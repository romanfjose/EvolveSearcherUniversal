export function runGenerated(completion, data) {
  const body = completion.choices[0].message.content;
  const fn = new Function('data', body);
  return fn(data);
}
