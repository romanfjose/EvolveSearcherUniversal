import { execFile } from 'node:child_process';

// Generated code runs in a throwaway, network-less container with no secrets mounted.
export function runGenerated(completion, data) {
  const body = completion.choices[0].message.content;
  return new Promise((resolve, reject) => {
    const child = execFile('docker', ['run', '--rm', '-i', '--network=none', '--memory=256m', '--cpus=0.5', 'node:22-alpine', 'node', '-e', body],
      { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    child.stdin.end(JSON.stringify(data));
  });
}
