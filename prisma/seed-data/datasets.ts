import {
  DocumentStatus,
  DocumentType,
  ProjectRole,
  Role,
  SourceProjectStatus,
  SuggestionStatus,
  SuggestionType,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers used by both datasets and seed.ts
// ---------------------------------------------------------------------------

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  {
    code: 'cs',
    name: 'Czech',
    branchName: 'translations/cs',
    translationInstructions:
      'Use formal Czech (vykani). Maintain paragraph structure and Markdown formatting. Keep Scripture references in the standard CEP format.',
  },
  {
    code: 'sk',
    name: 'Slovak',
    branchName: 'translations/sk',
    translationInstructions:
      'Use formal Slovak. Follow existing terminology from the glossary. Preserve all Markdown formatting.',
  },
  { code: 'hr', name: 'Croatian' },
  {
    code: 'de',
    name: 'German',
    branchName: 'translations/de',
    translationInstructions:
      'Use formal German (Sie-Form). Keep theological terms consistent with previous translations. Preserve Markdown formatting.',
  },
  {
    code: 'fr',
    name: 'French',
    translationInstructions:
      'Use formal French (vouvoiement). Preserve Markdown formatting and paragraph structure.',
  },
];

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const FOLDERS = ['Exodus90 - 2026', 'Advent 2025'];

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const USERS = [
  { key: 'admin1', email: 'admin@example.org', name: 'Fr. Thomas More', role: Role.ADMIN, langCodes: ['en', 'cs', 'sk'] },
  { key: 'admin2', email: 'admin2@example.org', name: 'Sarah Mitchell', role: Role.ADMIN, langCodes: ['en', 'de', 'fr'] },
  { key: 'translator1', email: 'translator@example.org', name: 'Jan Novak', role: Role.USER, langCodes: ['cs', 'sk'] },
  { key: 'translator2', email: 'translator2@example.org', name: 'Maria Schmidt', role: Role.USER, langCodes: ['de'] },
  { key: 'reviewer1', email: 'reviewer@example.org', name: 'Ivan Horvat', role: Role.USER, langCodes: ['hr', 'sk'] },
  { key: 'banned1', email: 'banned@example.org', name: 'Peter Zilka', role: Role.USER, langCodes: ['cs'] },
];

// ---------------------------------------------------------------------------
// Source Projects
// ---------------------------------------------------------------------------

export const SOURCE_PROJECTS = [
  {
    key: 'exodus',
    name: 'Exodus90 2026',
    description: '90-day spiritual exercise program for men. Daily reflections, prayers, and ascetic practices.',
    identifier: 'exodus90',
    status: SourceProjectStatus.ACTIVE,
  },
  {
    key: 'lent',
    name: 'Lent 2026',
    description: 'Lenten devotional series with daily Scripture readings and meditations for the liturgical season.',
    identifier: 'lent2026',
    status: SourceProjectStatus.ACTIVE,
  },
  {
    key: 'advent',
    name: 'Advent 2025',
    description: 'Advent preparation program with weekly themes and daily content leading to Christmas.',
    identifier: 'advent2025',
    status: SourceProjectStatus.ACTIVE,
  },
  {
    key: 'easter',
    name: 'Easter 2026',
    description: 'Weekly meeting guides for the Easter season — group reflection on Sunday readings.',
    identifier: 'easter2026',
    status: SourceProjectStatus.ACTIVE,
  },
  {
    key: 'retreat',
    name: 'Summer Retreat 2025',
    description: 'Weekend retreat materials including talks and small group guides.',
    identifier: 'summer2025',
    status: SourceProjectStatus.COMPLETE,
  },
];

// ---------------------------------------------------------------------------
// Project Members
// ---------------------------------------------------------------------------

export const PROJECT_MEMBERS: { tp: string; user: string; role: ProjectRole }[] = [
  // Exodus90 Czech
  { tp: 'exodus:cs', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'exodus:cs', user: 'translator1', role: ProjectRole.TRANSLATOR },
  { tp: 'exodus:cs', user: 'translator1', role: ProjectRole.EDITOR },
  { tp: 'exodus:cs', user: 'reviewer1', role: ProjectRole.REVIEWER },
  // Exodus90 Slovak
  { tp: 'exodus:sk', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'exodus:sk', user: 'translator1', role: ProjectRole.TRANSLATOR },
  { tp: 'exodus:sk', user: 'reviewer1', role: ProjectRole.REVIEWER },
  // Exodus90 Croatian
  { tp: 'exodus:hr', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'exodus:hr', user: 'reviewer1', role: ProjectRole.TRANSLATOR },
  { tp: 'exodus:hr', user: 'reviewer1', role: ProjectRole.REVIEWER },
  // Exodus90 German
  { tp: 'exodus:de', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'exodus:de', user: 'translator2', role: ProjectRole.TRANSLATOR },
  // Exodus90 French
  { tp: 'exodus:fr', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  // Lent Czech
  { tp: 'lent:cs', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'lent:cs', user: 'translator1', role: ProjectRole.TRANSLATOR },
  // Lent Slovak
  { tp: 'lent:sk', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'lent:sk', user: 'reviewer1', role: ProjectRole.REVIEWER },
  // Lent German
  { tp: 'lent:de', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'lent:de', user: 'translator2', role: ProjectRole.TRANSLATOR },
  // Lent remaining
  { tp: 'lent:hr', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'lent:fr', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  // Advent
  { tp: 'advent:cs', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'easter:cs', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'easter:cs', user: 'translator1', role: ProjectRole.TRANSLATOR },
  { tp: 'advent:cs', user: 'translator1', role: ProjectRole.TRANSLATOR },
  { tp: 'advent:sk', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'advent:sk', user: 'reviewer1', role: ProjectRole.TRANSLATOR },
  { tp: 'advent:hr', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'advent:de', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'advent:fr', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  // Retreat
  { tp: 'retreat:cs', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'retreat:cs', user: 'translator1', role: ProjectRole.TRANSLATOR },
  { tp: 'retreat:sk', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'retreat:sk', user: 'reviewer1', role: ProjectRole.TRANSLATOR },
  { tp: 'retreat:hr', user: 'admin1', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'retreat:hr', user: 'reviewer1', role: ProjectRole.TRANSLATOR },
  { tp: 'retreat:de', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
  { tp: 'retreat:fr', user: 'admin2', role: ProjectRole.PROJECT_MANAGER },
];

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const DOCUMENTS: {
  key: string;
  slug: string;
  title: string;
  type?: DocumentType;
  labels: string[];
  deadline?: Date;
  originalFilename?: string;
  project: string;
}[] = [
  // Exodus90
  { key: 'ex-d1', slug: 'ex90-day-1', title: 'Day 1 - The Call', type: DocumentType.DAY, labels: ['week-1', 'introduction'], deadline: daysFromNow(17), originalFilename: '1.md', project: 'exodus' },
  { key: 'ex-d2', slug: 'ex90-day-2', title: 'Day 2 - Discipline of Prayer', type: DocumentType.DAY, labels: ['week-1'], deadline: daysFromNow(18), originalFilename: '2.md', project: 'exodus' },
  { key: 'ex-d3', slug: 'ex90-day-3', title: 'Day 3 - Fasting and Freedom', type: DocumentType.DAY, labels: ['week-1'], deadline: daysFromNow(19), originalFilename: '3.md', project: 'exodus' },
  { key: 'ex-d14', slug: 'ex90-day-14', title: 'Day 14 - The Desert', type: DocumentType.DAY, labels: ['week-2'], deadline: daysFromNow(30), originalFilename: '14.md', project: 'exodus' },
  { key: 'ex-d45', slug: 'ex90-day-45', title: 'Day 45 - Midpoint Reflection', type: DocumentType.DAY, labels: ['week-7', 'milestone'], deadline: daysFromNow(61), originalFilename: '45.md', project: 'exodus' },
  { key: 'ex-fg', slug: 'ex90-field-guide', title: 'Field Guide: Prayer Methods', type: DocumentType.FIELD_GUIDE, labels: ['reference'], project: 'exodus', originalFilename: 'field-guide-prayer.md' },
  { key: 'ex-dc', slug: 'ex90-weekly-checkin', title: 'Weekly Check-in Template', type: DocumentType.DAILY_CONTENT, labels: ['template'], project: 'exodus' },
  // Lent
  { key: 'le-aw', slug: 'lent-ash-wednesday', title: 'Ash Wednesday Reflection', type: DocumentType.DAY, labels: ['week-1', 'special'], deadline: daysFromNow(10), project: 'lent' },
  { key: 'le-d5', slug: 'lent-day-5', title: 'Friday of the First Week', type: DocumentType.DAY, labels: ['week-1'], deadline: daysFromNow(15), originalFilename: '5.md', project: 'lent' },
  { key: 'le-d20', slug: 'lent-day-20', title: 'Third Sunday of Lent', type: DocumentType.DAY, labels: ['week-3', 'sunday'], deadline: daysFromNow(36), originalFilename: '20.md', project: 'lent' },
  { key: 'le-ps', slug: 'lent-palm-sunday', title: 'Palm Sunday Meditation', type: DocumentType.DAY, labels: ['holy-week', 'special'], deadline: daysFromNow(50), project: 'lent' },
  { key: 'le-fg', slug: 'lent-stations-guide', title: 'Guide: Stations of the Cross', type: DocumentType.FIELD_GUIDE, labels: ['reference', 'devotion'], originalFilename: 'stations.md', project: 'lent' },
  // Advent
  { key: 'ad-w1', slug: 'advent-week-1', title: 'First Week: Hope', type: DocumentType.DAY, labels: ['week-1'], project: 'advent' },
  { key: 'ad-w2', slug: 'advent-week-2', title: 'Second Week: Peace', type: DocumentType.DAY, labels: ['week-2'], project: 'advent' },
  { key: 'ad-fg', slug: 'advent-wreath-guide', title: 'Advent Wreath Guide', type: DocumentType.FIELD_GUIDE, labels: ['reference', 'family'], project: 'advent' },
  // Easter
  { key: 'ea-m1', slug: 'easter-week-6-meeting', title: 'Easter Week 6 Meeting', type: DocumentType.MEETING, labels: ['week-6', 'easter'], originalFilename: '1-7.md', project: 'easter' },
  // Summer Retreat
  { key: 're-t1', slug: 'retreat-opening-talk', title: 'Opening Talk: Finding Silence', type: DocumentType.DAILY_CONTENT, labels: ['talk', 'day-1'], project: 'retreat' },
];

// ---------------------------------------------------------------------------
// Document Versions (target languages)
// ---------------------------------------------------------------------------

type VersionDef = {
  docKey: string;
  langCode: string;
  status: DocumentStatus;
  userKey: string;
  reviewerKey?: string;
  versionNum: number;
};

export const TARGET_VERSIONS: VersionDef[] = [
  // Exodus90 — Czech (translator1)
  { docKey: 'ex-d1', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 'ex-d2', langCode: 'cs', status: DocumentStatus.APPROVED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 4 },
  { docKey: 'ex-d3', langCode: 'cs', status: DocumentStatus.PENDING_REVIEW, userKey: 'translator1', reviewerKey: 'reviewer1', versionNum: 3 },
  { docKey: 'ex-d14', langCode: 'cs', status: DocumentStatus.IN_PROGRESS, userKey: 'translator1', versionNum: 2 },
  { docKey: 'ex-d45', langCode: 'cs', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin1', versionNum: 1 },
  { docKey: 'ex-fg', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 'ex-dc', langCode: 'cs', status: DocumentStatus.APPROVED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 4 },

  // Exodus90 — Slovak
  { docKey: 'ex-d1', langCode: 'sk', status: DocumentStatus.APPROVED, userKey: 'translator1', reviewerKey: 'reviewer1', versionNum: 4 },
  { docKey: 'ex-d2', langCode: 'sk', status: DocumentStatus.PENDING_REVIEW, userKey: 'translator1', reviewerKey: 'reviewer1', versionNum: 3 },
  { docKey: 'ex-d3', langCode: 'sk', status: DocumentStatus.IN_PROGRESS, userKey: 'translator1', versionNum: 2 },
  { docKey: 'ex-d14', langCode: 'sk', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin1', versionNum: 1 },
  { docKey: 'ex-fg', langCode: 'sk', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },

  // Exodus90 — Croatian
  { docKey: 'ex-d1', langCode: 'hr', status: DocumentStatus.PENDING_REVIEW, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 3 },
  { docKey: 'ex-d2', langCode: 'hr', status: DocumentStatus.IN_PROGRESS, userKey: 'reviewer1', versionNum: 2 },
  { docKey: 'ex-d3', langCode: 'hr', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin1', versionNum: 1 },
  { docKey: 'ex-fg', langCode: 'hr', status: DocumentStatus.APPROVED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 4 },

  // Exodus90 — German
  { docKey: 'ex-d1', langCode: 'de', status: DocumentStatus.IN_PROGRESS, userKey: 'translator2', versionNum: 2 },
  { docKey: 'ex-d2', langCode: 'de', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin2', versionNum: 1 },

  // Exodus90 — French
  { docKey: 'ex-d1', langCode: 'fr', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin2', versionNum: 1 },

  // Lent — Czech
  { docKey: 'le-aw', langCode: 'cs', status: DocumentStatus.APPROVED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 4 },
  { docKey: 'le-d5', langCode: 'cs', status: DocumentStatus.IN_PROGRESS, userKey: 'translator1', versionNum: 2 },
  { docKey: 'le-d20', langCode: 'cs', status: DocumentStatus.PENDING_REVIEW, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 3 },
  { docKey: 'le-ps', langCode: 'cs', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin1', versionNum: 1 },
  { docKey: 'le-fg', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },

  // Lent — Slovak
  { docKey: 'le-aw', langCode: 'sk', status: DocumentStatus.IN_PROGRESS, userKey: 'reviewer1', versionNum: 2 },
  { docKey: 'le-d5', langCode: 'sk', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin1', versionNum: 1 },
  { docKey: 'le-fg', langCode: 'sk', status: DocumentStatus.APPROVED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 4 },

  // Lent — German
  { docKey: 'le-aw', langCode: 'de', status: DocumentStatus.PENDING_REVIEW, userKey: 'translator2', reviewerKey: 'admin2', versionNum: 3 },

  // Advent — Czech (all DEPLOYED)
  { docKey: 'ad-w1', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 'ad-w2', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 'ad-fg', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },

  // Advent — Slovak (DEPLOYED for week 1&2)
  { docKey: 'ad-w1', langCode: 'sk', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 'ad-w2', langCode: 'sk', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },

  // Easter
  { docKey: 'ea-m1', langCode: 'cs', status: DocumentStatus.PENDING_TRANSLATION, userKey: 'admin1', versionNum: 1 },

  // Summer Retreat (all DEPLOYED)
  { docKey: 're-t1', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 're-t1', langCode: 'sk', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 're-t1', langCode: 'hr', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },
];

// ---------------------------------------------------------------------------
// Document Assignments
// ---------------------------------------------------------------------------

export const DOCUMENT_ASSIGNMENTS: { docKey: string; langCode: string; userKey: string | null; deadline?: Date }[] = [
  // Exodus Czech
  { docKey: 'ex-d1', langCode: 'cs', userKey: 'translator1', deadline: daysFromNow(17) },
  { docKey: 'ex-d2', langCode: 'cs', userKey: 'translator1', deadline: daysFromNow(18) },
  { docKey: 'ex-d3', langCode: 'cs', userKey: 'translator1', deadline: daysFromNow(19) },
  { docKey: 'ex-d14', langCode: 'cs', userKey: 'translator1', deadline: daysFromNow(30) },
  { docKey: 'ex-d45', langCode: 'cs', userKey: null, deadline: daysFromNow(61) },
  { docKey: 'ex-fg', langCode: 'cs', userKey: 'translator1' },
  { docKey: 'ex-dc', langCode: 'cs', userKey: 'translator1' },
  // Exodus Slovak
  { docKey: 'ex-d1', langCode: 'sk', userKey: 'translator1', deadline: daysFromNow(17) },
  { docKey: 'ex-d2', langCode: 'sk', userKey: 'translator1', deadline: daysFromNow(18) },
  { docKey: 'ex-d3', langCode: 'sk', userKey: null, deadline: daysFromNow(19) },
  { docKey: 'ex-d14', langCode: 'sk', userKey: null },
  { docKey: 'ex-fg', langCode: 'sk', userKey: 'reviewer1' },
  // Exodus Croatian
  { docKey: 'ex-d1', langCode: 'hr', userKey: 'reviewer1', deadline: daysFromNow(17) },
  { docKey: 'ex-d2', langCode: 'hr', userKey: 'reviewer1' },
  { docKey: 'ex-d3', langCode: 'hr', userKey: null },
  { docKey: 'ex-fg', langCode: 'hr', userKey: 'reviewer1' },
  // Exodus German
  { docKey: 'ex-d1', langCode: 'de', userKey: 'translator2', deadline: daysFromNow(17) },
  { docKey: 'ex-d2', langCode: 'de', userKey: null, deadline: daysFromNow(18) },
  // Exodus French
  { docKey: 'ex-d1', langCode: 'fr', userKey: null },
  // Lent Czech
  { docKey: 'le-aw', langCode: 'cs', userKey: 'translator1', deadline: daysFromNow(10) },
  { docKey: 'le-d5', langCode: 'cs', userKey: 'translator1', deadline: daysFromNow(15) },
  { docKey: 'le-d20', langCode: 'cs', userKey: 'translator1' },
  { docKey: 'le-ps', langCode: 'cs', userKey: null, deadline: daysFromNow(50) },
  { docKey: 'le-fg', langCode: 'cs', userKey: 'translator1' },
  // Lent Slovak
  { docKey: 'le-aw', langCode: 'sk', userKey: 'reviewer1' },
  { docKey: 'le-d5', langCode: 'sk', userKey: null },
  { docKey: 'le-fg', langCode: 'sk', userKey: 'reviewer1' },
  // Lent German
  { docKey: 'le-aw', langCode: 'de', userKey: 'translator2' },
  // Easter
  { docKey: 'ea-m1', langCode: 'cs', userKey: 'translator1' },
];

// ---------------------------------------------------------------------------
// Suggestions & Replies
// ---------------------------------------------------------------------------

type SuggestionDef = {
  versionKey: string;
  userKey: string;
  type: SuggestionType;
  status: SuggestionStatus;
  comment: string;
  proposedText?: string;
  originalText?: string;
  dismissedReason?: string;
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  version: number;
  replies?: { userKey: string; content: string }[];
};

export const SUGGESTIONS: SuggestionDef[] = [
  // ex-d1 Czech (DEPLOYED) — only APPLIED/DISMISSED
  {
    versionKey: 'ex-d1:cs', userKey: 'admin1', type: SuggestionType.CHANGE, status: SuggestionStatus.APPLIED,
    comment: 'Better word choice for "call" — "povolani" is more theologically precise.',
    proposedText: 'povolani', originalText: 'volani',
    startLine: 3, endLine: 3, startColumn: 1, endColumn: 20, version: 5,
    replies: [{ userKey: 'translator1', content: 'Good catch, updated.' }],
  },
  {
    versionKey: 'ex-d1:cs', userKey: 'reviewer1', type: SuggestionType.COMMENT, status: SuggestionStatus.APPLIED,
    comment: 'The tone here matches the original perfectly. Well done.',
    startLine: 7, endLine: 7, startColumn: 1, endColumn: 50, version: 5,
  },

  // ex-d2 Czech (APPROVED) — only APPLIED/DISMISSED
  {
    versionKey: 'ex-d2:cs', userKey: 'admin1', type: SuggestionType.CHANGE, status: SuggestionStatus.APPLIED,
    comment: 'This phrase should use formal register.',
    proposedText: 'Prosime Vas', originalText: 'Prosim te',
    startLine: 5, endLine: 5, startColumn: 1, endColumn: 30, version: 4,
    replies: [
      { userKey: 'translator1', content: 'Agreed, changed to formal register.' },
      { userKey: 'admin1', content: 'Looks good now.' },
    ],
  },
  {
    versionKey: 'ex-d2:cs', userKey: 'reviewer1', type: SuggestionType.COMMENT, status: SuggestionStatus.DISMISSED,
    comment: 'Consider adding a footnote explaining the Czech liturgical tradition here.',
    version: 4,
    dismissedReason: 'Not needed — the context is clear without a footnote.',
    replies: [
      { userKey: 'translator1', content: 'I don\'t think a footnote is necessary here. The meaning is clear.' },
      { userKey: 'reviewer1', content: 'Fair point, the context speaks for itself.' },
    ],
  },

  // ex-d3 Czech (PENDING_REVIEW) — can have OPEN
  {
    versionKey: 'ex-d3:cs', userKey: 'reviewer1', type: SuggestionType.CHANGE, status: SuggestionStatus.OPEN,
    comment: 'Incorrect translation of "fasting" — "posteni" is the standard theological term.',
    proposedText: 'posteni',
    startLine: 4, endLine: 4, startColumn: 1, endColumn: 25, version: 3,
    replies: [
      { userKey: 'translator1', content: 'I used "pust" intentionally — it has a broader meaning.' },
      { userKey: 'reviewer1', content: 'The standard theological term is "posteni" though. Check the language instructions.' },
      { userKey: 'translator1', content: 'Let me check the glossary and get back to you.' },
    ],
  },
  {
    versionKey: 'ex-d3:cs', userKey: 'reviewer1', type: SuggestionType.COMMENT, status: SuggestionStatus.OPEN,
    comment: 'The Scripture reference formatting is inconsistent with other days. Should follow CEP format.',
    startLine: 10, endLine: 12, startColumn: 1, endColumn: 30, version: 3,
  },
  {
    versionKey: 'ex-d3:cs', userKey: 'admin1', type: SuggestionType.CHANGE, status: SuggestionStatus.APPLIED,
    comment: 'Typo fix.',
    proposedText: 'svoboda', originalText: 'sbovoda',
    startLine: 8, endLine: 8, startColumn: 1, endColumn: 15, version: 3,
    replies: [{ userKey: 'translator1', content: 'Thanks, fixed!' }],
  },

  // ex-d1 Slovak (APPROVED) — only APPLIED
  {
    versionKey: 'ex-d1:sk', userKey: 'reviewer1', type: SuggestionType.CHANGE, status: SuggestionStatus.APPLIED,
    comment: 'Better Slovak term for this theological concept.',
    proposedText: 'povolanie', originalText: 'volanie',
    startLine: 3, endLine: 3, startColumn: 1, endColumn: 20, version: 4,
  },

  // ex-d1 Croatian (PENDING_REVIEW) — can have OPEN
  {
    versionKey: 'ex-d1:hr', userKey: 'admin1', type: SuggestionType.CHANGE, status: SuggestionStatus.OPEN,
    comment: 'This Croatian word is archaic. Use the modern equivalent "poziv" instead.',
    proposedText: 'poziv',
    startLine: 3, endLine: 3, startColumn: 1, endColumn: 20, version: 3,
    replies: [{ userKey: 'reviewer1', content: 'Agreed, "poziv" is more widely understood.' }],
  },
  {
    versionKey: 'ex-d1:hr', userKey: 'admin1', type: SuggestionType.COMMENT, status: SuggestionStatus.OPEN,
    comment: 'Check if this paragraph matches the updated English source — the original was revised last week.',
    version: 3,
  },

  // le-d20 Czech (PENDING_REVIEW) — can have OPEN
  {
    versionKey: 'le-d20:cs', userKey: 'admin1', type: SuggestionType.CHANGE, status: SuggestionStatus.OPEN,
    comment: 'Liturgical term should follow the Czech Bishops\' Conference standard.',
    proposedText: 'Nedele postni',
    startLine: 2, endLine: 2, startColumn: 1, endColumn: 20, version: 3,
    replies: [
      { userKey: 'translator1', content: 'Where can I find the bishops\' conference standard?' },
      { userKey: 'admin1', content: 'Check the language instructions — I\'ll add the reference link.' },
    ],
  },

  // le-aw German (PENDING_REVIEW) — can have OPEN
  {
    versionKey: 'le-aw:de', userKey: 'admin2', type: SuggestionType.COMMENT, status: SuggestionStatus.OPEN,
    comment: 'Consider adding the German liturgical calendar reference (Schott) for this passage.',
    version: 3,
  },
];

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const COMMENTS: { versionKey: string; userKey: string; content: string }[] = [
  { versionKey: 'ex-d1:cs', userKey: 'admin1', content: 'Excellent translation. Ready for deployment.' },
  { versionKey: 'ex-d2:cs', userKey: 'reviewer1', content: 'Minor changes needed in the opening paragraph. See my suggestions above.' },
  { versionKey: 'ex-d2:cs', userKey: 'translator1', content: 'All suggestions addressed. Ready for another look.' },
  { versionKey: 'ex-d3:cs', userKey: 'reviewer1', content: 'Still reviewing — will finish by end of day.' },
  { versionKey: 'le-aw:cs', userKey: 'admin1', content: 'Beautiful translation of the Ash Wednesday liturgy.' },
  { versionKey: 'ex-d1:hr', userKey: 'admin1', content: 'A few terminology issues to discuss. See inline suggestions.' },
  { versionKey: 'le-d20:cs', userKey: 'translator1', content: 'I have some questions about the liturgical terminology — see the suggestion thread.' },
  { versionKey: 'ex-d1:sk', userKey: 'reviewer1', content: 'Good work on the Slovak translation. One term updated.' },
];
