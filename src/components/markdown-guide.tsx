'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { MarkdownPreview } from '@/components/markdown-preview';
import { useEditorStore } from '@/lib/stores/editor-provider';
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The Markdown guide: what a translator needs while writing, opened from the
 * header button or from a lint finding.
 *
 * The reference document (`ex90-markdown-reference`) is the specimen sheet that
 * renders every construct; this is the checklist that goes with it, written
 * from the same source of truth — the constructs the content library actually
 * uses, plus the rules the editor lints for.
 *
 * Each example shows its source beside its render, through the same marked
 * pipeline the Live pane uses, so what is promised here is what the app does.
 */

interface Construct {
  name: string;
  /** The Markdown as it is written, shown verbatim. */
  syntax: string;
  note: ReactNode;
  /**
   * What to feed the renderer for the right-hand column. Omitted where the
   * construct is not one a reader sees as prose — frontmatter, cards, images
   * and video would also fetch or embed the real asset in a dialog.
   */
  render?: string;
}

/** Names of frontmatter keys read as identifiers rather than prose. */
function Token({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{children}</code>;
}

const CONSTRUCTS: Construct[] = [
  {
    name: 'Frontmatter',
    syntax:
      '---\ntitle: Markdown Reference\nsubtitle: Every construct the content library uses\ncaption: Reference\nhero: markdown_reference-exodus_2026\nday: 0\n---',
    note: (
      <>
        Keys stay in English. Translate the prose ones — <Token>title</Token>, <Token>subtitle</Token>,{' '}
        <Token>caption</Token> — and carry <Token>hero</Token>, <Token>day</Token>, <Token>verse_tag</Token> and{' '}
        <Token>lectionary number</Token> over exactly: they are identifiers, not words.
      </>
    ),
  },
  {
    name: 'Headings',
    syntax: '## Morning Reflection',
    render: '## Morning Reflection',
    note: 'Only # and ## appear in the library. Keep the same number of headings as the source, at the same levels.',
  },
  {
    name: 'Emphasis',
    syntax: '**a discipline you commit to** and *the disposition you bring*',
    render: '**a discipline you commit to** and *the disposition you bring*',
    note: 'Translate the words inside; keep the markers. A single * is italic, a double ** is bold. Both must open and close in the same paragraph — a blank line ends them.',
  },
  {
    name: 'Line break',
    syntax: 'First line of the signature.<br>\nSecond line of the signature.',
    render: 'First line of the signature.<br>\nSecond line of the signature.',
    note: 'A single <br> ends a line without starting a new paragraph. Signatures and address blocks are built from it.',
  },
  {
    name: 'Quotation',
    syntax: '> "Be still, and know that I am God." — Psalm 46:10\n\n> Fr. James Kubicki<br>\n> Chaplain, Exodus 90<br>',
    render: '> "Be still, and know that I am God." — Psalm 46:10\n\n> Fr. James Kubicki<br>\n> Chaplain, Exodus 90<br>',
    note: 'Scripture and attributions are quoted lines. An attribution gets its own quoted line, with each line ended by a <br>.',
  },
  {
    name: 'Lists',
    syntax:
      '* Prayer — twenty minutes of silence\n* Fraternity — the brother you call\n\n1. Read the day’s reflection first.\n2. Sit with the Scripture passage.',
    render:
      '* Prayer — twenty minutes of silence\n* Fraternity — the brother you call\n\n1. Read the day’s reflection first.\n2. Sit with the Scripture passage.',
    note: 'Bullets use *, matching every list in the library. Numbered lists carry order that matters; keep the source’s count of items.',
  },
  {
    name: 'Links',
    syntax: 'read the [full Exodus 90 description](https://exodus90.com/about) before you begin',
    render: 'read the [full Exodus 90 description](https://exodus90.com/about) before you begin',
    note: 'Translate the link text, never the URL. A raw anchor keeps its tag and class: <a href="…" class="black-button">Shop the collection</a>.',
  },
  {
    name: 'Images',
    syntax:
      '![The Judean wilderness at first light](https://…/desert-dawn.jpg)\n\n<div class="center-image">\n  <img src="https://…/wreath.jpg" alt="An Advent wreath">\n</div>',
    note: 'Translate the alt text — it is what a reader hears, and what the archive keeps if the image is lost. Keep the URL, and keep the <div class="center-image"> wrapper on a centred image.',
  },
  {
    name: 'Cards',
    syntax:
      '<div class="card">\n  <img src="https://…/portrait.jpg" alt="Profile Picture">\n  <h2>William C. Roche</h2>\n  <p class="date">1948 — 2025</p>\n  <p class="link"><a href="https://…">Read his obituary</a></p>\n</div>',
    note: 'Profile blocks for the Book of the Dead and the fraternity pages. Keep every tag and class; translate the prose between them, and leave names and dates as they are.',
  },
  {
    name: 'Coloured spans',
    syntax:
      '<span style="color:#CC0000;">All stand.</span>\n\n<span style="display:block;color:#CC0000;" data-read="false">Marked unread until the app sets this attribute.</span>',
    note: 'Rubrics are set in red, the way a missal sets them. Keep the style exactly; translate the words. A span carrying data-read is app state — carry the whole tag over untouched.',
  },
  {
    name: 'Embedded video',
    syntax:
      '<iframe width="100%" height="315" src="https://www.youtube.com/embed/H8FST0PI1ys" title="YouTube video player" frameborder="0" allowfullscreen></iframe>',
    note: 'Carry the whole tag over as it is, URL included. Nothing inside it is prose.',
  },
  {
    name: 'Divider',
    syntax: '---',
    render: '---',
    note: 'On its own line, it separates the body from what follows it. Every file in the library uses one at least once.',
  },
];

const HOUSE_STYLE = [
  'One final newline, and no trailing spaces on any line.',
  '* for bullets, and “typographic” quotes rather than straight ones.',
  'One blank line between blocks — no more, no fewer.',
];

const LINT_CHECKS = [
  'Every frontmatter key the source defines exists here, spelled the same.',
  'hero, day, verse_tag and lectionary number match the source exactly.',
  'The number and level of headings match the source.',
  'Every link and image URL matches the source.',
  'Emphasis and code markers open and close in the same paragraph.',
];

function Example({ construct }: { construct: Construct }) {
  if (!construct.render) {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs leading-relaxed whitespace-pre">
        {construct.syntax}
      </pre>
    );
  }

  return (
    // A guide is read with a draft in the other pane, so an example link must
    // not navigate away from it. Clicks are swallowed; the colour and underline
    // that show it is a link still render.
    <div
      onClickCapture={(event) => event.preventDefault()}
      className="grid overflow-hidden rounded-md border bg-background sm:grid-cols-2 sm:divide-x"
    >
      <pre className="overflow-x-auto bg-muted/40 px-2.5 py-1.5 font-mono text-xs leading-relaxed whitespace-pre">
        {construct.syntax}
      </pre>
      <div className="px-2.5 py-1.5">
        <MarkdownPreview content={construct.render} className="md-example" />
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The guide itself. It is mounted once, by the editor, and opened from
 * anywhere: its button in the panel, and the action on every lint finding —
 * which is why the open flag lives in the store rather than beside a trigger.
 */
export function MarkdownGuideDialog() {
  const open = useEditorStore((s) => s.markdownGuideOpen);
  const setOpen = useEditorStore((s) => s.setMarkdownGuideOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Markdown guide</DialogTitle>
          <DialogDescription>
            The content library is written in Markdown. Translate the words; carry the structure over exactly as the
            source has it — the published app renders this the same way the Live pane does.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium">Translate</span>
            <span className="text-muted-foreground">
              Prose, headings, link text, image alt text, attribution lines.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Carry over as it is</span>
            <span className="text-muted-foreground">
              URLs, hero and day values, frontmatter keys, HTML tags and their attributes, the number and level of
              headings.
            </span>
          </div>
        </div>

        <Separator />

        <p className="text-sm text-muted-foreground">
          Every construct the library uses: the Markdown you write on the left, what it renders to on the right.
        </p>

        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-[9rem_1fr]">
          {CONSTRUCTS.map((construct) => (
            <div key={construct.name} className="contents">
              <div className="text-sm font-medium sm:pt-1">{construct.name}</div>
              <div className="flex min-w-0 flex-col gap-2">
                <Example construct={construct} />
                <p className="text-sm text-muted-foreground">{construct.note}</p>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="grid gap-5 sm:grid-cols-2">
          <Checklist title="What the editor checks" items={LINT_CHECKS} />
          <Checklist title="House style" items={HOUSE_STYLE} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A way in: `icon` is the compact affordance for a toolbar, `button` is the
 * labelled row the Document info panel uses, where actions read as a list.
 */
export function MarkdownGuide({ variant = 'icon' }: { variant?: 'icon' | 'button' }) {
  const setOpen = useEditorStore((s) => s.setMarkdownGuideOpen);

  if (variant === 'button') {
    return (
      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
        <BookOpen />
        Markdown guide
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label="Markdown guide"
      title="Markdown guide"
      onClick={() => setOpen(true)}
    >
      <BookOpen />
    </Button>
  );
}
