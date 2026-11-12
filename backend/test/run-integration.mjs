import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  [
    '--env-file-if-exists=.env',
    '--import',
    'tsx',
    '--test',
    'test/integration.test.ts',
    'test/saas.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, RUN_INTEGRATION: 'true' } },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
