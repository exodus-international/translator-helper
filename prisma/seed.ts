import { auth } from '@/lib/auth';
import {
  DocumentStatus,
  DocumentType,
  PrismaClient,
  ProjectRole,
  Role,
  SourceProjectStatus,
  SuggestionStatus,
  SuggestionType,
} from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

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
  const data = [
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

  const langs: Record<string, string> = {};
  for (const lang of data) {
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
  for (const name of ['Exodus90 - 2026', 'Advent 2025']) {
    await prisma.folder.upsert({ where: { name }, update: {}, create: { name } });
    console.log(`Folder ${name}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Users
// ---------------------------------------------------------------------------

async function seedUsers(langs: Record<string, string>) {
  console.log('\n--- Users ---');

  const usersData = [
    { key: 'admin1', email: 'admin@example.org', name: 'Fr. Thomas More', role: Role.ADMIN, langCodes: ['en', 'cs', 'sk'] },
    { key: 'admin2', email: 'deploy@example.org', name: 'Sarah Mitchell', role: Role.ADMIN, langCodes: ['en', 'de', 'fr'] },
    { key: 'translator1', email: 'jan.novak@example.org', name: 'Jan Novak', role: Role.USER, langCodes: ['cs', 'sk'] },
    { key: 'translator2', email: 'maria.schmidt@example.org', name: 'Maria Schmidt', role: Role.USER, langCodes: ['de'] },
    { key: 'reviewer1', email: 'ivan.horvat@example.org', name: 'Ivan Horvat', role: Role.USER, langCodes: ['hr', 'sk'] },
    { key: 'banned1', email: 'peter.zilka@example.org', name: 'Peter Zilka', role: Role.USER, langCodes: ['cs'] },
  ];

  const users: Record<string, string> = {};

  for (const u of usersData) {
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

  const data = [
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
      key: 'retreat',
      name: 'Summer Retreat 2025',
      description: 'Weekend retreat materials including talks and small group guides.',
      identifier: 'summer2025',
      status: SourceProjectStatus.COMPLETE,
    },
  ];

  const projects: Record<string, string> = {};
  for (const p of data) {
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

  const members: { tp: string; user: string; role: ProjectRole }[] = [
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

  for (const m of members) {
    await prisma.projectMember.create({
      data: { translationProjectId: tps[m.tp], userId: users[m.user], role: m.role },
    });
  }
  console.log(`Created ${members.length} project members`);
}

// ---------------------------------------------------------------------------
// 8. Documents
// ---------------------------------------------------------------------------

async function seedDocuments(projects: Record<string, string>) {
  console.log('\n--- Documents ---');

  const docsData: {
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
    // Summer Retreat
    { key: 're-t1', slug: 'retreat-opening-talk', title: 'Opening Talk: Finding Silence', type: DocumentType.DAILY_CONTENT, labels: ['talk', 'day-1'], project: 'retreat' },
  ];

  const docs: Record<string, string> = {};
  for (const d of docsData) {
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
// 9. English Content
// ---------------------------------------------------------------------------

const ENGLISH_CONTENT: Record<string, string> = {
  'ex-d1': `# Day 1 - The Call

> "Come, follow me," Jesus said, "and I will send you out to fish for people." — Matthew 4:19

## Morning Reflection

Today marks the beginning of your 90-day journey. Like the apostles who left their nets behind, you are being called to something greater. This is not merely an exercise in self-denial — it is an invitation to encounter the living God.

### Three Pillars for Today

1. **Prayer**: Spend 20 minutes in silent prayer this morning. Find a quiet place and simply be present to God.
2. **Asceticism**: Begin your fast from alcohol and sweets. Remember, this sacrifice creates space for grace.
3. **Fraternity**: Reach out to your accountability partner. Share your intentions for these 90 days.

## Scripture for Meditation

> The Lord is my shepherd; I shall not want.
> He makes me lie down in green pastures.
> He leads me beside still waters.
> He restores my soul.
> — Psalm 23:1-3

## Evening Examination

Before bed tonight, review your day:
- Did I fulfill my prayer commitment?
- Where did I experience God's presence?
- What challenges did I face, and how did I respond?

*Remember: this journey is not about perfection. It is about faithfulness.*`,

  'ex-d2': `# Day 2 - Discipline of Prayer

> "But when you pray, go into your room, close the door and pray to your Father, who is unseen." — Matthew 6:6

## Morning Reflection

Prayer is the foundation of the spiritual life. Without it, all other disciplines lose their meaning. Today we focus on establishing a rhythm of prayer that will sustain you through the coming weeks.

### The Practice

Set aside **20 minutes** for mental prayer. Use the following structure:

1. **Preparation** (2 min): Place yourself in God's presence. Make the Sign of the Cross.
2. **Reading** (3 min): Read today's Scripture passage slowly, twice.
3. **Meditation** (10 min): Reflect on what strikes you. Speak to God about it.
4. **Resolution** (5 min): Choose one concrete action for today based on your prayer.

## Scripture for Meditation

> Be still, and know that I am God.
> I will be exalted among the nations,
> I will be exalted in the earth!
> — Psalm 46:10

## Evening Examination

- How did my prayer time go today?
- Was I distracted? That is normal — gently return to God each time.
- What resolution did I make, and did I follow through?`,

  'ex-d3': `# Day 3 - Fasting and Freedom

> "Is not this the kind of fasting I have chosen: to loose the chains of injustice?" — Isaiah 58:6

## Morning Reflection

Fasting is not punishment — it is liberation. When we deny ourselves comfort, we discover that our deepest hunger is not for food or drink, but for God. Today we explore how asceticism frees us from disordered attachments.

### Why We Fast

The desert fathers understood that **fasting sharpens the mind** and opens the heart. Consider these three dimensions:

- **Physical**: Your body learns to say "no" to immediate gratification
- **Spiritual**: Each pang of hunger becomes a prayer, redirecting your desire toward God
- **Communal**: Your sacrifice unites you with those who hunger involuntarily

## Today's Practice

Continue your fast from alcohol and sweets. Additionally, consider:

1. Eating only two full meals today
2. Drinking only water, coffee, or tea (no sugary drinks)
3. Offering each moment of discomfort as a prayer for your brothers

## Scripture for Meditation

> Man shall not live on bread alone, but on every word that comes from the mouth of God.
> — Matthew 4:4

*The freedom you seek is found not in having more, but in needing less.*`,

  'ex-d14': `# Day 14 - The Desert

> "The Spirit immediately drove him out into the wilderness." — Mark 1:12

## Morning Reflection

Two weeks in. The initial enthusiasm may be fading. This is exactly where God wants you — in the desert, where distractions fall away and you are left face to face with yourself and with Him.

### Embrace the Dryness

Do not be alarmed if prayer feels dry or difficult. The desert fathers called this *acedia* — spiritual listlessness. It is a sign that you are moving deeper, beyond the surface of emotional consolation into the substance of faith.

## Scripture for Meditation

> Even though I walk through the valley of the shadow of death,
> I will fear no evil, for you are with me;
> your rod and your staff, they comfort me.
> — Psalm 23:4

## Evening Examination

- Am I tempted to quit? Name the temptation honestly.
- Where did I find unexpected strength today?
- Have I reached out to my brothers this week?`,

  'ex-d45': `# Day 45 - Midpoint Reflection

> "Let us not grow weary in doing good, for at the proper time we will reap a harvest if we do not give up." — Galatians 6:9

## Morning Reflection

You have reached the halfway point. Take a moment to recognize what God has accomplished in you over these 45 days. You are not the same man who began this journey.

### Look Back and Look Forward

**What has changed?** Consider your prayer life, your self-discipline, your relationships. Write down three concrete changes you have noticed.

**What remains?** The second half often proves harder than the first. Renew your commitment today.

## Evening Examination

- What am I most grateful for from the first 45 days?
- What has been my greatest struggle?
- What grace do I need for the next 45 days?`,

  'ex-fg': `# Field Guide: Prayer Methods

This guide introduces several prayer methods used throughout the Exodus90 program. Return to this resource whenever you want to deepen your prayer practice.

## 1. Lectio Divina

A four-step method of praying with Scripture:

1. **Lectio** (Read): Read the passage slowly
2. **Meditatio** (Meditate): Reflect on a word or phrase that stands out
3. **Oratio** (Pray): Speak to God about what you have read
4. **Contemplatio** (Contemplate): Rest silently in God's presence

## 2. The Examen

St. Ignatius's daily prayer of awareness:

- **Give thanks** for the day
- **Ask for light** to see clearly
- **Review** the events of the day
- **Respond** with sorrow or gratitude
- **Resolve** for tomorrow

## 3. Imaginative Prayer

Place yourself in a Gospel scene. Use all five senses:

- What do you **see**?
- What do you **hear**?
- What do you **smell** and **taste**?
- What do you **feel**?

*Let Jesus speak directly to you within the scene.*

## 4. The Rosary

A meditative prayer using the Hail Mary and the mysteries of Christ's life. Pray one decade (10 Hail Marys) while meditating on a particular mystery.`,

  'ex-dc': `# Weekly Check-in Template

Use this template each week to reflect on your progress and prepare for the week ahead.

## Review of the Past Week

### Prayer
- Days I completed my full prayer time: ___ / 7
- Quality of prayer (1-5): ___
- Notable moments in prayer:

### Asceticism
- Days I maintained my fast: ___ / 7
- Greatest temptation this week:
- How I responded:

### Fraternity
- Times I connected with my group: ___
- How I supported a brother this week:

## Looking Ahead

### Goals for This Week
1.
2.
3.

### Prayer Intention
This week I will pray especially for:

### Scripture to Carry
Choose one verse to memorize or meditate on throughout the week:`,

  'le-aw': `# Ash Wednesday Reflection

> "Remember that you are dust, and to dust you shall return." — Genesis 3:19

## The Beginning of Lent

Today we enter the holy season of Lent — 40 days of prayer, fasting, and almsgiving that prepare us for the joy of Easter. The ashes placed on your forehead are a sign of humility and repentance.

### Three Lenten Practices

1. **Prayer**: Commit to daily Scripture reading and 15 minutes of silent prayer
2. **Fasting**: Today is a day of fasting and abstinence. Eat only one full meal.
3. **Almsgiving**: Choose a charity or person in need to support this Lent

## Gospel Reading — Matthew 6:1-6, 16-18

Jesus teaches us to pray, fast, and give alms in secret — not for the approval of others, but for our Father who sees in secret.

> "But when you give to the needy, do not let your left hand know what your right hand is doing, so that your giving may be in secret. Then your Father, who sees what is done in secret, will reward you."

## Evening Prayer

Lord, as I begin this Lenten journey, grant me the grace of true conversion. Help me to turn away from sin and turn toward You with all my heart. Amen.`,

  'le-d5': `# Friday of the First Week

> "Is not this the fast that I choose: to loose the bonds of wickedness?" — Isaiah 58:6

## Morning Reflection

The first Friday of Lent. Every Friday during this season, we are called to abstain from meat as a small act of solidarity with Christ's suffering. But true fasting goes beyond food.

### Today's Challenge

Choose one thing beyond food to fast from today:
- Social media
- Complaining
- Unnecessary spending

## Scripture for Meditation

> He was despised and rejected by men, a man of sorrows and acquainted with grief.
> — Isaiah 53:3

Spend 10 minutes in silence with this passage. Let the reality of Christ's suffering touch your heart.`,

  'le-d20': `# Third Sunday of Lent

> "Sir, give me this water so that I won't get thirsty." — John 4:15

## The Woman at the Well

Today's Gospel tells the story of Jesus meeting the Samaritan woman at Jacob's well. She came seeking water; she left having found the source of living water.

### Three Lessons

1. **Jesus meets us where we are**: He does not wait for us to be perfect
2. **True thirst is spiritual**: Our deepest longing is for God
3. **Encounter leads to mission**: The woman became an evangelist to her whole town

## Reflection Questions

- What well do I keep returning to that never satisfies?
- Where is Jesus inviting me into deeper conversation?
- How can I share what I have received?

## Prayer

Lord Jesus, You know everything about me and You love me still. Give me the living water that I may never thirst again. Help me to worship You in spirit and in truth. Amen.`,

  'le-ps': `# Palm Sunday Meditation

> "Blessed is he who comes in the name of the Lord!" — Mark 11:9

## The Triumphal Entry

Today we commemorate Jesus's entry into Jerusalem, when crowds waved palm branches and shouted "Hosanna!" Yet within days, these same voices would cry "Crucify him!"

### Meditation

Consider the contrast:
- **Sunday**: Praise and palms
- **Thursday**: Betrayal and arrest
- **Friday**: Crucifixion and death
- **Sunday**: Resurrection and new life

The same crowd that welcomed Jesus abandoned Him. Will we do the same?

## Holy Week Begins

This week, walk closely with Jesus through His passion. Attend the Triduum services if possible. Read the Passion narrative slowly, placing yourself in the scene.`,

  'le-fg': `# Guide: Stations of the Cross

The Stations of the Cross is a devotion that follows Jesus on His journey from condemnation to burial. Walk through each station prayerfully, spending a moment in reflection at each.

## The Fourteen Stations

### Station I: Jesus Is Condemned to Death
*We adore You, O Christ, and we bless You, because by Your holy Cross You have redeemed the world.*

Pilate washes his hands. An innocent man is condemned. How often do we remain silent in the face of injustice?

### Station II: Jesus Carries His Cross
The weight of the world's sin rests on His shoulders. What cross am I carrying today?

### Station III: Jesus Falls the First Time
He falls but rises again. In our failures, Christ shows us that falling is not the end.

### Station IV: Jesus Meets His Mother
Mary's heart breaks as she sees her Son suffering. She does not look away.

### Station V: Simon Helps Jesus Carry the Cross
Simon was compelled to help. Sometimes we are called to carry burdens we did not choose.

*Continue through all fourteen stations in your parish or using a printed guide.*`,

  'ad-w1': `# First Week of Advent: Hope

> "The people walking in darkness have seen a great light." — Isaiah 9:2

## Lighting the First Candle

Today we light the first candle of the Advent wreath — the candle of **Hope**. In the growing darkness of December, this small flame reminds us that light is coming into the world.

### Daily Practice

Each day this week:
1. Light the first candle at dinner
2. Read the daily Scripture passage together
3. Pray the Advent prayer below

## Scripture Readings

- **Monday**: Isaiah 2:1-5 — "Come, let us walk in the light of the Lord"
- **Tuesday**: Isaiah 11:1-10 — "A shoot from the stump of Jesse"
- **Wednesday**: Isaiah 25:6-10 — "He will swallow up death forever"
- **Thursday**: Isaiah 26:1-6 — "Trust in the Lord forever"
- **Friday**: Isaiah 29:17-24 — "The deaf shall hear, the blind shall see"

## Advent Prayer

Come, Lord Jesus. In this season of waiting, fill our hearts with hope. Help us to prepare a place for You — not just in our homes, but in our hearts. Amen.`,

  'ad-w2': `# Second Week of Advent: Peace

> "For to us a child is born, to us a son is given, and the government will be on his shoulders. And he will be called Wonderful Counselor, Mighty God, Everlasting Father, Prince of Peace." — Isaiah 9:6

## Lighting the Second Candle

This week we add the second candle — the candle of **Peace**. Christ comes not with the sword of earthly power, but with the peace that surpasses understanding.

### Daily Practice

Each day this week:
1. Light the first two candles at dinner
2. Read the daily Scripture passage
3. Identify one source of anxiety and offer it to God

## Scripture Readings

- **Monday**: Isaiah 35:1-10 — "The desert will bloom"
- **Tuesday**: Luke 1:26-38 — The Annunciation
- **Wednesday**: Matthew 18:12-14 — The lost sheep
- **Thursday**: Isaiah 41:13-20 — "Do not fear, I will help you"
- **Friday**: Isaiah 48:17-19 — "I am the Lord your God who teaches you"

## Reflection

Where in my life do I need Christ's peace most urgently? Can I surrender that area to Him this week?`,

  'ad-fg': `# Advent Wreath Guide

The Advent wreath is a beautiful tradition that marks the four weeks of preparation before Christmas. This guide will help your family create and use an Advent wreath at home.

## Materials Needed

- An evergreen wreath (real or artificial)
- 3 purple candles and 1 pink candle
- 1 white candle (optional, for Christmas Day)
- A candle holder or plate

## The Four Candles

| Week | Color | Theme | Name |
|------|-------|-------|------|
| 1 | Purple | Hope | Prophet's Candle |
| 2 | Purple | Peace | Bethlehem Candle |
| 3 | Pink | Joy | Shepherd's Candle |
| 4 | Purple | Love | Angel's Candle |

## Weekly Blessing

Each Sunday, as you light a new candle, pray together:

*Lord, as we light this candle, we ask You to fill our home with [hope/peace/joy/love]. Help us to prepare our hearts for the coming of Your Son. We ask this through Christ our Lord. Amen.*

## Tips for Families with Children

- Let children take turns lighting the candles (with supervision)
- Sing an Advent hymn like "O Come, O Come, Emmanuel"
- Share one thing you are grateful for each evening`,

  're-t1': `# Opening Talk: Finding Silence

> "Be still, and know that I am God." — Psalm 46:10

## Welcome

Brothers, welcome to this retreat. For the next three days, we step away from the noise of daily life to listen for the voice of God. This is not a vacation — it is an encounter.

### The Problem of Noise

Our lives are saturated with noise:
- The constant buzz of notifications
- The pressure of deadlines and responsibilities
- The inner monologue of anxiety and self-criticism

**Silence is not the absence of sound. It is the presence of attention.**

## Three Invitations for This Retreat

1. **Turn off your phone.** Not silent mode — off. The world will survive without you for 48 hours.
2. **Resist the urge to fill silence.** When you feel uncomfortable, stay with it. That discomfort is the beginning of prayer.
3. **Be honest with God.** He already knows your heart. Speak plainly.

## Practice

Find a quiet place outside. Sit for 15 minutes. Do nothing. Simply notice what you hear, what you feel, what rises to the surface.

*God speaks in the silence. Will you listen?*`,
};

// ---------------------------------------------------------------------------
// 10. Translation Content
// ---------------------------------------------------------------------------

const CZECH_CONTENT: Record<string, string> = {
  'ex-d1': `# Den 1 - Povolani

> "Pojdte za mnou a ucinim z vas rybare lidi." — Matous 4,19

## Ranni rozjimani

Dnes zacinite svou 90denni cestu. Stejne jako apostolove, kteri zanechali sve site, jste volani k necemu vetsimu. Toto neni pouhé cviceni v sebeodrikani — je to pozvani k setkani s zivym Bohem.

### Tri pilire pro dnesek

1. **Modlitba**: Stravte 20 minut v tiche modlitbe. Najdete klidne misto a budte jednoduze pritomni Bohu.
2. **Askeze**: Zacnete svuj pust od alkoholu a sladkosti. Pamatujte, ze tato obet vytvari prostor pro milost.
3. **Bratrstvo**: Oslovte sveho partnera zodpovednosti. Sdílejte sve umysly pro techto 90 dni.

## Pismo k rozjimani

> Hospodin je muj pastyr, nebudu mit nedostatek.
> Doprava mi odpocinek na travnatych pastvinach,
> vodi me ke klidnym vodam.
> Obcerstvuje mou dusi.
> — Zalm 23,1-3

*Pamatujte: tato cesta neni o dokonalosti. Je o vernosti.*`,

  'ex-d2': `# Den 2 - Disciplina modlitby

> "Kdyz se vsak modlis ty, vejdi do sveho pokojiku, zavri dvere a modli se ke svemu Otci, ktery je skryty." — Matous 6,6

## Ranni rozjimani

Modlitba je zakladem duchovniho zivota. Bez ni vsechny ostatni discipliny ztraceji svuj smysl. Dnes se zamerujeme na vytvoreni rytmu modlitby, ktery vas ponese v nadchazejicich tydnech.

### Praxe

Vyhradte si **20 minut** pro vnitrni modlitbu. Pouzijte nasledujici strukturu:

1. **Priprava** (2 min): Postavte se do Bozi pritomnosti. Udelejte znameni krize.
2. **Cteni** (3 min): Prectete dnesni urivek Pisma pomalu, dvakrat.
3. **Rozjimani** (10 min): Premyslejte o tom, co vas oslovuje. Mluvte o tom s Bohem.
4. **Predsevzeti** (5 min): Zvolte si jeden konkretni cin pro dnesek na zaklade sve modlitby.

## Pismo k rozjimani

> Ztisete se a vedzte, ze ja jsem Buh.
> — Zalm 46,10`,

  'ex-d3': `# Den 3 - Pust a svoboda

> "Neni prave toto posteni, jez jsem vyvolil: rozevrit okovy svevole?" — Izajas 58,6

## Ranni rozjimani

Posteni neni trest — je to osvobozeni. Kdyz si odepirame pohodli, zjistujeme, ze nas nejhlubsi hlad neni po jidle ani piti, ale po Bohu.

### Proc se postime

Pousetni otcove chapali, ze **posteni brisi mysl** a otevira srdce. Zvazme tri rozmery:

- **Fyzicky**: Vase telo se uci rikat "ne" okamzitemu uspokojeni
- **Duchovni**: Kazdy zaludecni stah se stava modlitbou
- **Spolecny**: Vase obet vas spojuje s temi, kteri hladoveji nedobrovolne

*Svoboda, kterou hledate, se nenachazi v tom, ze budete mit vice, ale v tom, ze budete potrebovat mene.*`,

  'ex-fg': `# Pruvodce: Metody modlitby

Tento pruvodce predstavuje nekolik metod modlitby pouzivanych v programu Exodus90.

## 1. Lectio Divina

Ctyrstupnova metoda modlitby s Pismem:

1. **Lectio** (Cteni): Prectete pasaz pomalu
2. **Meditatio** (Rozjimani): Premyslejte o slove ci frazi, ktera vas oslovuje
3. **Oratio** (Modlitba): Mluvte s Bohem o tom, co jste precetli
4. **Contemplatio** (Nazirání): Odpocinete v tichosti v Bozi pritomnosti

## 2. Examen

Denni modlitba sebereflexe sv. Ignace:

- **Diky** za uplynuly den
- **Prosba o svetlo** k jasnemu videni
- **Prehled** udalosti dne
- **Odpoved** litosti nebo vdecnosti
- **Predsevzeti** na zitrek`,

  'ex-dc': `# Sablona pro tydenni kontrolu

Pouzijte tuto sablonu kazdy tyden k zamysleni nad svym pokrokem.

## Prehled uplynuleho tydne

### Modlitba
- Dny, kdy jsem dokoncil cely cas modlitby: ___ / 7
- Kvalita modlitby (1-5): ___

### Askeze
- Dny, kdy jsem dodrzoval pust: ___ / 7
- Nejvetsi pokuseni tohoto tydne:

### Bratrstvo
- Kolikrat jsem se spojil se svou skupinou: ___`,

  'le-aw': `# Popelecni streda

> "Pamatuj, ze jsi prach a v prach se obratís." — Genesis 3,19

## Zacatek postniho obdobi

Dnes vstupujeme do svateho postniho obdobi — 40 dni modlitby, postu a almuzny, které nas pripravuji na velikonocni radost.

### Tri postni praxe

1. **Modlitba**: Zavazat se k dennímu cteni Pisma a 15 minutam tiche modlitby
2. **Pust**: Dnes je den postu a zdrzenlivosti. Jezte pouze jedno plne jidlo.
3. **Almuzna**: Zvolte si charitu nebo potrebneho cloveka, ktereho budete behem postu podporovat

## Vecerni modlitba

Pane, kdyz zacinam tuto postni cestu, daruj mi milost praveho obraceni. Amen.`,

  'le-d5': `# Patek prvniho tydne

> "Coz neni toto posteni, ktere jsem vyvolil: rozevrit okovy svevole?" — Izajas 58,6

## Ranni rozjimani

Prvni patek v poste. Kazdy patek behem tohoto obdobi jsme volani zdrzet se masa...`,

  'le-d20': `# Treti nedele postni

> "Pane, dej mi tu vodu, abych uz nemela zizen." — Jan 4,15

## Zena u studny

Dnesni evangelium vypravi pribeh Jezise a Samaritanky u Jakubovy studny. Prisla hledat vodu; odesla, kdyz nasla pramen zive vody.

### Tri lekce

1. **Jezis nas potkava tam, kde jsme**: Neceka, az budeme dokonali
2. **Prava zizen je duchovni**: Nase nejhlubsi touha je po Bohu
3. **Setkani vede k poslani**: Zena se stala evangelistkou pro cele mesto`,

  'le-fg': `# Pruvodce: Krizova cesta

Krizova cesta je poboznost, ktera nasleduje Jezise na jeho ceste od odsouzeni k pohrbeni.

## Ctrnact zastaveni

### I. zastaveni: Jezis je odsouzen k smrti
*Klanime se ti, Kriste, a chvalime te, nebot svym svatym krizem jsi vykoupil svet.*

Pilat si myje ruce. Nevinny muz je odsouzen. Jak casto mlcime tvari v tvar nespravedlnosti?

### II. zastaveni: Jezis bere na sebe kriz
Tiha hrichu sveta spociva na jeho ramenou.

### III. zastaveni: Jezis pada poprve
Pada, ale zase vstava. V nasich selhanich nam Kristus ukazuje, ze pad neni konec.`,

  'ad-w1': `# Prvni tyden adventu: Nadeje

> "Lid, ktery chodil v temnote, uvidel velke svetlo." — Izajas 9,2

## Zapaleni prvni svice

Dnes zapalujeme prvni svici adventniho vence — svici **Nadeje**. V rostouci prosincove tme nam tento maly plamen pripomina, ze svetlo prichazi do sveta.

### Denni praxe

Kazdy den tento tyden:
1. Zapalte prvni svici pri veceri
2. Prectete si spolecne denni urivek z Pisma
3. Pomodlete se adventni modlitbu`,

  'ad-w2': `# Druhy tyden adventu: Pokoj

> "Nebot se nam narodi dite, syn je nam dan a na jeho ramenou spocine vladnuti. A bude nazvan: Podivuhodny radce, Mocny Buh, Vecny otec, Kníze pokoje." — Izajas 9,6

## Zapaleni druhe svice

Tento tyden pridavame druhou svici — svici **Pokoje**. Kristus neprichazi s mecem pozemske moci, ale s pokojem, ktery prevysuje vsechno chápání.`,

  'ad-fg': `# Pruvodce adventnim vencem

Adventni venec je krasna tradice, ktera oznacuje ctyri tydny pripravy pred Vanocemi.

## Potrebny material

- Vecne zeleny venec
- 3 fialove svice a 1 ruzova svice
- 1 bila svice (volitelne, na Stedry den)

## Ctyri svice

| Tyden | Barva | Tema | Nazev |
|-------|-------|------|-------|
| 1 | Fialova | Nadeje | Svice proroka |
| 2 | Fialova | Pokoj | Betlemska svice |
| 3 | Ruzova | Radost | Pastyrska svice |
| 4 | Fialova | Laska | Andelska svice |`,

  're-t1': `# Uvodni prednaška: Nalezeni ticha

> "Ztisete se a vedzte, ze ja jsem Buh." — Zalm 46,10

## Vitejte

Bratri, vitejte na tomto rekolekci. Na nasledujici tri dny vystupujeme z hluku kazdodenniho zivota, abychom naslouchali Bozimu hlasu.

### Problem hluku

Nase zivoty jsou prosyceny hlukem:
- Neustaly bzukot notifikaci
- Tlak terminu a zodpovednosti
- Vnitrni monolog uzkosti a sebekritiky

**Ticho neni neprítomnost zvuku. Je to pritomnost pozornosti.**`,
};

const SLOVAK_CONTENT: Record<string, string> = {
  'ex-d1': `# Den 1 - Povolanie

> "Podte za mnou a urobim z vas rybarov ludi." — Matus 4,19

## Ranne rozjimanie

Dnes zaciname vasu 90-dnovú cestu. Rovnako ako apostoli, ktori zanechali svoje siete, ste volani k niecomu vaesiemu.

### Tri piliere pre dnesok

1. **Modlitba**: Stravte 20 minut v tichej modlitbe.
2. **Askeza**: Zacnite svoj post od alkoholu a sladkosti.
3. **Bratstvo**: Oslovte svojho partnera zodpovednosti.

> Hospodin je moj pastier, nebudem mat nedostatok.
> — Zalm 23,1`,

  'ex-d2': `# Den 2 - Disciplina modlitby

> "Ked sa vsak modlis ty, vojdi do svojej izby, zavri dvere a modli sa k svojmu Otcovi, ktory je v skrytosti." — Matús 6,6

## Ranne rozjimanie

Modlitba je zakladom duchovneho zivota...`,

  'ex-fg': `# Sprievodca: Metody modlitby

Tento sprievodca predstavuje niekolko metod modlitby pouzivanych v programe Exodus90.

## 1. Lectio Divina

1. **Lectio** (Citanie): Precitajte pasaz pomaly
2. **Meditatio** (Rozjimanie): Premyslajte o slove ci fraze
3. **Oratio** (Modlitba): Hovorte s Bohom
4. **Contemplatio** (Naziranie): Odpocivajte v Bozej pritomnosti`,

  'le-aw': `# Popolcova streda

> "Pamataj, ze si prach a na prach sa obratís." — Genezis 3,19

## Zaciatok postneho obdobia

Dnes vstupujeme do svateho postneho obdobia — 40 dni modlitby, postu a almuzny.`,

  'le-fg': `# Sprievodca: Krizova cesta

Krizova cesta je poboznost, ktora nasleduje Jezisa na jeho ceste od odsudenia k pohrebeniu.

## Strnast zastaveni

### I. zastavenie: Jezis je odsudeny na smrt
*Klanime sa ti, Kriste, a chvalime ta, lebo svojim svatym krizom si vykupil svet.*`,

  'ad-w1': `# Prvy tyzden adventu: Nadej

> "Lud, ktory chodil v tme, uvidel velke svetlo." — Izaias 9,2

## Zapalenie prvej sviece

Dnes zapalujeme prvu sviecu adventneho venca — sviecu **Nadeje**.`,

  'ad-w2': `# Druhy tyzden adventu: Pokoj

> "Lebo nam sa narodi dietatko, syn nam je dany." — Izaias 9,6

## Zapalenie druhej sviece

Tento tyzden pridavame druhu sviecu — sviecu **Pokoja**.`,

  're-t1': `# Uvodna prednaska: Najdenie ticha

> "Stiste sa a vedzte, ze ja som Boh." — Zalm 46,10

## Vitajte

Bratia, vitajte na tomto duchovnom cviceni.`,
};

const CROATIAN_CONTENT: Record<string, string> = {
  'ex-d1': `# Dan 1 - Poziv

> "Dodite za mnom i ucinit cu vas ribarima ljudi." — Matej 4,19

## Jutarnje razmatranje

Danas pocinje vase 90-dnevno putovanje. Kao i apostoli koji su ostavili svoje mreze, pozvani ste na nesto vece.

### Tri stupa za danas

1. **Molitva**: Provedite 20 minuta u tihoj molitvi.
2. **Askeza**: Zapocnite svoj post od alkohola i slatkisa.
3. **Bratstvo**: Obratite se svom partneru odgovornosti.`,

  'ex-d2': `# Dan 2 - Disciplina molitve

> "A ti, kad se molis, udi u svoju sobu, zatvori vrata i pomoli se Ocu svomu, koji je u tajnosti." — Matej 6,6

## Jutarnje razmatranje

Molitva je temelj duhovnog zivota...`,

  'ex-fg': `# Vodic: Metode molitve

Ovaj vodic predstavlja nekoliko metoda molitve koristenih u programu Exodus90.

## 1. Lectio Divina

1. **Lectio** (Citanje): Polako procitajte odlomak
2. **Meditatio** (Razmatranje): Razmislite o rijeci ili frazi
3. **Oratio** (Molitva): Razgovarajte s Bogom
4. **Contemplatio** (Kontemplacija): Odmarajte se u Bozjoj prisutnosti`,

  're-t1': `# Uvodno predavanje: Pronalazenje tisine

> "Utisajte se i znajte da sam ja Bog." — Psalam 46,10

## Dobrodosli

Braco, dobrodosli na ovo duhovno povlacenje.`,
};

const GERMAN_CONTENT: Record<string, string> = {
  'ex-d1': `# Tag 1 - Die Berufung

> "Kommt, folgt mir nach! Ich werde euch zu Menschenfischern machen." — Matthaus 4,19

## Morgenbetrachtung

Heute beginnt Ihre 90-tagige Reise. Wie die Apostel, die ihre Netze zuruckliessen...`,

  'le-aw': `# Aschermittwoch Betrachtung

> "Bedenke, Mensch, dass du Staub bist und zum Staub zuruckkehren wirst." — Genesis 3,19

## Der Beginn der Fastenzeit

Heute treten wir in die heilige Fastenzeit ein — 40 Tage des Gebets, des Fastens und des Almosengebens.`,
};

// ---------------------------------------------------------------------------
// 11. Document Versions
// ---------------------------------------------------------------------------

type VersionDef = {
  docKey: string;
  langCode: string;
  status: DocumentStatus;
  userKey: string;
  reviewerKey?: string;
  versionNum: number;
};

const TARGET_VERSIONS: VersionDef[] = [
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

  // Summer Retreat (all DEPLOYED)
  { docKey: 're-t1', langCode: 'cs', status: DocumentStatus.DEPLOYED, userKey: 'translator1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 're-t1', langCode: 'sk', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },
  { docKey: 're-t1', langCode: 'hr', status: DocumentStatus.DEPLOYED, userKey: 'reviewer1', reviewerKey: 'admin1', versionNum: 5 },
];

function getTranslationContent(docKey: string, langCode: string, status: DocumentStatus): string {
  const contentMap: Record<string, Record<string, string>> = {
    cs: CZECH_CONTENT,
    sk: SLOVAK_CONTENT,
    hr: CROATIAN_CONTENT,
    de: GERMAN_CONTENT,
  };

  if (status === DocumentStatus.PENDING_TRANSLATION) return '';

  const langContent = contentMap[langCode];
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
// 12. Document Assignments
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

  const assignments: { docKey: string; langCode: string; userKey: string | null; deadline?: Date }[] = [
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
  ];

  let count = 0;
  for (const a of assignments) {
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
// 13. Suggestions & Replies
// ---------------------------------------------------------------------------

async function seedSuggestions(
  versions: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Suggestions ---');

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

  const suggestions: SuggestionDef[] = [
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

  for (const s of suggestions) {
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
  console.log(`Created ${suggestions.length} suggestions with replies`);
}

// ---------------------------------------------------------------------------
// 14. Activity Logs
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
// 15. Comments
// ---------------------------------------------------------------------------

async function seedComments(
  versions: Record<string, string>,
  users: Record<string, string>,
) {
  console.log('\n--- Comments ---');

  const comments: { versionKey: string; userKey: string; content: string }[] = [
    { versionKey: 'ex-d1:cs', userKey: 'admin1', content: 'Excellent translation. Ready for deployment.' },
    { versionKey: 'ex-d2:cs', userKey: 'reviewer1', content: 'Minor changes needed in the opening paragraph. See my suggestions above.' },
    { versionKey: 'ex-d2:cs', userKey: 'translator1', content: 'All suggestions addressed. Ready for another look.' },
    { versionKey: 'ex-d3:cs', userKey: 'reviewer1', content: 'Still reviewing — will finish by end of day.' },
    { versionKey: 'le-aw:cs', userKey: 'admin1', content: 'Beautiful translation of the Ash Wednesday liturgy.' },
    { versionKey: 'ex-d1:hr', userKey: 'admin1', content: 'A few terminology issues to discuss. See inline suggestions.' },
    { versionKey: 'le-d20:cs', userKey: 'translator1', content: 'I have some questions about the liturgical terminology — see the suggestion thread.' },
    { versionKey: 'ex-d1:sk', userKey: 'reviewer1', content: 'Good work on the Slovak translation. One term updated.' },
  ];

  for (const c of comments) {
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
  console.log(`Created ${comments.length} comments`);
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
  console.log('  Admin:      admin@example.org / Hello123456');
  console.log('  Admin 2:    deploy@example.org / Hello123456');
  console.log('  Translator: jan.novak@example.org / Hello123456');
  console.log('  Translator: maria.schmidt@example.org / Hello123456');
  console.log('  Reviewer:   ivan.horvat@example.org / Hello123456');
  console.log('  Banned:     peter.zilka@example.org / Hello123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
