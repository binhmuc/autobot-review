import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Upsert sample project (idempotent)
  const project = await prisma.project.upsert({
    where: { gitlabProjectId: 1 },
    update: {},
    create: {
      gitlabProjectId: 1,
      name: 'Sample Project',
      namespace: 'sample-group',
      webhookSecret: 'sample_secret',
    },
  });

  // Upsert sample developer (idempotent)
  const developer = await prisma.developer.upsert({
    where: { gitlabUserId: 1 },
    update: {},
    create: {
      gitlabUserId: 1,
      username: 'test_developer',
      name: 'Test Developer',
    },
  });

  console.log('✓ Seed completed successfully');
  console.log('Seeded:', { project, developer });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
