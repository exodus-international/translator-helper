'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';

import { RawEditorPane } from '@/components/raw-editor-panel';
import { MarkdownPreview } from '@/components/markdown-preview';
import { describeRemovedLayout } from '@/components/standard-translations/layout-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import { stripLayout, type LayoutPart } from '@/domain/standard-translation/match-form';
import {
  createStandardTranslationAction,
  updateStandardTranslationAction,
} from '@/domain/standard-translation/standard-translation.actions';
import type { StandardTranslationRow } from '@/domain/standard-translation/standard-translation.repository';

const GENERAL = 'general';

interface StandardTranslationProject {
  id: string;
  name: string;
  status: SourceProjectStatus;
}

interface StandardTranslationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The language the entry is written for. */
  language: { id: string; name: string };
  /** The projects an entry of the language can be limited to. */
  projects: StandardTranslationProject[];
  /** The entry to edit; without one the dialog adds a new entry. */
  entry?: StandardTranslationRow | null;
  /** Called with what the action returned, once it is saved. */
  onSaved?: (saved: StandardTranslationRow) => void;
  /** The actions, replaceable so a test sees what would be sent. */
  create?: typeof createStandardTranslationAction;
  update?: typeof updateStandardTranslationAction;
}

/**
 * Adding or editing one standard translation. Opened from the Standard
 * translations page, and meant for the editor too, so it calls the actions
 * itself and only reports what was saved.
 *
 * An entry stores wording only: both texts go through `stripLayout` before
 * they are sent, and the dialog says what that leaves out as soon as the
 * typed text has any layout, rather than refusing to save.
 */
export function StandardTranslationDialog({ open, onOpenChange, ...props }: StandardTranslationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so every opening starts from the entry. */}
        <EntryForm {...props} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  language,
  projects,
  entry,
  onSaved,
  onCancel,
  create = createStandardTranslationAction,
  update = updateStandardTranslationAction,
}: Omit<StandardTranslationDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState(entry?.name ?? '');
  const [sourceText, setSourceText] = useState(entry?.sourceText ?? '');
  const [targetText, setTargetText] = useState(entry?.targetText ?? '');
  const [scope, setScope] = useState(entry?.sourceProject?.id ?? GENERAL);
  const [fixedForm, setFixedForm] = useState(entry?.fixedForm ?? false);
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = stripLayout(sourceText);
  const target = stripLayout(targetText);
  const removed = [...new Set<LayoutPart>([...source.removed, ...target.removed])];
  const layoutNotice = describeRemovedLayout(removed);
  const complete = source.text.trim() !== '' && target.text.trim() !== '';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    // No `languageId` on an update: an entry stays in its language, and the
    // update schema refuses the field rather than ignoring it.
    const fields = {
      sourceProjectId: scope === GENERAL ? null : scope,
      name,
      sourceText: source.text,
      targetText: target.text,
      fixedForm,
      note,
    };
    try {
      const saved = entry ? await update(entry.id, fields) : await create({ languageId: language.id, ...fields });
      onSaved?.(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The standard translation could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const targetLabel = `Standard translation · ${language.name}`;

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-6">
      <DialogHeader>
        <DialogTitle>{entry ? 'Edit standard translation' : 'Add standard translation'}</DialogTitle>
        <DialogDescription>
          AI translation into {language.name} will use this text instead of translating it again.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>
            Name <span className="text-muted-foreground font-normal">(optional)</span>
          </FieldLabel>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-source`}>Source · English</FieldLabel>
            <Textarea
              id={`${id}-source`}
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              className="min-h-40 font-mono"
            />
          </Field>

          <Field className="min-w-0">
            <FieldLabel>{targetLabel}</FieldLabel>
            <Tabs defaultValue="write">
              <TabsList variant="line">
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <RawEditorPane
                  value={targetText}
                  onChange={setTargetText}
                  language="markdown"
                  lint={false}
                  ariaLabel={targetLabel}
                  className="h-40 overflow-hidden rounded-md border"
                />
              </TabsContent>
              <TabsContent value="preview">
                <MarkdownPreview content={target.text} className="prose h-40 overflow-y-auto rounded-md border p-3" />
              </TabsContent>
            </Tabs>
          </Field>
        </div>

        {layoutNotice && (
          <div role="status" className="border-info/30 bg-info/10 flex items-start gap-2 rounded-lg border px-3 py-2.5">
            <Info className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-muted-foreground text-sm">{layoutNotice}</p>
          </div>
        )}

        <FieldSet>
          <FieldLegend variant="label">Use it in</FieldLegend>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            <ScopeChoice
              name={`${id}-scope`}
              value={GENERAL}
              checked={scope === GENERAL}
              onSelect={setScope}
              title={`All projects in ${language.name}`}
              description="A general standard translation"
            />
            {projects.map((project) => (
              <ScopeChoice
                key={project.id}
                name={`${id}-scope`}
                value={project.id}
                checked={scope === project.id}
                onSelect={setScope}
                title={`Only ${project.name}`}
                description="Takes precedence over a general one with the same source"
                complete={project.status === SourceProjectStatus.COMPLETE}
              />
            ))}
          </div>
        </FieldSet>

        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-fixed-form`}
            checked={fixedForm}
            onCheckedChange={(checked) => setFixedForm(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${id}-fixed-form`}>Fixed form</FieldLabel>
            <FieldDescription>
              Use exactly as written, even inside a sentence. For words that never change form, like “Amen” or
              “Exodus 90”.
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-note`}>
            Note <span className="text-muted-foreground font-normal">(optional)</span>
          </FieldLabel>
          <Input
            id={`${id}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. the liturgical form, not the devotional one"
          />
        </Field>

        {error && <FieldError className="whitespace-pre-line">{error}</FieldError>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !complete}>
          {saving ? 'Saving…' : 'Save standard translation'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One "Use it in" option, as a card the whole of which selects it. */
function ScopeChoice({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  complete,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  description: string;
  complete?: boolean;
}) {
  return (
    <FieldLabel>
      <Field orientation="horizontal" data-checked={checked || undefined}>
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={() => onSelect(value)}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <FieldContent>
          <FieldTitle>
            {title}
            {complete && <Badge variant="secondary">Complete</Badge>}
          </FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}
