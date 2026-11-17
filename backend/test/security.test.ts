import test from 'node:test';
import assert from 'node:assert/strict';
import { JwtService } from '@nestjs/jwt';
import { requestBucket } from '../src/auth/rate-limit';
import { extendPeriod, subscriptionUsable } from '../src/saas/policy';
test('authenticated users behind one proxy get separate request quotas; forged cookies cannot create buckets', async () => {
  const jwt = new JwtService({ secret: 'a-test-only-secret-with-more-than-32-characters' });
  const a = await jwt.signAsync({ sub: 'user-a', v: 0 }),
    b = await jwt.signAsync({ sub: 'user-b', v: 0 });
  const req = (token?: string) => ({
    ip: '127.0.0.1',
    headers: {},
    cookies: token ? { campus_session: token } : undefined,
  });
  assert.notEqual(await requestBucket(req(a), jwt), await requestBucket(req(b), jwt));
  assert.equal(await requestBucket(req('forged-token'), jwt), await requestBucket(req(), jwt));
  const rotated = await jwt.signAsync({ sub: 'user-a', v: 1 });
  assert.equal(await requestBucket(req(a), jwt), await requestBucket(req(rotated), jwt));
  const capability = await jwt.signAsync({ sub: 'a-document', purpose: 'DOCUMENT_DOWNLOAD' });
  assert.equal(await requestBucket(req(capability), jwt), await requestBucket(req(), jwt));
});
test('subscription expiry and end-of-month renewals have precise boundaries', () => {
  const now = new Date('2026-01-31T10:30:00Z');
  assert.equal(extendPeriod(now, 'MONTHLY').toISOString(), '2026-02-28T10:30:00.000Z');
  assert.equal(
    extendPeriod(new Date('2024-02-29T00:00:00Z'), 'YEARLY').toISOString(),
    '2025-02-28T00:00:00.000Z',
  );
  assert.equal(subscriptionUsable({ status: 'ACTIVE', currentPeriodEnd: now }, now), false);
  assert.equal(
    subscriptionUsable({ status: 'TRIAL', currentPeriodEnd: new Date(now.getTime() + 1) }, now),
    true,
  );
  assert.equal(
    subscriptionUsable({ status: 'SUSPENDED', currentPeriodEnd: new Date('2027-01-01') }, now),
    false,
  );
});
