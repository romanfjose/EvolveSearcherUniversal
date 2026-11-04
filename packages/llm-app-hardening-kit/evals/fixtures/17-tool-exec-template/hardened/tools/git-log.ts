import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

export const gitLogTool = {
  name: 'git_log',
  description: 'Show commits by author',
  async run(args: { author: string }) {
    if (!/^[\w .@-]{1,64}$/.test(args.author)) throw new Error('invalid author');
    const { stdout } = await run('git', ['log', '--oneline', `--author=${args.author}`], { timeout: 10_000 });
    return stdout;
  },
};
