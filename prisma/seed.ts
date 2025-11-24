import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // Delete all document translations (DocumentVersions)
  // This will cascade delete Comments and ActivityLogs
  const deletedVersions = await prisma.documentVersion.deleteMany({});
  console.log(`✓ Deleted ${deletedVersions.count} document versions (translations)`);

  // Delete all document assignments
  const deletedAssignments = await prisma.documentAssignment.deleteMany({});
  console.log(`✓ Deleted ${deletedAssignments.count} document assignments`);

  // Delete all documents
  // This will cascade delete any remaining related data
  const deletedDocuments = await prisma.document.deleteMany({});
  console.log(`✓ Deleted ${deletedDocuments.count} documents`);

  // Create initial languages
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'cs', name: 'Czech' },
    { code: 'sk', name: 'Slovak' },
  ];

  for (const lang of languages) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: {},
      create: lang,
    });
    console.log(`✓ Language ${lang.name} (${lang.code}) created/updated`);
  }

  // Create initial folders
  const folders = [{ name: 'Exodus90 - 2026' }, { name: 'Advent 2025' }];

  for (const folder of folders) {
    await prisma.folder.upsert({
      where: { name: folder.name },
      update: {},
      create: folder,
    });
    console.log(`✓ Folder ${folder.name} created/updated`);
  }

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
