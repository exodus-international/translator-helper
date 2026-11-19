'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { resolvePassagesAction } from '@/domain/bible/bible.actions';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import { MAX_REFS, type PassageResult } from '@/domain/bible/bible.types';
import { Loader2, Play } from 'lucide-react';
import { useId, useState } from 'react';
import { passageStatusBadge, pluralize, splitReferences } from './bible-admin';

const EXAMPLES = 'John 3:16-17\nPs 51:1-4\n1 Cor 13:4-7; Rom 8:28\nSir 2:1\nIv 3,16';

export function PlaygroundTab({ translation }: { translation: BibleTranslationDto }) {
  const id = useId();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PassageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTarget = translation.role === 'target';
  const refs = splitReferences(input);

  const resolve = async () => {
    if (refs.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { results } = await resolvePassagesAction({
        refs: refs.slice(0, MAX_REFS),
        translation: translation.code,
        include: { text: true, rendered: true, verses: false, source: isTarget },
      });
      setResults(results);
    } catch {
      setError('The references could not be resolved. Check that each line is under 200 characters.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void resolve();
        }}
        className="max-w-2xl space-y-3"
      >
        <Field>
          <FieldLabel htmlFor={`${id}-refs`}>References</FieldLabel>
          <Textarea
            id={`${id}-refs`}
            value={input}
            rows={5}
            placeholder={EXAMPLES}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void resolve();
              }
            }}
          />
          <FieldDescription>
            One per line, or separated by semicolons. Written against RSV-CE, resolved in {translation.name}
            {isTarget && ', with the RSV-CE text beside it'}. Ctrl+Enter resolves.
          </FieldDescription>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || refs.length === 0}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play />}
            Resolve
          </Button>
          {input === '' && (
            <Button type="button" variant="ghost" onClick={() => setInput(EXAMPLES)}>
              Use examples
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {refs.length > MAX_REFS
              ? `Only the first ${MAX_REFS} of ${refs.length} references are resolved.`
              : refs.length > 0 && pluralize(refs.length, 'reference')}
          </span>
        </div>
      </form>

      <div aria-live="polite" className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {results?.map((r, i) => (
          <PassageCard key={`${i}-${r.ref}`} result={r} withSource={isTarget} lang={translation.language} />
        ))}
      </div>
    </div>
  );
}

function PassageCard({ result, withSource, lang }: { result: PassageResult; withSource: boolean; lang: string }) {
  const badge = passageStatusBadge(result.status);
  return (
    <Card className="gap-3 px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{result.ref}</span>
        <Badge variant={badge.variant} title={result.status}>
          {badge.label}
        </Badge>
        {result.rendered && result.rendered !== result.ref && (
          <span className="text-sm text-muted-foreground">
            cited as <span className="font-medium text-foreground">{result.rendered}</span>
          </span>
        )}
      </div>
      {(result.text || result.source?.text) && (
        <div className={withSource ? 'grid gap-4 md:grid-cols-2' : undefined}>
          <PassageText label={result.rendered ?? result.translation ?? 'Text'} text={result.text} lang={lang} />
          {withSource && (
            <PassageText
              label={`RSV-CE ${result.source?.rendered ?? ''}`.trim()}
              text={result.source?.text}
              lang="en"
            />
          )}
        </div>
      )}
      {result.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PassageText({ label, text, lang }: { label: string; text?: string; lang?: string }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      {text ? (
        <blockquote lang={lang} className="max-w-prose font-serif leading-relaxed whitespace-pre-line">
          {text}
        </blockquote>
      ) : (
        <p className="text-sm text-muted-foreground">No text.</p>
      )}
    </figure>
  );
}
