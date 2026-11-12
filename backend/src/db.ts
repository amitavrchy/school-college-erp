import { Injectable, OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { config } from './config';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, BeforeApplicationShutdown {
  constructor() {
    const url = new URL(config.DATABASE_URL);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '10');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '15');
    super({ datasourceUrl: url.toString() });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async beforeApplicationShutdown() {
    await this.$disconnect();
  }
  async serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(fn, {
          isolationLevel: 'Serializable',
          maxWait: 10000,
          timeout: 15000,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !(
            error.code === 'P2034' ||
            (error.code === 'P2028' &&
              String(error.meta?.error || '').startsWith('Unable to start a transaction'))
          ) ||
          attempt >= 4
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
      }
    }
  }
}
