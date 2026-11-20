'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { catalogMeta, defaultMeta } from '@/domain/bible/lib/translations';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { codeFromFileName, formatBytes, formatCount, gzipFile, pluralize } from './bible-admin';

type Mode = 'translation' | 'versification';
type Phase = 'idle' | 'compressing' | 'uploading' | 'done' | 'error';

interface TranslationResult {
  ok: true;
  code: string;
  books: number;
  verses: number;
  declaredBooks: number;
  replaced: boolean;
  warnings: string[];
}

interface VersificationResult {
  ok: true;
  code: string;
  declaredBooks: number;
  skipped: string[];
}

type ImportResult = TranslationResult | VersificationResult;


export function ImportBibleDialog({
  open,
  onOpenChange,
  translations,
  initialMode = 'translation',
  initialCode,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  translations: BibleTranslationDto[];
  initialMode?: Mode;
  initialCode?: string;
  onImported: () => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [translationFile, setTranslationFile] = useState<File | null>(null);
  const [versificationFile, setVersificationFile] = useState<File | null>(null);
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState('');
  const [languageCode, setLanguageCode] = useState('');
  const [languageName, setLanguageName] = useState('');
  const [role, setRole] = useState<'auto' | 'source' | 'target'>('auto');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const targets = translations.filter((t) => t.role === 'target');
  const detectedCode = code.trim() || (translationFile ? codeFromFileName(translationFile.name) : null);
  const known = detectedCode ? catalogMeta(detectedCode) : null;
  // What an empty field becomes: the catalog's value, or one guessed from the code.
  const hint = detectedCode ? defaultMeta(detectedCode, languageCode) : null;
  const roleItems = {
    auto: `Automatic (${hint?.role === 'source' ? 'Source' : 'Target'})`,
    target: 'Target',
    source: 'Source',
  };
  const existing = detectedCode ? translations.find((t) => t.code === detectedCode) : undefined;
  const busy = phase === 'compressing' || phase === 'uploading';
  const canSubmit = mode === 'translation' ? Boolean(translationFile) : Boolean(versificationFile && code);

  const reset = () => {
    setTranslationFile(null);
    setVersificationFile(null);
    setCode(initialCode ?? '');
    setName('');
    setLanguageCode('');
    setLanguageName('');
    setRole('auto');
    setDetailsOpen(false);
    setPhase('idle');
    setMessage('');
    setResult(null);
  };

  const handleOpenChange = (next: boolean) => {
    // Closing mid-upload would hide the outcome of an import that still runs.
    if (!next && busy) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setResult(null);
    try {
      setPhase('compressing');
      setMessage('Compressing…');
      const form = new FormData();
      const files: [string, File | null][] =
        mode === 'translation'
          ? [
              ['translation', translationFile],
              ['versification', versificationFile],
            ]
          : [['versification', versificationFile]];
      let sent = 0;
      for (const [field, file] of files) {
        if (!file) continue;
        const packed = await gzipFile(file, file.name);
        sent += packed.blob.size;
        const type = packed.compressed ? 'application/gzip' : file.type || 'application/json';
        form.append(field, new File([packed.blob], packed.name, { type }));
      }
      const fields =
        mode === 'translation'
          ? { code, name, languageCode, languageName, role: role === 'auto' ? '' : role }
          : { code };
      for (const [key, value] of Object.entries(fields)) {
        if (value.trim()) form.append(key, value.trim());
      }

      setPhase('uploading');
      setMessage(
        mode === 'translation'
          ? `Uploading ${formatBytes(sent)} and importing. A full Bible takes up to a minute.`
          : `Uploading ${formatBytes(sent)} and replacing the declarations…`,
      );
      const response = await fetch('/api/admin/bible/import', { method: 'POST', body: form });
      const body = (await response.json().catch(() => null)) as ImportResult | { error?: string } | null;
      if (!response.ok || !body || !('ok' in body)) {
        const error = body && 'error' in body && body.error ? body.error : `The import failed (${response.status}).`;
        setPhase('error');
        setMessage(error);
        return;
      }
      setResult(body);
      setPhase('done');
      setMessage(`Imported ${body.code}.`);
      onImported();
    } catch {
      setPhase('error');
      setMessage('The upload did not reach the server. Check the connection and try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a Bible</DialogTitle>
          <DialogDescription>
            Upload a bible-api normalized JSON file. Importing a code that exists replaces it.
          </DialogDescription>
        </DialogHeader>

        {phase === 'done' && result ? (
          <ImportSummary result={result} />
        ) : (
          <form id={`${id}-form`} onSubmit={submit} className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="translation" disabled={busy}>
                  Translation
                </TabsTrigger>
                <TabsTrigger value="versification" disabled={busy || targets.length === 0}>
                  Versification only
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === 'translation' ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-translation`}>Translation file</FieldLabel>
                  <Input
                    id={`${id}-translation`}
                    type="file"
                    accept=".json,.gz,application/json,application/gzip"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setTranslationFile(file);
                      // A code outside the catalog needs at least its name, which is under Details.
                      const guess = code.trim() || (file ? codeFromFileName(file.name) : null);
                      if (guess && !catalogMeta(guess)) setDetailsOpen(true);
                    }}
                  />
                  <FieldDescription>
                    <code>data/normalized/&lt;code&gt;.json</code> from bible-api.
                    {existing && ` Replaces ${existing.name}; its versification is kept unless you add a file below.`}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-versification`}>Versification file (optional)</FieldLabel>
                  <Input
                    id={`${id}-versification`}
                    type="file"
                    accept=".json,.gz,application/json,application/gzip"
                    disabled={busy}
                    onChange={(e) => setVersificationFile(e.target.files?.[0] ?? null)}
                  />
                  <FieldDescription>
                    <code>data/versification/&lt;code&gt;.json</code>. Without it, a new target has no book declared and
                    resolves nothing until you declare books.
                  </FieldDescription>
                </Field>

                <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                  <CollapsibleTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 group/details text-muted-foreground"
                      />
                    }
                  >
                    <ChevronDown
                      className="transition-transform group-data-panel-open/details:rotate-180"
                      aria-hidden="true"
                    />
                    Details
                    {known && <span className="font-normal">(known code: {known.code})</span>}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-2">
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      {detectedCode && !known
                        ? `'${detectedCode}' isn't one of the seven built-in Bibles, so give its name. A field left empty takes the value shown in it.`
                        : 'A field left empty takes the value shown in it, from the file and the built-in catalog of the seven bible-api translations.'}
                    </p>
                    <MetaInput
                      id={`${id}-code`}
                      label="Code"
                      value={code}
                      onChange={setCode}
                      placeholder={detectedCode ?? 'sar-hr'}
                      disabled={busy}
                    />
                    <MetaInput
                      id={`${id}-language-code`}
                      label="Language code"
                      value={languageCode}
                      onChange={setLanguageCode}
                      placeholder={hint?.languageCode || 'hr'}
                      disabled={busy}
                    />
                    <MetaInput
                      id={`${id}-name`}
                      label="Name"
                      value={name}
                      onChange={setName}
                      placeholder={hint?.name || 'Full name of the translation'}
                      disabled={busy}
                      className="sm:col-span-2"
                    />
                    <MetaInput
                      id={`${id}-language-name`}
                      label="Language name"
                      value={languageName}
                      onChange={setLanguageName}
                      placeholder={hint?.languageName || 'Hrvatski'}
                      disabled={busy}
                    />
                    <Field>
                      <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
                      <Select
                        value={role}
                        onValueChange={(v) => setRole((v as typeof role) ?? 'auto')}
                        items={roleItems}
                        disabled={busy}
                      >
                        <SelectTrigger id={`${id}-role`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(roleItems).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-target`}>Translation</FieldLabel>
                  <Select
                    value={code || null}
                    onValueChange={(v) => setCode(v ?? '')}
                    items={Object.fromEntries(targets.map((t) => [t.code, `${t.name} (${t.code})`]))}
                    disabled={busy}
                  >
                    <SelectTrigger id={`${id}-target`} className="w-full">
                      <SelectValue placeholder="Choose a target translation" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          {t.name} ({t.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-versification-only`}>Versification file</FieldLabel>
                  <Input
                    id={`${id}-versification-only`}
                    type="file"
                    accept=".json,.gz,application/json,application/gzip"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setVersificationFile(file);
                      const guess = file ? codeFromFileName(file.name) : null;
                      if (!code && guess && targets.some((t) => t.code === guess)) setCode(guess);
                    }}
                  />
                  <FieldDescription>
                    Replaces every declaration, mapping row and review mark of this translation.
                  </FieldDescription>
                </Field>
              </>
            )}
          </form>
        )}

        <div aria-live="polite" role="status" className="min-h-5 text-sm">
          {busy && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {message}
            </span>
          )}
          {phase === 'error' && (
            <span className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {message}
            </span>
          )}
        </div>

        <DialogFooter>
          {phase === 'done' ? (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                Import another
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" form={`${id}-form`} disabled={!canSubmit || busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {mode === 'translation' ? 'Import' : 'Replace versification'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetaInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </Field>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  const warnings =
    'warnings' in result
      ? result.warnings
      : result.skipped.map((u) => `${u} is not in the translation and was skipped.`);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-medium">
            {'books' in result
              ? `${result.replaced ? 'Replaced' : 'Imported'} ${result.code}`
              : `Versification of ${result.code} replaced`}
          </p>
          <p className="text-sm text-muted-foreground">
            {'books' in result
              ? `${pluralize(result.books, 'book')}, ${formatCount(result.verses)} verses, ${pluralize(result.declaredBooks, 'book')} declared.`
              : `${pluralize(result.declaredBooks, 'book')} declared.`}
          </p>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {pluralize(warnings.length, 'warning')}
          </p>
          <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {'books' in result && result.declaredBooks === 0 && (
        <Badge variant="warning">No books declared: this translation resolves nothing yet</Badge>
      )}
    </div>
  );
}
