import { Injectable, Logger } from '@nestjs/common';
import { config } from './config';
/**
 * Delivery of transactional messages (one-time codes, invitations, reminders).
 * The console adapter never prints message bodies in production because they can carry
 * personal data or codes; in development it prints them so flows can be exercised locally.
 */
@Injectable()
export class Notifier {
  private log = new Logger('Notifier');
  /** Generic HTTP gateway contract: POST {to, body, sender} → {id}. */
  async sms(to: string, body: string, idempotencyKey?: string) {
    if (config.SMS_PROVIDER === 'console') {
      if (config.NODE_ENV !== 'production') this.log.log(`SMS to ${to}: ${body}`);
      return { provider: 'console' as const, id: null };
    }
    if (!config.SMS_API_URL || !config.SMS_API_KEY)
      throw new Error('SMS gateway is not configured');
    const response = await fetch(config.SMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.SMS_API_KEY}`,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ to, body, sender: config.SMS_SENDER_ID }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
    const result = (await response.json().catch(() => ({}))) as { id?: string };
    if (!result.id) throw new Error('SMS response missing message ID');
    return { provider: 'http' as const, id: result.id };
  }
  async email(to: string, subject: string, text: string) {
    if (config.EMAIL_PROVIDER === 'console') {
      if (config.NODE_ENV !== 'production') this.log.log(`Email to ${to}: ${subject}\n${text}`);
      return { provider: 'console', id: null };
    }
    if (!config.EMAIL_API_URL || !config.EMAIL_API_KEY)
      throw new Error('Email provider is not configured');
    const response = await fetch(config.EMAIL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.EMAIL_API_KEY}`,
      },
      body: JSON.stringify({ from: config.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    return { provider: 'http', id: null };
  }
  /** Sends to whichever channel the contact belongs to. */
  send(contact: string, subject: string, text: string) {
    return contact.includes('@') ? this.email(contact, subject, text) : this.sms(contact, text);
  }
}
