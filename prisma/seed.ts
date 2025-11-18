import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seeding...");

  // Create initial languages
  const languages = [
    { code: "en", name: "English" },
    { code: "cs", name: "Czech" },
    { code: "sk", name: "Slovak" },
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
  const folders = [
    { name: "Exodus90 - 2026" },
    { name: "Advent 2025" },
  ];

  for (const folder of folders) {
    await prisma.folder.upsert({
      where: { name: folder.name },
      update: {},
      create: folder,
    });
    console.log(`✓ Folder ${folder.name} created/updated`);
  }

  console.log("Database seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
