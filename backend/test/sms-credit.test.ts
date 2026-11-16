import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { Db } from '../src/db';
import { Jobs } from '../src/jobs';
import { PlatformController } from '../src/saas/controllers';
import { Settings, SettingsController } from '../src/settings';

test(
  'SMS credit is isolated, serialized, idempotent and refunded on provider failure',
  { skip: process.env.RUN_INTEGRATION !== 'true' },
  async () => {
    const db = new Db();
    const org = await db.organization.create({ data: { name: 'SMS test' } });
    const other = await db.organization.create({ data: { name: 'Other SMS test' } });
    const campus = await db.campus.create({
      data: { orgId: org.id, name: 'SMS campus', code: 'SMS' },
    });
    let sends = 0;
    let fail = false;
    const notifier = {
      sms: async () => {
        sends++;
        if (fail) throw new Error('provider failure');
        return { provider: 'console', id: 'test' };
      },
    };
    const settings = new Settings(db);
    const jobs = new Jobs(db, {} as any, {} as any, notifier as any, settings);
    const platform = new PlatformController(db, {} as any);
    const settingsController = new SettingsController(db, settings, {} as any);
    const actor = { userId: 'platform-test', orgId: org.id } as any;
    const message = async (body: string) =>
      db.smsMessage.create({
        data: { campusId: campus.id, toPhone: '01712345678', body, dedupeKey: randomUUID() },
      });
    try {
      const blocked = await message('hello');
      await jobs.sendSms(blocked.id);
      assert.equal(sends, 0);
      assert.equal(
        (await db.smsMessage.findUniqueOrThrow({ where: { id: blocked.id } })).status,
        'INSUFFICIENT_CREDIT',
      );
      assert.equal((await settingsController.smsCredit(actor)).blocked, 1);
      await platform.topUpSms(actor, org.id, { amount: 2, reference: 'receipt-1' });
      await platform.topUpSms(actor, org.id, { amount: 2, reference: 'receipt-1' });
      await assert.rejects(() =>
        platform.topUpSms(actor, org.id, { amount: 3, reference: 'receipt-1' }),
      );
      assert.equal((await settingsController.smsCredit(actor)).balance, 2);
      assert.equal((await settingsController.smsCredit({ ...actor, orgId: other.id })).balance, 0);
      const one = await message('ক'.repeat(71));
      const two = await message('ক'.repeat(71));
      await Promise.all([jobs.sendSms(one.id), jobs.sendSms(two.id)]);
      assert.equal(sends, 1);
      assert.equal((await settingsController.smsCredit(actor)).balance, 0);
      assert.equal(
        await db.smsMessage.count({
          where: { id: { in: [one.id, two.id] }, status: 'INSUFFICIENT_CREDIT' },
        }),
        1,
      );
      await platform.topUpSms(actor, org.id, { amount: 1, reference: 'receipt-2' });
      fail = true;
      await assert.rejects(() => jobs.sendSms(blocked.id));
      assert.equal((await settingsController.smsCredit(actor)).balance, 1);
      fail = false;
      await jobs.sendSms(blocked.id);
      await jobs.sendSms(blocked.id);
      assert.equal((await settingsController.smsCredit(actor)).balance, 0);
      assert.equal(sends, 3);
    } finally {
      await jobs.onModuleDestroy();
      await db.smsCreditEntry.deleteMany({ where: { organizationId: { in: [org.id, other.id] } } });
      await db.smsMessage.deleteMany({ where: { campusId: campus.id } });
      await db.campus.delete({ where: { id: campus.id } });
      await db.organization.deleteMany({ where: { id: { in: [org.id, other.id] } } });
      await db.$disconnect();
    }
  },
);
