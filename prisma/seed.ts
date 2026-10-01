import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { auth } from '@/lib/auth';
import {
  AudioProvider,
  DocumentStatus,
  GitHubPRStatus,
  InvitationStatus,
  PrismaClient,
  ProjectRole,
} from '../src/generated/prisma/client';

import { CONTENT_BY_LANGUAGE, ENGLISH_CONTENT } from './seed-data/content';
import {
  COMMENTS,
  DOCUMENT_ASSIGNMENTS,
  DOCUMENTS,
  FOLDERS,
  LANGUAGES,
  SOURCE_PROJECTS,
  SUGGESTIONS,
  TARGET_VERSIONS,
  USERS,
  INVITE_TOKENS,
  daysAgo,
  daysFromNow,
} from './seed-data/datasets';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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
    prisma.document.deleteMany(),
    prisma.translationProject.deleteMany(),
    prisma.sourceProject.deleteMany(),
    prisma.userLanguage.deleteMany(),
    prisma.folder.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.invitationLanguage.deleteMany(),
    prisma.invitation.deleteMany(),
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
      update: {
        name: lang.name,
        branchName: lang.branchName ?? null,
        translationInstructions: lang.translationInstructions ?? null,
        isSource: lang.isSource ?? false,
      },
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
    // Seeded people already have the name the profile form asks for, so the
    // onboarding gate would only stand between them and the app -- and the
    // first thing it offers is an edit to the name they already have.
    await prisma.user.update({ where: { id: result.user.id }, data: { onboarded: true } });
    console.log(`User ${u.name} (${u.email}) -> ${u.key}`);

    // UserLanguage records — the language assignment carries the project role
    for (const ul of u.languages) {
      await prisma.userLanguage.create({
        data: { userId: result.user.id, languageId: langs[ul.code], role: ul.role },
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
      data: {
        name: p.name,
        description: p.description,
        slug: p.slug,
        repositoryDirectory: p.repositoryDirectory,
        status: p.status,
      },
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
// 7. Documents
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
// 8. Document Versions
// ---------------------------------------------------------------------------

function getTranslationContent(docKey: string, langCode: string, status: DocumentStatus): string {
  if (status === DocumentStatus.PENDING_TRANSLATION) return '';

  const langContent = CONTENT_BY_LANGUAGE[langCode];
  if (langContent && langContent[docKey]) {
    // The markdown reference carries its own half-finished translation, written
    // with the lint violations it exists to demonstrate. Halving it would cut
    // them out, so it is the one document that keeps what the dataset says.
    if (status === DocumentStatus.IN_PROGRESS && docKey !== 'ex-md') {
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
// 9. Document Assignments
// ---------------------------------------------------------------------------

// Assignment lives on the version, so this sets the translator and deadline on
// the version for that language, creating it if the document has none yet.
async function seedDocumentAssignments(
  docs: Record<string, string>,
  langs: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Document Assignments ---');

  let count = 0;
  for (const a of DOCUMENT_ASSIGNMENTS) {
    const documentId = docs[a.docKey];
    const languageId = langs[a.langCode];
    if (!documentId || !languageId) continue;

    const assignedUserId = a.userKey ? users[a.userKey] : null;
    const assignment = {
      deadline: a.deadline ?? null,
      assignedById: users.admin1,
      assignedAt: new Date(),
    };

    // Don't overwrite a translator the seeded version already has — same rule
    // the consolidation migration applies.
    const existing = await prisma.documentVersion.findUnique({
      where: { documentId_languageId: { documentId, languageId } },
      select: { userId: true },
    });

    await prisma.documentVersion.upsert({
      where: { documentId_languageId: { documentId, languageId } },
      create: {
        documentId,
        languageId,
        content: '',
        status: DocumentStatus.PENDING_TRANSLATION,
        version: 1,
        userId: assignedUserId,
        ...assignment,
      },
      update: {
        ...assignment,
        ...(existing?.userId ? {} : { userId: assignedUserId }),
      },
    });
    count++;
  }
  console.log(`Assigned ${count} document versions`);
}

// ---------------------------------------------------------------------------
// 10. Suggestions & Replies
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
// 11. Activity Logs
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
// 12. Comments
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
// Language configuration scenarios
// ---------------------------------------------------------------------------

/**
 * Coverage for the language pages: each target language is deliberately broken
 * in a different way, so the health checks, the delete guard and the overview
 * all have something real to report.
 *
 *   cs  fully configured, deployed work, a PM
 *   sk  no AI instructions
 *   de  no voice
 *   hr  no branch, no PM, no voice, no instructions -- every check failing
 *   fr  configured but barely started
 *   pt  no projects at all, so it is the one language that can be deleted
 */
async function seedLanguageScenarios(langs: Record<string, string>, users: Record<string, string>) {
  console.log('\n--- Language scenarios ---');

  const voices: Record<string, string> = { cs: 'cs-CZ-AntoninNeural', sk: 'sk-SK-LukasNeural', fr: 'fr-FR-HenriNeural' };
  for (const [code, audioVoice] of Object.entries(voices)) {
    await prisma.language.update({
      where: { id: langs[code] },
      data: { audioProvider: AudioProvider.AZURE_SPEECH, audioVoice },
    });
  }

  // Slovak deploys and speaks, but nobody has written its AI instructions.
  await prisma.language.update({ where: { id: langs.sk }, data: { translationInstructions: null } });

  // A Project Manager who is not an administrator. Without one, the split the
  // instructions page rests on -- a PM writes, members read, and neither can
  // reach /languages -- cannot be exercised at all. German gets a second PM
  // with it, so it is also the one language where demoting one is harmless.
  await prisma.userLanguage.update({
    where: { userId_languageId: { userId: users.translator2, languageId: langs.de } },
    data: { role: ProjectRole.PROJECT_MANAGER },
  });

  // An empty language: a branch, no projects, no translations. The only one the
  // delete guard should let through.
  const portuguese = await prisma.language.upsert({
    where: { code: 'pt' },
    update: {},
    create: { code: 'pt', name: 'Portuguese', branchName: 'translations/pt' },
  });

  // A pending invitation scoped to it, so the delete dialog has a row to name.
  await prisma.invitation.create({
    data: {
      token: 'seed-invite-portuguese',
      createdById: users.admin1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      languages: { create: [{ languageId: portuguese.id }] },
    },
  });

  // Deploy history: a commit per deployed version, so "last deploy" has a real
  // timestamp rather than a status with no history behind it.
  const deployed = await prisma.documentVersion.findMany({
    where: { status: DocumentStatus.DEPLOYED },
    select: { id: true, languageId: true, document: { select: { slug: true } } },
  });
  const branchByLanguage = new Map(
    (await prisma.language.findMany({ select: { id: true, code: true, branchName: true } })).map((l) => [
      l.id,
      l.branchName ?? `translations/${l.code}`,
    ]),
  );
  let day = 0;
  for (const version of deployed) {
    await prisma.gitHubCommit.create({
      data: {
        documentVersionId: version.id,
        commitSha: `seed${version.id.slice(0, 7)}`,
        branchName: branchByLanguage.get(version.languageId) ?? 'translations/unknown',
        filePath: `translations/${version.document.slug}.md`,
        prNumber: 100 + day,
        prStatus: GitHubPRStatus.MERGED,
        // Spread backwards so the newest is a few days old, not all identical.
        createdAt: new Date(Date.now() - (day += 2) * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`Voices for ${Object.keys(voices).length} languages, Portuguese as an empty language, ${deployed.length} deploy commits`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * A ready-made invitation, so the registration flow can be exercised without
 * an admin first creating one by hand. The token is fixed rather than random
 * for the same reason the passwords are: a fixture you can type.
 */
async function seedInvitations(users: Record<string, string>, langs: Record<string, string>) {
  console.log('\n--- Invitations ---');

  const base = { createdById: users.admin1, languages: { create: [{ languageId: langs.sk }] } };

  // The one that works. Unlimited, because a test run that consumed it would
  // leave the next run without a way in.
  await prisma.invitation.create({
    data: { ...base, token: INVITE_TOKENS.valid, maxUses: null, expiresAt: daysFromNow(365) },
  });

  // Revoked while still in date and with uses left, so only the status can be
  // what refuses it.
  await prisma.invitation.create({
    data: {
      ...base,
      token: INVITE_TOKENS.revoked,
      maxUses: null,
      expiresAt: daysFromNow(365),
      status: InvitationStatus.REVOKED,
    },
  });

  // Out of date, still ACTIVE and unused, so only the date can refuse it.
  await prisma.invitation.create({
    data: { ...base, token: INVITE_TOKENS.expired, maxUses: null, expiresAt: daysAgo(1) },
  });

  // Spent: one use allowed and one taken, still ACTIVE and in date.
  await prisma.invitation.create({
    data: {
      ...base,
      token: INVITE_TOKENS.exhausted,
      maxUses: 1,
      usedCount: 1,
      expiresAt: daysFromNow(365),
    },
  });

  console.log(`Invitations: valid, revoked, expired, exhausted (Slovak)`);
}

async function main() {
  console.log('Starting comprehensive database seeding...\n');

  await cleanup();
  const langs = await seedLanguages();
  await seedFolders();
  const users = await seedUsers(langs);
  const projects = await seedSourceProjects();
  await seedTranslationProjects(projects, langs);
  const docs = await seedDocuments(projects);
  const versions = await seedDocumentVersions(docs, langs, users);
  await seedDocumentAssignments(docs, langs, users);
  await seedSuggestions(versions, users);
  await seedActivityLogs(versions, users);
  await seedComments(versions, users);
  await seedLanguageScenarios(langs, users);
  await seedInvitations(users, langs);

  console.log('\n=== Database seeding completed! ===\n');
  console.log('Login credentials:');
  console.log('  Admin:        admin@example.org / Hello123456');
  console.log('  Admin 2:      admin2@example.org / Hello123456');
  console.log('  Translator:   translator@example.org / Hello123456');
  console.log('  Translator 2: translator2@example.org / Hello123456');
  console.log('  Reviewer:     reviewer@example.org / Hello123456');
  console.log('  Banned:       banned@example.org / Hello123456');
  console.log(`\nOpen invitation: /register/${INVITE_TOKENS.valid}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
