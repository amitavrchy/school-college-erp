import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) console.log('Existing .env preserved.');
else {
  writeFileSync(
    '.env',
    readFileSync('.env.example', 'utf8').replace(
      'replace-with-a-random-secret-of-at-least-32-characters',
      randomBytes(48).toString('hex'),
    ),
  );
  console.log('Created .env with a random session secret. Review settings before production use.');
}
