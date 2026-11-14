import { Inject, Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { Db } from './db';
import { config } from './config';
/** What a push is about. The app fetches the details after sign-in; the push carries none. */
export type PushEvent = 'attendance' | 'notice' | 'fees' | 'payment' | 'results' | 'homework';
const TEXT: Record<PushEvent, { bn: [string, string]; en: [string, string] }> = {
  attendance: {
    bn: ['উপস্থিতি', 'উপস্থিতির নতুন তথ্য আছে'],
    en: ['Attendance', 'There is a new attendance update'],
  },
  notice: { bn: ['নোটিশ', 'স্কুল থেকে নতুন নোটিশ'], en: ['Notice', 'New notice from school'] },
  fees: { bn: ['ফি', 'ফি পরিশোধের তারিখ কাছে'], en: ['Fees', 'A fee payment is due soon'] },
  payment: {
    bn: ['পেমেন্ট', 'আপনার পেমেন্ট গ্রহণ করা হয়েছে'],
    en: ['Payment', 'Your payment was received'],
  },
  results: {
    bn: ['ফলাফল', 'নতুন ফলাফল প্রকাশিত হয়েছে'],
    en: ['Results', 'New results are published'],
  },
  homework: {
    bn: ['বাড়ির কাজ', 'নতুন বাড়ির কাজ দেওয়া হয়েছে'],
    en: ['Homework', 'New homework was posted'],
  },
};
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}
/**
 * Firebase Cloud Messaging (HTTP v1). Messages say only what happened ("New notice from school"),
 * never a child's name, marks or amounts, because they appear on lock screens.
 */
@Injectable()
export class Push {
  private log = new Logger('Push');
  private account?: ServiceAccount;
  private token?: { value: string; until: number };
  constructor(@Inject(Db) private db: Db) {
    if (config.FCM_SERVICE_ACCOUNT)
      this.account = JSON.parse(Buffer.from(config.FCM_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  }
  get enabled() {
    return !!this.account;
  }
  private async accessToken() {
    if (this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const a = this.account!;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: a.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(a.private_key, 'base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`FCM auth failed with ${response.status}`);
    const json = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, until: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
  /** Sends one event to every registered phone of these users; forgets tokens FCM rejects. */
  async send(userIds: string[], event: PushEvent, data: Record<string, string> = {}) {
    const devices = await this.db.device.findMany({ where: { userId: { in: userIds } } });
    if (!devices.length) return { sent: 0 };
    if (!this.account) {
      if (config.NODE_ENV !== 'production')
        this.log.log(`Push ${event} to ${devices.length} device(s)`);
      return { sent: 0 };
    }
    const bearer = await this.accessToken();
    let sent = 0;
    for (const d of devices) {
      const [title, body] = TEXT[event][d.locale === 'en' ? 'en' : 'bn'];
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.pushToken,
              notification: { title, body },
              data: { event, ...data },
              android: { priority: 'HIGH', notification: { channel_id: 'school_updates' } },
            },
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.ok) sent++;
      else if (response.status === 404 || response.status === 400)
        await this.db.device.deleteMany({ where: { id: d.id } });
      else this.log.warn(`FCM returned ${response.status}`);
    }
    return { sent };
  }
}
