import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const sh = promisify(exec);

export const gitLogTool = {
  name: 'git_log',
  description: 'Show commits by author',
  async run(args: { author: string }) {
    return new Promise((resolve) => exec(`git log --oneline --author=${args.author}`, (_e, out) => resolve(out)));
  },
};
