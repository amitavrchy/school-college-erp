import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Db } from './db';
import { Jobs } from './jobs';
import { Public } from './auth/access';
@Controller('health')
@Public()
export class HealthController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Jobs) private jobs: Jobs,
  ) {}
  @Get('live') live() {
    return { status: 'ok', service: 'campus-one-api' };
  }
  @Get() async ready() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([this.db.$queryRaw`SELECT 1`, this.jobs.ping()]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Readiness timeout')), 2500);
        }),
      ]);
      return { status: 'ok', service: 'campus-one-api', database: 'ready', jobs: 'ready' };
    } catch {
      throw new ServiceUnavailableException('A required dependency is unavailable');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
