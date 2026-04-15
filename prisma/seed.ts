import { auth } from '@/lib/auth';
import { DocumentStatus, PrismaClient } from '@prisma/client';

import { CONTENT_BY_LANGUAGE, ENGLISH_CONTENT } from './seed-data/content';
import {
  COMMENTS,
  DOCUMENT_ASSIGNMENTS,
  DOCUMENTS,
  FOLDERS,
  LANGUAGES,
  PROJECT_MEMBERS,
  SOURCE_PROJECTS,
  SUGGESTIONS,
  TARGET_VERSIONS,
  USERS,
  daysAgo,
  daysFromNow,
} from './seed-data/datasets';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 1. Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log('\n--- Cleanup ---');
  const counts = await prisma.$transaction([
    prisma.suggestionReply.deleteMany(),
    prisma.suggestion.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.gitHubCommit.deleteMany(),
    prisma.documentVersion.deleteMany(),
    prisma.documentAssignment.deleteMany(),
    prisma.document.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.translationProject.deleteMany(),
    prisma.sourceProject.deleteMany(),
    prisma.userLanguage.deleteMany(),
    prisma.folder.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.verification.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log(`Deleted ${counts.reduce((s, c) => s + c.count, 0)} records total`);
}

// ---------------------------------------------------------------------------
// 2. Languages
// ---------------------------------------------------------------------------

async function seedLanguages() {
  console.log('\n--- Languages ---');

  const langs: Record<string, string> = {};
  for (const lang of LANGUAGES) {
    const result = await prisma.language.upsert({
      where: { code: lang.code },
      update: { name: lang.name, branchName: lang.branchName ?? null, translationInstructions: lang.translationInstructions ?? null },
      create: lang,
    });
    langs[lang.code] = result.id;
    console.log(`Language ${lang.name} (${lang.code})`);
  }
  return langs;
}

// ---------------------------------------------------------------------------
// 3. Folders
// ---------------------------------------------------------------------------

async function seedFolders() {
  console.log('\n--- Folders ---');
  for (const name of FOLDERS) {
    await prisma.folder.upsert({ where: { name }, update: {}, create: { name } });
    console.log(`Folder ${name}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Users
// ---------------------------------------------------------------------------

async function seedUsers(langs: Record<string, string>) {
  console.log('\n--- Users ---');

  const users: Record<string, string> = {};

  for (const u of USERS) {
    const result = await auth.api.createUser({
      body: { email: u.email, name: u.name, password: 'Hello123456', role: u.role },
    });
    users[u.key] = result.user.id;
    console.log(`User ${u.name} (${u.email}) -> ${u.key}`);

    // UserLanguage records
    for (const code of u.langCodes) {
      await prisma.userLanguage.create({
        data: { userId: result.user.id, languageId: langs[code] },
      });
    }
  }

  // Ban the banned user
  await prisma.user.update({
    where: { id: users.banned1 },
    data: { banned: true, banReason: 'Repeated policy violations', banExpires: daysFromNow(30) },
  });

  return users;
}

// ---------------------------------------------------------------------------
// 5. Source Projects
// ---------------------------------------------------------------------------

async function seedSourceProjects() {
  console.log('\n--- Source Projects ---');

  const projects: Record<string, string> = {};
  for (const p of SOURCE_PROJECTS) {
    const result = await prisma.sourceProject.create({
      data: { name: p.name, description: p.description, identifier: p.identifier, status: p.status },
    });
    projects[p.key] = result.id;
    console.log(`Project ${p.name} (${p.status})`);
  }
  return projects;
}

// ---------------------------------------------------------------------------
// 6. Translation Projects
// ---------------------------------------------------------------------------

async function seedTranslationProjects(
  projects: Record<string, string>,
  langs: Record<string, string>,
) {
  console.log('\n--- Translation Projects ---');

  const targetCodes = ['cs', 'sk', 'hr', 'de', 'fr'];
  const projectKeys = Object.keys(projects);
  const projectNames: Record<string, string> = {
    exodus: 'Exodus90 2026',
    lent: 'Lent 2026',
    advent: 'Advent 2025',
    retreat: 'Summer Retreat 2025',
  };
  const langNames: Record<string, string> = {
    cs: 'Czech',
    sk: 'Slovak',
    hr: 'Croatian',
    de: 'German',
    fr: 'French',
  };

  // key format: "exodus:cs"
  const tps: Record<string, string> = {};

  for (const pk of projectKeys) {
    for (const lc of targetCodes) {
      const name = `${projectNames[pk]} - ${langNames[lc]}`;
      const result = await prisma.translationProject.create({
        data: { name, sourceProjectId: projects[pk], languageId: langs[lc] },
      });
      tps[`${pk}:${lc}`] = result.id;
    }
  }
  console.log(`Created ${Object.keys(tps).length} translation projects`);
  return tps;
}

// ---------------------------------------------------------------------------
// 7. Project Members
// ---------------------------------------------------------------------------

async function seedProjectMembers(
  tps: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Project Members ---');

  for (const m of PROJECT_MEMBERS) {
    await prisma.projectMember.create({
      data: { translationProjectId: tps[m.tp], userId: users[m.user], role: m.role },
    });
  }
  console.log(`Created ${PROJECT_MEMBERS.length} project members`);
}

// ---------------------------------------------------------------------------
// 8. Documents
// ---------------------------------------------------------------------------

async function seedDocuments(projects: Record<string, string>) {
  console.log('\n--- Documents ---');

  const docs: Record<string, string> = {};
  for (const d of DOCUMENTS) {
    const result = await prisma.document.create({
      data: {
        slug: d.slug,
        title: d.title,
        type: d.type,
        labels: d.labels,
        deadline: d.deadline ?? null,
        originalFilename: d.originalFilename ?? null,
        sourceProjectId: projects[d.project],
      },
    });
    docs[d.key] = result.id;
  }
  console.log(`Created ${Object.keys(docs).length} documents`);
  return docs;
}

// ---------------------------------------------------------------------------
// 9. Document Versions
// ---------------------------------------------------------------------------

function getTranslationContent(docKey: string, langCode: string, status: DocumentStatus): string {
  if (status === DocumentStatus.PENDING_TRANSLATION) return '';

  const langContent = CONTENT_BY_LANGUAGE[langCode];
  if (langContent && langContent[docKey]) {
    if (status === DocumentStatus.IN_PROGRESS) {
      // Partial content: first half
      const lines = langContent[docKey].split('\n');
      return lines.slice(0, Math.ceil(lines.length / 2)).join('\n') + '\n\n<!-- TODO: finish translation -->';
    }
    return langContent[docKey];
  }

  // Fallback for languages without explicit content
  if (status === DocumentStatus.IN_PROGRESS) {
    return `<!-- Translation in progress for ${langCode} -->\n\n# ${docKey}\n\nPartial translation...`;
  }
  return `<!-- Translated content for ${langCode} -->\n\n${ENGLISH_CONTENT[docKey] || '# ' + docKey}`;
}

async function seedDocumentVersions(
  docs: Record<string, string>,
  langs: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Document Versions ---');

  // key format: "docKey:langCode"
  const versions: Record<string, string> = {};

  // English versions for all documents
  const docKeys = Object.keys(docs);
  for (const docKey of docKeys) {
    const content = ENGLISH_CONTENT[docKey] || `# ${docKey}\n\nSource content.`;
    const result = await prisma.documentVersion.create({
      data: {
        documentId: docs[docKey],
        languageId: langs.en,
        content,
        status: DocumentStatus.APPROVED,
        version: 4,
        userId: users.admin1,
        reviewerId: users.admin1,
      },
    });
    versions[`${docKey}:en`] = result.id;
  }
  console.log(`Created ${docKeys.length} English versions`);

  // Target language versions
  for (const v of TARGET_VERSIONS) {
    const content = getTranslationContent(v.docKey, v.langCode, v.status);
    const result = await prisma.documentVersion.create({
      data: {
        documentId: docs[v.docKey],
        languageId: langs[v.langCode],
        content,
        status: v.status,
        version: v.versionNum,
        userId: users[v.userKey],
        reviewerId: v.reviewerKey ? users[v.reviewerKey] : null,
      },
    });
    versions[`${v.docKey}:${v.langCode}`] = result.id;
  }
  console.log(`Created ${TARGET_VERSIONS.length} target versions`);

  return versions;
}

// ---------------------------------------------------------------------------
// 10. Document Assignments
// ---------------------------------------------------------------------------

async function seedDocumentAssignments(
  docs: Record<string, string>,
  tps: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Document Assignments ---');

  // Derive project key from doc key
  const docToProject: Record<string, string> = {};
  for (const key of Object.keys(docs)) {
    if (key.startsWith('ex-')) docToProject[key] = 'exodus';
    else if (key.startsWith('le-')) docToProject[key] = 'lent';
    else if (key.startsWith('ad-')) docToProject[key] = 'advent';
    else if (key.startsWith('re-')) docToProject[key] = 'retreat';
  }

  let count = 0;
  for (const a of DOCUMENT_ASSIGNMENTS) {
    const projKey = docToProject[a.docKey];
    const tpKey = `${projKey}:${a.langCode}`;
    if (!tps[tpKey]) continue;

    await prisma.documentAssignment.create({
      data: {
        documentId: docs[a.docKey],
        translationProjectId: tps[tpKey],
        userId: a.userKey ? users[a.userKey] : null,
        deadline: a.deadline ?? null,
        assignedById: users.admin1,
      },
    });
    count++;
  }
  console.log(`Created ${count} document assignments`);
}

// ---------------------------------------------------------------------------
// 11. Suggestions & Replies
// ---------------------------------------------------------------------------

async function seedSuggestions(
  versions: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Suggestions ---');

  for (const s of SUGGESTIONS) {
    const versionId = versions[s.versionKey];
    if (!versionId) {
      console.warn(`Skipping suggestion — version ${s.versionKey} not found`);
      continue;
    }

    const result = await prisma.suggestion.create({
      data: {
        documentVersionId: versionId,
        userId: users[s.userKey],
        type: s.type,
        status: s.status,
        comment: s.comment,
        proposedText: s.proposedText ?? null,
        originalText: s.originalText ?? null,
        dismissedReason: s.dismissedReason ?? null,
        startLine: s.startLine ?? null,
        endLine: s.endLine ?? null,
        startColumn: s.startColumn ?? null,
        endColumn: s.endColumn ?? null,
        version: s.version,
      },
    });

    if (s.replies) {
      for (const r of s.replies) {
        await prisma.suggestionReply.create({
          data: {
            suggestionId: result.id,
            userId: users[r.userKey],
            content: r.content,
          },
        });
      }
    }
  }
  console.log(`Created ${SUGGESTIONS.length} suggestions with replies`);
}

// ---------------------------------------------------------------------------
// 12. Activity Logs
// ---------------------------------------------------------------------------

async function seedActivityLogs(
  versions: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Activity Logs ---');

  const statusActions: Record<DocumentStatus, string[]> = {
    [DocumentStatus.PENDING_TRANSLATION]: ['created_translation'],
    [DocumentStatus.IN_PROGRESS]: ['created_translation', 'started_translation', 'edited'],
    [DocumentStatus.PENDING_REVIEW]: ['created_translation', 'started_translation', 'edited', 'submitted_for_review'],
    [DocumentStatus.APPROVED]: ['created_translation', 'started_translation', 'edited', 'submitted_for_review', 'approved'],
    [DocumentStatus.DEPLOYED]: ['created_translation', 'started_translation', 'edited', 'submitted_for_review', 'approved', 'deployed'],
  };

  let count = 0;

  for (const v of TARGET_VERSIONS) {
    const versionId = versions[`${v.docKey}:${v.langCode}`];
    if (!versionId) continue;

    const actions = statusActions[v.status];
    const baseDate = daysAgo(30 + Math.floor(Math.random() * 30));

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000); // 1 day apart

      let userId = users[v.userKey];
      if (action === 'approved') userId = v.reviewerKey ? users[v.reviewerKey] : users.admin1;
      if (action === 'deployed') userId = users.admin1;

      await prisma.activityLog.create({
        data: {
          documentVersionId: versionId,
          userId,
          action,
          details: { language: v.langCode },
          createdAt: actionDate,
        },
      });
      count++;
    }
  }
  console.log(`Created ${count} activity log entries`);
}

// ---------------------------------------------------------------------------
// 13. Comments
// ---------------------------------------------------------------------------

async function seedComments(
  versions: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Comments ---');

  for (const c of COMMENTS) {
    const versionId = versions[c.versionKey];
    if (!versionId) continue;

    await prisma.comment.create({
      data: {
        documentVersionId: versionId,
        userId: users[c.userKey],
        content: c.content,
      },
    });
  }
  console.log(`Created ${COMMENTS.length} comments`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Starting comprehensive database seeding...\n');

  await cleanup();
  const langs = await seedLanguages();
  await seedFolders();
  const users = await seedUsers(langs);
  const projects = await seedSourceProjects();
  const tps = await seedTranslationProjects(projects, langs);
  await seedProjectMembers(tps, users);
  const docs = await seedDocuments(projects);
  const versions = await seedDocumentVersions(docs, langs, users);
  await seedDocumentAssignments(docs, tps, users);
  await seedSuggestions(versions, users);
  await seedActivityLogs(versions, users);
  await seedComments(versions, users);

  console.log('\n=== Database seeding completed! ===\n');
  console.log('Login credentials:');
  console.log('  Admin:        admin@example.org / Hello123456');
  console.log('  Admin 2:      admin2@example.org / Hello123456');
  console.log('  Translator:   translator@example.org / Hello123456');
  console.log('  Translator 2: translator2@example.org / Hello123456');
  console.log('  Reviewer:     reviewer@example.org / Hello123456');
  console.log('  Banned:       banned@example.org / Hello123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
