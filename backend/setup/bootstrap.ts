import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { PLAN_SEEDS } from '../src/saas/policy';

// Unlike the demo seed, this provisions no institutions or student records.
async function main() {
  const settings = z
    .object({
      PLATFORM_ADMIN_EMAIL: z.email().transform((s) => s.toLowerCase()),
      PLATFORM_SEED_PASSWORD: z.string().min(16).max(100),
    })
    .parse(process.env);
  const db = new PrismaClient();
  try {
    const passwordHash = await hash(settings.PLATFORM_SEED_PASSWORD, 12);
    const created = await db.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { id: 'platform-owner' } });
      if (owner && (owner.email !== settings.PLATFORM_ADMIN_EMAIL || !owner.platformAdmin)) {
        throw new Error(
          'Existing platform owner differs from configuration; no account was changed.',
        );
      }
      for (const plan of PLAN_SEEDS) {
        await tx.subscriptionPlan.upsert({
          where: { code: plan.code },
          create: plan,
          update: {},
        });
      }
      await tx.platformSettings.upsert({
        where: { id: 'platform' },
        create: { id: 'platform' },
        update: {},
      });
      if (!owner) {
        await tx.user.create({
          data: {
            id: 'platform-owner',
            email: settings.PLATFORM_ADMIN_EMAIL,
            fullName: 'Campus One Platform',
            passwordHash,
            platformAdmin: true,
          },
        });
      }
      return !owner;
    });
    console.log(
      created
        ? 'Platform owner and plans initialized. Configure receiving accounts in /platform.'
        : 'Existing platform owner, password and edited plan settings preserved.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  // Validation errors can contain supplied values; never print credential inputs.
  console.error(
    error instanceof z.ZodError
      ? 'Set a valid PLATFORM_ADMIN_EMAIL and a PLATFORM_SEED_PASSWORD of at least 16 characters.'
      : error instanceof Error
        ? error.message
        : 'Platform initialization failed.',
  );
  process.exitCode = 1;
});
