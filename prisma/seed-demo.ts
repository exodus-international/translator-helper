/**
 * Demo layer, applied on top of `pnpm db:seed`.
 *
 * The base seed is also the fixture the database tests and the end-to-end
 * suite run against, and those assume, among other things, that the seed
 * makes no notifications and that no deadline is close enough to trigger a
 * reminder. A product demo needs the opposite: an inbox with something in it,
 * work that is overdue and work that is due tomorrow. So that state lives here,
 * opt-in, and never reaches a test database.
 *
 *   pnpm db:seed && pnpm db:seed:demo
 *
 * It is what `pnpm demos` records against (see demos/README.md).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DocumentStatus,
  NotificationEmailStatus,
  NotificationType,
  PrismaClient,
} from '../src/generated/prisma/client';
import { daysAgo, daysFromNow } from './seed-data/datasets';
import { REQUIRED_DATABASE } from '../tests/test-database';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname.replace(/^\//, '') === REQUIRED_DATABASE) {
  throw new Error(`Refusing to add demo data to "${REQUIRED_DATABASE}": the tests assume the base seed alone.`);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

/** The same wording the notification service uses, so seeded rows read like real ones. */
function formatDueDate(deadline: Date): string {
  return deadline.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * A translation that is nearly done, which is what the editor demo works on.
 * One thing is left for it to fix on camera: "Dnešní výzva" has lost the `###`
 * the source gives "Today's Challenge".
 */
const FRIDAY_CS = `# Pátek prvního týdne

> "Což není toto postění, které jsem vyvolil: rozvázat pouta svévole?" — Izajáš 58,6

## Ranní rozjímání

První pátek v postě. Každý pátek během tohoto období jsme voláni zdržet se masa jako malý projev solidarity s Kristovým utrpením. Pravý půst však přesahuje jídlo.

Dnešní výzva

Vyberte si dnes jednu věc kromě jídla, od které se budete postit:
- Sociální sítě
- Stěžování si
- Zbytečné utrácení

## Písmo k rozjímání

> Byl opovržený, opuštěný od lidí, muž bolestí, který poznal nemoc.
> — Izajáš 53,3

Strávte deset minut v tichu s tímto úryvkem. Nechte skutečnost Kristova utrpení dotknout se vašeho srdce.
`;

async function user(email: string) {
  return prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, name: true } });
}

async function version(slug: string, languageCode: string) {
  const found = await prisma.documentVersion.findFirstOrThrow({
    where: { document: { slug }, language: { code: languageCode } },
    select: {
      id: true,
      document: { select: { title: true, slug: true, sourceProject: { select: { slug: true } } } },
      language: { select: { name: true, code: true } },
    },
  });
  const url = `/documents/${found.document.sourceProject?.slug}/${found.document.slug}/${found.language.code}`;
  return { ...found, url, work: `"${found.document.title}" (${found.language.name})` };
}

async function main() {
  console.log('Adding the demo layer…');

  const [admin, translator, translator2, reviewer] = await Promise.all([
    user('admin@example.org'),
    user('translator@example.org'),
    user('translator2@example.org'),
    user('reviewer@example.org'),
  ]);

  const fridayCs = await version('lent-day-5', 'cs');
  const desertCs = await version('ex90-day-14', 'cs');
  const fastingCs = await version('ex90-day-3', 'cs');
  const palmSundayCs = await version('lent-palm-sunday', 'cs');
  const ashWednesdayCs = await version('lent-ash-wednesday', 'cs');
  const thirdSundayCs = await version('lent-day-20', 'cs');
  const day1De = await version('ex90-day-1', 'de');

  // --- Deadlines: one overdue, one due tomorrow, one review with its own date ---

  const overdue = daysAgo(2);
  const tomorrow = daysFromNow(1);
  const reviewDue = daysFromNow(2);

  await prisma.documentVersion.update({
    where: { id: fridayCs.id },
    data: { deadline: overdue, assignedById: admin.id, assignedAt: daysAgo(12), content: FRIDAY_CS },
  });
  await prisma.documentVersion.update({
    where: { id: desertCs.id },
    data: { deadline: tomorrow, assignedById: admin.id, assignedAt: daysAgo(9) },
  });
  await prisma.documentVersion.update({
    where: { id: fastingCs.id },
    data: { reviewDeadline: reviewDue },
  });
  await prisma.documentVersion.update({
    where: { id: day1De.id },
    data: { deadline: daysFromNow(3) },
  });
  // A fresh assignment for the inbox to announce.
  await prisma.documentVersion.update({
    where: { id: palmSundayCs.id },
    data: {
      userId: translator.id,
      status: DocumentStatus.PENDING_TRANSLATION,
      deadline: daysFromNow(21),
      assignedById: admin.id,
      assignedAt: hoursAgo(26),
    },
  });

  // --- Notifications -----------------------------------------------------------

  // A thread for the reply notification to open: the open "fasting" suggestion.
  const fastingThread = await prisma.suggestion.findFirstOrThrow({
    where: { documentVersionId: fastingCs.id, comment: { contains: 'fasting' } },
    select: { id: true },
  });
  const thirdSundayThread = await prisma.suggestion.findFirstOrThrow({
    where: { documentVersionId: thirdSundayCs.id },
    select: { id: true },
  });

  await prisma.notification.deleteMany();

  const today = { emailStatus: NotificationEmailStatus.PENDING };
  const earlier = { emailStatus: NotificationEmailStatus.SENT };

  await prisma.notification.createMany({
    data: [
      // Jan Novak, the translator: a week of work landing on him.
      {
        userId: translator.id,
        type: NotificationType.DEADLINE_PASSED,
        documentVersionId: fridayCs.id,
        title: `${fridayCs.work} is overdue`,
        body: `Your translation was due ${formatDueDate(overdue)}, 2 days ago.`,
        url: fridayCs.url,
        createdAt: hoursAgo(1),
        ...today,
      },
      {
        userId: translator.id,
        type: NotificationType.SUGGESTION_REPLY,
        documentVersionId: fastingCs.id,
        actorId: reviewer.id,
        title: `New reply on ${fastingCs.work}`,
        body: `${reviewer.name}: The standard theological term is "posteni" though. Check the language instructions.`,
        url: `${fastingCs.url}?thread=${fastingThread.id}`,
        createdAt: hoursAgo(3),
        ...today,
      },
      {
        userId: translator.id,
        type: NotificationType.DEADLINE_APPROACHING,
        documentVersionId: desertCs.id,
        title: `${desertCs.work} is due ${formatDueDate(tomorrow)}`,
        body: 'Your translation is due in less than a day.',
        url: desertCs.url,
        createdAt: hoursAgo(6),
        ...today,
      },
      {
        userId: translator.id,
        type: NotificationType.ASSIGNED_TRANSLATOR,
        documentVersionId: palmSundayCs.id,
        actorId: admin.id,
        title: `Translate "Palm Sunday Meditation" into Czech`,
        body: `Assigned by ${admin.name}. Due ${formatDueDate(daysFromNow(21))}.`,
        url: palmSundayCs.url,
        createdAt: hoursAgo(26),
        readAt: hoursAgo(20),
        ...earlier,
      },
      {
        userId: translator.id,
        type: NotificationType.CHANGES_REQUESTED,
        documentVersionId: fridayCs.id,
        actorId: reviewer.id,
        title: `Changes requested on ${fridayCs.work}`,
        body: `${reviewer.name} sent your translation back.`,
        url: fridayCs.url,
        createdAt: hoursAgo(30),
        readAt: hoursAgo(29),
        ...earlier,
      },
      {
        userId: translator.id,
        type: NotificationType.TRANSLATION_APPROVED,
        documentVersionId: ashWednesdayCs.id,
        actorId: admin.id,
        title: `${ashWednesdayCs.work} is approved`,
        body: `Approved by ${admin.name}.`,
        url: ashWednesdayCs.url,
        createdAt: hoursAgo(50),
        readAt: hoursAgo(48),
        emailStatus: NotificationEmailStatus.SKIPPED,
      },
      {
        userId: translator.id,
        type: NotificationType.SUGGESTION_ADDED,
        documentVersionId: thirdSundayCs.id,
        actorId: admin.id,
        title: `New suggestion on ${thirdSundayCs.work}`,
        body: `${admin.name}: Liturgical term should follow the Czech Bishops' Conference standard.`,
        url: `${thirdSundayCs.url}?thread=${thirdSundayThread.id}`,
        createdAt: hoursAgo(74),
        readAt: hoursAgo(70),
        emailStatus: NotificationEmailStatus.SKIPPED,
      },

      // Ivan Horvat, the reviewer: a review with its own due date.
      {
        userId: reviewer.id,
        type: NotificationType.ASSIGNED_REVIEWER,
        documentVersionId: fastingCs.id,
        actorId: admin.id,
        title: `Review "${fastingCs.document.title}" in ${fastingCs.language.name}`,
        body: `Assigned by ${admin.name}. Due ${formatDueDate(reviewDue)}.`,
        url: fastingCs.url,
        createdAt: hoursAgo(20),
        ...today,
      },

      // Fr. Thomas More, the admin who assigned the late work.
      {
        userId: admin.id,
        type: NotificationType.DEADLINE_ESCALATION,
        documentVersionId: fridayCs.id,
        title: `${fridayCs.work} is overdue`,
        body: `The translation, assigned to ${translator.name}, was due ${formatDueDate(overdue)}.`,
        url: fridayCs.url,
        createdAt: hoursAgo(1),
        ...today,
      },
      {
        userId: admin.id,
        type: NotificationType.REVIEW_REQUESTED,
        documentVersionId: thirdSundayCs.id,
        actorId: translator.id,
        title: `${thirdSundayCs.work} is ready for review`,
        body: `Submitted by ${translator.name}.`,
        url: thirdSundayCs.url,
        createdAt: hoursAgo(28),
        readAt: hoursAgo(27),
        ...earlier,
      },

      // Maria Schmidt, German's Language Manager.
      {
        userId: translator2.id,
        type: NotificationType.DEADLINE_APPROACHING,
        documentVersionId: day1De.id,
        title: `${day1De.work} is due ${formatDueDate(daysFromNow(3))}`,
        body: 'Your translation is due in less than three days.',
        url: day1De.url,
        createdAt: hoursAgo(4),
        ...today,
      },
    ],
  });

  const count = await prisma.notification.count();
  console.log(`Demo layer added: ${count} notifications, 1 overdue translation, 1 due tomorrow, 1 review deadline.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
