import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { JwtService } from '@nestjs/jwt';
import { base32Decode, base32Encode, hashRecovery, totp, verifyTotp } from '../src/auth/totp';
import { RedisRateLimitStore, type RedisLike } from '../src/auth/redis-store';
import { admissionBucket, ipBucket } from '../src/auth/rate-limit';
process.env.DATABASE_URL ||= 'postgresql://unit:unit@localhost:5432/unit';
process.env.JWT_ACCESS_SECRET ||= 'a-unit-test-secret-with-more-than-32-characters';
test('TOTP matches the RFC 6238 SHA-1 reference values', () => {
  // RFC 6238 Appendix B secret "12345678901234567890"; 8-digit references truncated to 6.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totp(secret, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totp(secret, Math.floor(1234567890 / 30)), '005924');
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  const now = 1234567890_000;
  assert.equal(verifyTotp(secret, '005924', now), true);
  assert.equal(verifyTotp(secret, '005924', now + 30_000), true, 'one step of drift allowed');
  assert.equal(verifyTotp(secret, '005924', now + 90_000), false);
  assert.equal(verifyTotp(secret, 'abcdef', now), false);
  assert.equal(hashRecovery(' ABCDE-12345 '), hashRecovery('abcde-12345'));
});
test('contacts normalise to one form so a trial cannot be claimed twice with formatting tricks', async () => {
  const { normalizeContact } = await import('../src/auth/otp');
  assert.equal(normalizeContact('+8801712345678'), '01712345678');
  assert.equal(normalizeContact('8801712-345678'), '01712345678');
  assert.equal(normalizeContact('01712 345678'), '01712345678');
  assert.equal(normalizeContact(' Head@School.EDU.bd '), 'head@school.edu.bd');
  assert.throws(() => normalizeContact('01212345678'));
});
test('capability tokens are never accepted as sessions and sessions are never capabilities', async () => {
  const { signCapability, verifyCapability, readClaims } = await import('../src/auth/capability');
  const jwt = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET,
    signOptions: { issuer: 'campus-one', audience: 'campus-one' },
    verifyOptions: { issuer: 'campus-one', audience: 'campus-one' },
  });
  const capability = await signCapability(jwt, 'doc-1', 'DOCUMENT_DOWNLOAD', '5m');
  await assert.rejects(jwt.verifyAsync(capability), 'session verification must reject it');
  await verifyCapability(jwt, capability, 'DOCUMENT_DOWNLOAD', 'doc-1');
  await assert.rejects(verifyCapability(jwt, capability, 'ADMISSION_UPLOAD', 'doc-1'));
  await assert.rejects(verifyCapability(jwt, capability, 'DOCUMENT_DOWNLOAD', 'doc-2'));
  const session = await jwt.signAsync({ sub: 'doc-1', purpose: 'DOCUMENT_DOWNLOAD' });
  assert.equal(await readClaims(jwt, session), null);
});
/** Minimal in-memory stand-in for the Redis commands the store uses. */
function fakeRedis(): RedisLike {
  const data = new Map<string, { n: number; until: number }>();
  return {
    async eval(_script, _keys, key, windowMs) {
      const now = Date.now();
      let e = data.get(String(key));
      if (!e || e.until <= now)
        data.set(String(key), (e = { n: 0, until: now + Number(windowMs) }));
      e.n++;
      return [e.n, e.until - now];
    },
    async del(...keys) {
      keys.forEach((k) => data.delete(k));
      return keys.length;
    },
    async decr(key) {
      const e = data.get(key);
      if (e) e.n--;
      return e?.n ?? 0;
    },
  };
}
async function server(trust: boolean | number, keyGenerator = ipBucket) {
  const app = express();
  app.set('trust proxy', trust);
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 2,
      store: new RedisRateLimitStore(fakeRedis(), 'test'),
      keyGenerator,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.post('/', (_req, res) => {
    res.json({ ok: true });
  });
  const listener = app.listen(0);
  await new Promise((r) => listener.once('listening', r));
  const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/`;
  const hit = (forwardedFor: string, body: object = {}) =>
    fetch(url, {
      method: 'POST',
      headers: { 'X-Forwarded-For': forwardedFor, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.status);
  return { hit, close: () => listener.close() };
}
test('behind a trusted proxy each client gets its own rate-limit bucket', async () => {
  const s = await server(1);
  try {
    assert.deepEqual(
      [await s.hit('203.0.113.1'), await s.hit('203.0.113.1'), await s.hit('203.0.113.1')],
      [200, 200, 429],
    );
    assert.equal(await s.hit('203.0.113.2'), 200, 'another client is not affected');
  } finally {
    s.close();
  }
});
test('without trust proxy a forged X-Forwarded-For cannot buy extra attempts', async () => {
  const s = await server(false);
  try {
    assert.equal(await s.hit('198.51.100.1'), 200);
    assert.equal(await s.hit('198.51.100.2'), 200);
    assert.equal(await s.hit('198.51.100.3'), 429);
  } finally {
    s.close();
  }
});
test('admission submissions are limited per client and admission session', async () => {
  const s = await server(1, admissionBucket);
  try {
    const school = (sessionId: string) => ({ sessionId });
    await s.hit('203.0.113.9', school('session-a'));
    await s.hit('203.0.113.9', school('session-a'));
    assert.equal(await s.hit('203.0.113.9', school('session-a')), 429);
    assert.equal(
      await s.hit('203.0.113.9', school('session-b')),
      200,
      'another school is unaffected',
    );
  } finally {
    s.close();
  }
});
test('TRUST_PROXY values map to what Express expects', async () => {
  const { trustProxy } = await import('../src/config');
  assert.equal(trustProxy('false'), false);
  assert.equal(trustProxy('true'), true);
  assert.equal(trustProxy('1'), 1);
  assert.equal(trustProxy('10.0.0.0/8, 172.16.0.0/12'), '10.0.0.0/8, 172.16.0.0/12');
});
test('app version gate compares each part numerically', async () => {
  const { versionAtLeast } = await import('../src/auth/mobile.controller');
  assert.equal(versionAtLeast('1.10.0', '1.9.3'), true);
  assert.equal(versionAtLeast('1.2', '1.2.0'), true);
  assert.equal(versionAtLeast('1.2.0', '1.3.0'), false);
  assert.equal(versionAtLeast('2.0.0', '1.99.99'), true);
});
