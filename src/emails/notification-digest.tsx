/* eslint-disable @next/next/no-page-custom-font -- an email's <head>, not a Next.js page */
import { NOTIFICATION_CATALOG } from '@/domain/notification/notification.catalog';
import { DocumentStatus, type NotificationType } from '@/generated/prisma/enums';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { CSSProperties } from 'react';

/**
 * The header is the app's link preview image (src/app/opengraph-image.jpg),
 * cropped to a banner, so the email looks like every other place the app is
 * shared. Its ink and gold carry into the frame; everything below looks like
 * the app: its neutrals, its font and its chips. Email clients know nothing of
 * oklch or CSS variables, so these are the light theme's tokens
 * (src/app/globals.css) written out as hex.
 */
const HEADER = {
  /** The banner's darkest edge, shown while images are blocked. */
  ink: '#11100E',
  /** The banner's subtitle gold. */
  gold: '#CFA758',
  cream: '#F3E6C8',
  serif: "Georgia,'Times New Roman',serif",
};
const WHITE = '#FFFFFF';
const APP = {
  foreground: '#0A0A0A',
  primary: '#171717',
  mutedForeground: '#737373',
  muted: '#F5F5F5',
  border: '#E5E5E5',
  canvas: '#FAFAFA',
  radius: '10px',
  font: "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
};

interface Chip {
  /** The label colour: the token itself. */
  text: string;
  /** The token at 10% on white, like bg-hue-blue/10. */
  fill: string;
  /** The token at 25% on white, like border-hue-blue/25. */
  border: string;
}

const NEUTRAL_CHIP: Chip = { text: APP.mutedForeground, fill: APP.muted, border: APP.border };
const DESTRUCTIVE_CHIP: Chip = { text: '#E7000B', fill: '#FDE6E7', border: '#F9BFC2' };
const WARNING_CHIP: Chip = { text: '#A76200', fill: '#F6EFE6', border: '#E9D8BF' };

/** The document status badges (src/constants/document-status.ts), by their --hue-* token. */
const STATUS_CHIPS: Partial<Record<DocumentStatus, Chip>> = {
  [DocumentStatus.IN_PROGRESS]: { text: '#0061D8', fill: '#E6EFFB', border: '#BFD8F5' },
  [DocumentStatus.PENDING_REVIEW]: WARNING_CHIP,
  [DocumentStatus.APPROVED]: { text: '#008954', fill: '#E6F3EE', border: '#BFE2D4' },
};

/** The same chip the app shows for the notification: deadlines, then the status it is about. */
function chipFor(type: NotificationType): Chip {
  const { tone, status } = NOTIFICATION_CATALOG[type];
  if (tone === 'overdue') return DESTRUCTIVE_CHIP;
  if (tone === 'soon') return WARNING_CHIP;
  return (status && STATUS_CHIPS[status]) || NEUTRAL_CHIP;
}

export interface DigestCard {
  type: NotificationType;
  title: string;
  body: string | null;
  /** Absolute, so it works outside the app. */
  href: string | null;
}

export interface DigestEmailProps {
  subject: string;
  greeting: string;
  intro: string;
  /** Already sorted loudest first. */
  cards: DigestCard[];
  headerUrl: string;
  preferencesUrl: string;
}

/**
 * One email for everything that is waiting for one person. Email clients
 * understand only tables and inline styles, and most ignore web fonts, so every
 * font has a system fallback and the layout never depends on CSS a client may
 * strip; React Email's components produce that markup.
 */
export function DigestEmail({ subject, greeting, intro, cards, headerUrl, preferencesUrl }: DigestEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <title>{subject}</title>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>
      <Preview>{cards.map((card) => card.title).join(' · ')}</Preview>
      <Body style={{ margin: 0, padding: '32px 16px', backgroundColor: APP.canvas, fontFamily: APP.font }}>
        <Container style={{ width: '100%', maxWidth: '560px' }}>
          <Section style={{ backgroundColor: HEADER.ink }}>
            {/* 1120 × 429, shown at half that so it stays sharp on high-density screens. The alt
                text stands in, styled like the banner's title, where images are blocked. */}
            <Img
              src={headerUrl}
              width="560"
              height="215"
              alt="Translation Helper"
              style={{
                width: '100%',
                height: 'auto',
                color: HEADER.cream,
                fontFamily: HEADER.serif,
                fontSize: '28px',
                fontWeight: 700,
                lineHeight: '48px',
                textAlign: 'center',
              }}
            />
          </Section>

          <Section style={{ backgroundColor: WHITE, padding: '36px 32px 32px' }}>
            <Heading
              as="h1"
              style={{
                margin: 0,
                fontSize: '24px',
                lineHeight: '32px',
                fontWeight: 600,
                letterSpacing: '-0.5px',
                color: APP.foreground,
              }}
            >
              {greeting}
            </Heading>
            <Text style={{ margin: '4px 0 24px', fontSize: '15px', lineHeight: '22px', color: APP.mutedForeground }}>
              {intro}
            </Text>
            {cards.map((card, index) => (
              <DigestCardView key={index} card={card} />
            ))}
            <div
              style={{
                height: '4px',
                width: '48px',
                marginTop: '8px',
                backgroundColor: HEADER.gold,
                fontSize: 0,
                lineHeight: 0,
              }}
            >
              &nbsp;
            </div>
          </Section>

          <Text
            style={{
              margin: 0,
              padding: '24px 16px 0',
              textAlign: 'center',
              fontSize: '12px',
              lineHeight: '18px',
              color: APP.mutedForeground,
            }}
          >
            You get these because of your work in Translation Helper for Exodus 90.
            <br />
            <Link href={preferencesUrl} style={{ color: APP.foreground, textDecoration: 'underline' }}>
              Choose which emails you get
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * One card, shaped like a row in the app's inbox: the notification's chip, its
 * title and body. Overdue and due-soon cards are tinted with their chip so
 * late work stands out, and overdue work gets a button rather than a link.
 */
function DigestCardView({ card }: { card: DigestCard }) {
  const { tone, tag } = NOTIFICATION_CATALOG[card.type];
  const chip = chipFor(card.type);
  const urgent = tone === 'overdue' || tone === 'soon';
  const link: CSSProperties = { fontSize: '14px', lineHeight: '20px', fontWeight: 500, whiteSpace: 'nowrap' };

  return (
    <Section
      style={{
        marginBottom: '12px',
        backgroundColor: urgent ? chip.fill : WHITE,
        border: `1px solid ${urgent ? chip.border : APP.border}`,
        borderRadius: APP.radius,
        padding: '16px 20px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          border: `1px solid ${chip.border}`,
          borderRadius: '999px',
          backgroundColor: chip.fill,
          color: chip.text,
          fontSize: '12px',
          lineHeight: '16px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {tag}
      </span>
      <Text
        style={{ margin: '10px 0 0', fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: APP.foreground }}
      >
        {card.href ? (
          <Link href={card.href} style={{ color: APP.foreground, textDecoration: 'none' }}>
            {card.title}
          </Link>
        ) : (
          card.title
        )}
      </Text>
      {card.body && (
        <Text style={{ margin: '4px 0 0', fontSize: '14px', lineHeight: '20px', color: APP.mutedForeground }}>
          {card.body}
        </Text>
      )}
      {/* Late work gets a button, not a link: it is the one thing in the email to do today. */}
      {card.href &&
        (tone === 'overdue' ? (
          <Button
            href={card.href}
            style={{
              ...link,
              marginTop: '16px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: APP.primary,
              color: WHITE,
            }}
          >
            Open now &rarr;
          </Button>
        ) : (
          <Text style={{ margin: '12px 0 0' }}>
            <Link href={card.href} style={{ ...link, color: APP.foreground, textDecoration: 'underline' }}>
              Open &rarr;
            </Link>
          </Text>
        ))}
    </Section>
  );
}

const PREVIEW_URL = 'http://localhost:3000/documents/e90/day-3/sk';

/** What `pnpm email:dev` shows. */
DigestEmail.PreviewProps = {
  subject: '4 updates in Translation Helper (1 overdue, 1 due soon)',
  greeting: 'Hi Sarah,',
  intro: 'There are 4 updates on your work, and one deadline has passed.',
  headerUrl: 'http://localhost:3000/email/header.jpg',
  preferencesUrl: 'http://localhost:3000/profile#notifications',
  cards: [
    {
      type: 'DEADLINE_ESCALATION',
      title: '"Day 2 - Discipline of Prayer" (Slovak) is overdue',
      body: 'The translation, assigned to Jan Novák, was due Tue 22 Sept.',
      href: PREVIEW_URL,
    },
    {
      type: 'DEADLINE_APPROACHING',
      title: '"Day 3 - Fasting and Freedom" (Slovak) is due Thu 24 Sept',
      body: 'Your review is due in less than three days.',
      href: PREVIEW_URL,
    },
    {
      type: 'REVIEW_REQUESTED',
      title: '"Day 3 - Fasting and Freedom" (Slovak) is ready for review',
      body: 'Jan Novák submitted it.',
      href: PREVIEW_URL,
    },
    {
      type: 'TRANSLATION_APPROVED',
      title: '"Day 1 - The Call" (Slovak) was approved',
      body: 'Fr. Thomas More approved it.',
      href: PREVIEW_URL,
    },
  ],
} satisfies DigestEmailProps;

export default DigestEmail;
