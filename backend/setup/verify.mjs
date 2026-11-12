import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const windows = process.platform === 'win32';
const npmCli =
  process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function run(directory, args) {
  console.log(`\n[${directory}] npm ${args.join(' ')}`);
  const result = spawnSync(windows ? process.execPath : 'npm', windows ? [npmCli, ...args] : args, {
    cwd: resolve(root, directory),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run('backend', ['run', 'db:generate']);
for (const directory of ['backend', 'frontend']) {
  run(directory, ['run', 'format:check']);
  run(directory, ['run', 'typecheck']);
  if (directory === 'backend') run(directory, ['test']);
  run(directory, ['run', 'build']);
  run(directory, ['audit', '--audit-level=high']);
}
if (process.argv.includes('--integration')) {
  run('backend', ['run', 'test:integration']);
  run('frontend', ['run', 'test:e2e']);
}
console.log('\nRelease verification passed.');
