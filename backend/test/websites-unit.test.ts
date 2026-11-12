import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSchema, defaultContent } from '../src/websites/content';
import { normalizeHostname, verifyDomainRecords } from '../src/websites/domains';
test('CMS rejects executable URLs, duplicate page paths and unconsented roll-only publication', () => {
  const content = defaultContent('Example International School');
  assert.equal(contentSchema.safeParse(content).success, true);
  assert.equal(
    contentSchema.safeParse({ ...content, logoUrl: 'javascript:alert(1)' }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({ ...content, pages: [content.pages[0], content.pages[0]] }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({ ...content, resultAccess: 'ROLL_ONLY', rollOnlyConsent: false })
      .success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({ ...content, resultAccess: 'ROLL_ONLY', rollOnlyConsent: true })
      .success,
    true,
  );
  assert.equal(
    contentSchema.safeParse({ ...content, downloads: [{ title: 'Prospectus', url: '' }] }).success,
    false,
  );
});
test('domain claims require matching TXT ownership proof and routing records', async () => {
  assert.equal(normalizeHostname('WWW.Example.edu.bd.'), 'www.example.edu.bd');
  for (const invalid of [
    'https://school.edu.bd',
    'school.edu.bd/path',
    'localhost',
    '127.0.0.1',
    'evil.com:443',
  ])
    assert.throws(() => normalizeHostname(invalid));
  const dns = {
    resolveTxt: async () => [['campusone-verification=', 'proof']],
    resolveCname: async () => ['SITES.EXAMPLE.COM.'],
  };
  assert.equal(
    await verifyDomainRecords('www.school.edu.bd', 'proof', 'sites.example.com', dns as any),
    true,
  );
  assert.equal(
    await verifyDomainRecords(
      'www.school.edu.bd',
      'different-proof',
      'sites.example.com',
      dns as any,
    ),
    false,
  );
  assert.equal(
    await verifyDomainRecords('www.school.edu.bd', 'proof', 'wrong.example.com', dns as any),
    false,
  );
});
