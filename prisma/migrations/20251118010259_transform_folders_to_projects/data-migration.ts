/**
 * Data migration script to transform folders to projects
 *
 * This script:
 * 1. Migrates all Folders to SourceProjects
 * 2. Updates Documents to use sourceProjectId instead of folderId
 * 3. Creates TranslationProjects for each SourceProject + Language combination
 *
 * Run this after applying the schema migration:
 * npx tsx prisma/migrations/20251118010259_transform_folders_to_projects/data-migration.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting data migration: Folders to Projects...');

  // Step 1: Migrate Folders to SourceProjects
  console.log('Step 1: Migrating Folders to SourceProjects...');
  const folders = await prisma.folder.findMany();

  for (const folder of folders) {
    const sourceProject = await prisma.sourceProject.create({
      data: {
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      },
    });
    console.log(`  Created SourceProject: ${sourceProject.name}`);
  }

  // Step 2: Update Documents to use sourceProjectId
  console.log('\nStep 2: Updating Documents to use sourceProjectId...');
  const documents = await prisma.document.findMany({
    where: {
      folderId: { not: null },
    },
  });

  for (const document of documents) {
    if (document.folderId) {
      await prisma.document.update({
        where: { id: document.id },
        data: { sourceProjectId: document.folderId },
      });
      console.log(`  Updated Document: ${document.title}`);
    }
  }

  // Step 3: Create TranslationProjects for each SourceProject + Language combination
  console.log('\nStep 3: Creating TranslationProjects...');
  const sourceProjects = await prisma.sourceProject.findMany();
  const languages = await prisma.language.findMany({
    where: {
      code: { not: 'en' }, // Exclude English (source language)
    },
  });

  for (const sourceProject of sourceProjects) {
    for (const language of languages) {
      const translationProject = await prisma.translationProject.create({
        data: {
          name: `${sourceProject.name} - ${language.name}`,
          sourceProjectId: sourceProject.id,
          languageId: language.id,
        },
      });
      console.log(`  Created TranslationProject: ${translationProject.name}`);
    }
  }

  console.log('\n✅ Data migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
