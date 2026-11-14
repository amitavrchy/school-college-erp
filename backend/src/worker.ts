import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Db } from './db';
import { Jobs } from './jobs';
import { Realtime } from './realtime';
import { Billing } from './modules/billing';
import { Notifier } from './notify';
import { Settings } from './settings';
import { Push } from './push';
import { config } from './config';
/**
 * Background worker: runs BullMQ processors and schedules (notices, fines, monthly billing,
 * reminders, seat-offer expiry, SMS delivery). No HTTP server; the API only enqueues.
 */
@Module({ providers: [Db, Jobs, Realtime, Billing, Notifier, Settings, Push] })
class WorkerModule {}
async function main() {
  if (!config.RUN_JOBS) throw new Error('The worker needs RUN_JOBS=true');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log('Campus One worker started');
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
