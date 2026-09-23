'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Lock, ScrollText, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { updateLanguageInstructionsAction } from '@/domain/language/language.actions';
import { TRANSLATION_INSTRUCTIONS_MAX_LENGTH } from '@/domain/language/language.types';
import { buildSystemPromptSegments, type PromptFormat } from '@/domain/translation/translation.prompt';
import { capture } from '@/lib/analytics';

interface InstructionsLanguage {
  id: string;
  code: string;
  name: string;
  translationInstructions: string | null;
  canEdit: boolean;
}

export default function InstructionsClient({
  languages,
  selectedCode,
}: {
  languages: InstructionsLanguage[];
  selectedCode: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(selectedCode);
  const language = languages.find((candidate) => candidate.code === code) ?? null;

  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(languages.map((l) => [l.id, l.translationInstructions ?? ''])),
  );
  const [saving, setSaving] = useState(false);
  const [format, setFormat] = useState<PromptFormat>('markdown');

  const draft = language ? (drafts[language.id] ?? '') : '';
  const saved = language?.translationInstructions ?? '';
  const dirty = draft !== saved;
  const tooLong = draft.length > TRANSLATION_INSTRUCTIONS_MAX_LENGTH;

  // The very function the translation request uses, so the preview cannot
  // describe a prompt that is not the one being sent.
  const segments = useMemo(
    () =>
      language
        ? buildSystemPromptSegments({
            targetLanguageName: language.name,
            targetLanguageCode: language.code,
            languageInstructions: draft,
            format,
          })
        : null,
    [language, draft, format],
  );

  const handleSave = async () => {
    if (!language) return;

    setSaving(true);
    try {
      await updateLanguageInstructionsAction(language.id, { translationInstructions: draft });
      capture('language_instructions_saved', { language: language.code });
      toast.success(`${language.name} instructions saved`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the instructions');
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = (next: string) => {
    setCode(next);
    // The language is in the URL so a link can open one directly — the health
    // pill on /languages points straight here.
    router.replace(`/instructions?lang=${encodeURIComponent(next)}`, { scroll: false });
  };

  if (!language) {
    return (
      <>
        <PageHeader title="AI instructions" description="Guidance handed to the AI translator, per language." />
        <div className="px-4 py-12 text-center">
          <ScrollText className="text-muted-foreground mx-auto mb-2 size-8" />
          <p className="text-muted-foreground text-sm">
            You are not assigned to any language yet. Ask an administrator to add you to one.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI instructions"
        description="Guidance handed to the AI translator, per language."
        actions={
          languages.length > 1 ? (
            <Select
              value={language.code}
              onValueChange={(value) => value && handleLanguageChange(value)}
              items={Object.fromEntries(languages.map((l) => [l.code, l.name]))}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((candidate) => (
                  <SelectItem key={candidate.code} value={candidate.code}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary">{language.name}</Badge>
          )
        }
      />

      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-2.5 lg:max-w-2xl lg:flex-1">
          <p className="text-muted-foreground text-xs leading-5">
            {language.canEdit ? (
              <>
                Appended to the system prompt on every AI translation{' '}
                <span className="text-foreground font-medium">into</span> {language.name}. The base prompt is fixed in
                code.
              </>
            ) : (
              <>
                What the AI is told when translating <span className="text-foreground font-medium">into</span>{' '}
                {language.name}. Useful when a draft phrases something unexpectedly.
              </>
            )}
          </p>

          <Textarea
            value={draft}
            readOnly={!language.canEdit}
            disabled={!language.canEdit}
            onChange={(event) => setDrafts((prev) => ({ ...prev, [language.id]: event.target.value }))}
            placeholder="Scripture tradition, terminology, register — anything the AI should know about this language."
            rows={14}
            aria-invalid={tooLong}
            className="resize-y"
          />

          {language.canEdit ? (
            <div className="flex items-center justify-between gap-3">
              <span className={cn('text-xs', tooLong ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                {draft.length.toLocaleString()} / {TRANSLATION_INSTRUCTIONS_MAX_LENGTH.toLocaleString()}
              </span>
              <div className="flex items-center gap-3">
                {dirty && <span className="text-muted-foreground text-xs">Unsaved changes</span>}
                <Button onClick={handleSave} disabled={saving || !dirty || tooLong}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-muted/40 flex items-start gap-2 rounded-lg border px-3 py-2.5">
              <Lock className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
              <p className="text-muted-foreground text-xs">
                Read-only. The {language.name} Language Manager and administrators can edit these instructions.
              </p>
            </div>
          )}
        </div>

        <div className="bg-muted/30 min-w-0 overflow-hidden rounded-xl border lg:flex-1">
          <div className="flex flex-col gap-3 border-b px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">What the AI actually receives</p>
              <p className="text-muted-foreground text-xs">The assembled system prompt, live as you type</p>
            </div>
            <div className="flex gap-1">
              {(['markdown', 'yaml'] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={format === option ? 'default' : 'outline'}
                  onClick={() => setFormat(option)}
                >
                  {option === 'markdown' ? 'Markdown' : 'YAML'}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 p-3.5">
            {/* Keyed so switching format re-applies the default: the 5-line
                YAML prompt shows, the 86-line Markdown one stays folded. */}
            <BasePromptBlock key={format} format={format} text={segments!.base} />

            <PromptBlock label="Target language line">{segments!.targetLanguage}</PromptBlock>

            <PromptBlock label="Custom instructions" emphasised note="the part this page owns">
              {segments!.customInstructions ?? (
                <span className="text-muted-foreground italic">
                  Nothing is appended — this language has no instructions.
                </span>
              )}
            </PromptBlock>

            {format === 'yaml' && (
              <div className="border-warning/40 bg-warning/10 flex items-start gap-2 rounded-lg border px-3 py-2.5">
                <TriangleAlert className="text-warning mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p className="text-warning text-xs leading-4">
                  Your instructions are appended here too. Root files like <code>disciplines.yml</code> are keys and
                  values rather than prose — guidance about tone or sentence length can corrupt them.
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-xs">
              Which base prompt a document gets is decided by its filename: anything but <code>.yml</code> or{' '}
              <code>.yaml</code> gets the Markdown one.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function BasePromptBlock({ format, text }: { format: PromptFormat; text: string }) {
  // The Markdown prompt is 86 lines and would bury the part that matters, so it
  // starts collapsed; the YAML one is five lines and simply shows.
  const [open, setOpen] = useState(format === 'yaml');
  const lineCount = text.split('\n').length;

  return (
    <div className="bg-background rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} aria-hidden />
          Base prompt · {format === 'yaml' ? 'YAML' : 'Markdown'}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {lineCount} lines · fixed in code
        </span>
      </button>
      {open && (
        <pre className="text-muted-foreground max-h-64 overflow-auto px-3 pb-3 pl-8 font-mono text-[11px] leading-4 whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}

function PromptBlock({
  label,
  note,
  emphasised,
  children,
}: {
  label: string;
  note?: string;
  emphasised?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('bg-background rounded-lg border px-3 py-2.5', emphasised && 'border-foreground')}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-[10.5px] font-semibold tracking-wide uppercase',
            emphasised ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {note && <span className="text-muted-foreground text-[10px]">{note}</span>}
      </div>
      <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-4 whitespace-pre-wrap">{children}</pre>
    </div>
  );
}
