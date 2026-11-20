'use client';

// The browser side of bible.service: same names on purpose.
// fallow-ignore-file duplicate-export

import {
  bibleForLanguageAction,
  identifyPassageAction,
  resolvePassagesAction,
  validateReferencesAction,
} from '@/domain/bible/bible.actions';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import { MAX_REFS, type PassageResult, type ReferenceCheck } from '@/domain/bible/bible.types';

/**
 * The editor's side of the Bible: reference checks, passages and the Bible a
 * language has, each fetched once per page and shared by the underlines, the
 * hover card and the Scripture check. Requests made in the same moment go out
 * as one call, and a failed request is retried only after a pause, so a Bible
 * that cannot be read does not turn every keystroke into a request.
 */

const RETRY_AFTER_MS = 30_000;
const BATCH_DELAY_MS = 25;
const MAX_ENTRIES = 2_000;

type Entry<T> = { state: 'pending' } | { state: 'done'; value: T } | { state: 'failed'; at: number };

class Cache<T> {
  private entries = new Map<string, Entry<T>>();
  private waiters = new Map<string, Array<(value: T | undefined) => void>>();
  private queue = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `fetchBatch` answers what it can; keys it `deferred` (a request reads a
   * limited number of verses) are asked again in the next batch, not failed.
   */
  constructor(private readonly fetchBatch: (keys: string[]) => Promise<{ found: Map<string, T>; deferred: string[] }>) {}

  peek(key: string): T | undefined {
    const entry = this.entries.get(key);
    return entry?.state === 'done' ? entry.value : undefined;
  }

  /** Lets failed keys be asked again at once, for a person's "Try again". */
  forgetFailed() {
    for (const [key, entry] of this.entries) if (entry.state === 'failed') this.entries.delete(key);
  }

  /** Whether asking again would send a request. */
  isSettled(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    return entry.state === 'done' || entry.state === 'pending' || Date.now() - entry.at < RETRY_AFTER_MS;
  }

  get(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (entry?.state === 'done') return Promise.resolve(entry.value);
    if (entry?.state === 'failed' && Date.now() - entry.at < RETRY_AFTER_MS) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.waiters.set(key, [...(this.waiters.get(key) ?? []), resolve]);
      if (entry?.state === 'pending') return;
      this.entries.set(key, { state: 'pending' });
      this.queue.add(key);
      this.timer ??= setTimeout(() => this.flush(), BATCH_DELAY_MS);
    });
  }

  async getMany(keys: string[]): Promise<Map<string, T>> {
    const values = await Promise.all(keys.map((k) => this.get(k)));
    const out = new Map<string, T>();
    keys.forEach((k, i) => {
      const v = values[i];
      if (v !== undefined) out.set(k, v);
    });
    return out;
  }

  private async flush() {
    this.timer = null;
    const keys = [...this.queue];
    this.queue.clear();
    for (let i = 0; i < keys.length; i += MAX_REFS) {
      const chunk = keys.slice(i, i + MAX_REFS);
      let found: Map<string, T> | null = null;
      let deferred = new Set<string>();
      try {
        const answer = await this.fetchBatch(chunk);
        found = answer.found;
        // A batch that got nowhere is failed, so a server that defers everything cannot loop.
        if (answer.found.size > 0) deferred = new Set(answer.deferred);
      } catch (error) {
        console.error('[Scripture] Bible request failed:', error instanceof Error ? error.message : error);
      }
      for (const key of chunk) {
        if (deferred.has(key)) {
          this.queue.add(key);
          continue;
        }
        const value = found?.get(key);
        this.entries.set(key, value === undefined ? { state: 'failed', at: Date.now() } : { state: 'done', value });
        for (const resolve of this.waiters.get(key) ?? []) resolve(value);
        this.waiters.delete(key);
      }
    }
    if (this.queue.size) this.timer ??= setTimeout(() => this.flush(), 0);
    if (this.entries.size > MAX_ENTRIES) {
      for (const key of [...this.entries.keys()].slice(0, this.entries.size - MAX_ENTRIES)) {
        if (this.entries.get(key)?.state !== 'pending') this.entries.delete(key);
      }
    }
  }
}

const checks = new Cache<ReferenceCheck>(async (refs) => {
  const { results, deferred } = await validateReferencesAction({ refs });
  return { found: new Map(results.map((r) => [r.ref, r])), deferred };
});

const SEP = '\u0000';
const passages = new Cache<PassageResult>(async (keys) => {
  // One translation per call: the keys of a batch are split by it.
  const byTranslation = new Map<string, string[]>();
  for (const key of keys) {
    const [translation, ref] = key.split(SEP);
    byTranslation.set(translation, [...(byTranslation.get(translation) ?? []), ref]);
  }
  const found = new Map<string, PassageResult>();
  const deferred: string[] = [];
  for (const [translation, refs] of byTranslation) {
    const answer = await resolvePassagesAction({
      refs,
      translation,
      include: { rendered: true, text: true, verses: true, source: true },
    });
    for (const r of answer.results) found.set(`${translation}${SEP}${r.ref}`, r);
    for (const ref of answer.deferred) deferred.push(`${translation}${SEP}${ref}`);
  }
  return { found, deferred };
});

/** Whether each ref is a Bible reference at all, checked against RSV-CE. */
export const checkReference = (ref: string) => checks.get(ref);
export const peekReferenceCheck = (ref: string) => checks.peek(ref);
export const isReferenceCheckSettled = (ref: string) => checks.isSettled(ref);
export const checkReferences = (refs: string[]) => checks.getMany(refs);

/** Passages in a language's (or translation's) Bible, with the RSV-CE side. */
export const resolvePassage = (ref: string, translation: string) => passages.get(`${translation}${SEP}${ref}`);
export const peekPassage = (ref: string, translation: string) => passages.peek(`${translation}${SEP}${ref}`);
export const isPassageSettled = (ref: string, translation: string) => passages.isSettled(`${translation}${SEP}${ref}`);
/** After a failure, the next lookups go out at once instead of after a pause. */
export const retryFailedPassages = () => passages.forgetFailed();

export async function resolvePassages(refs: string[], translation: string): Promise<Map<string, PassageResult>> {
  const found = await passages.getMany(refs.map((ref) => `${translation}${SEP}${ref}`));
  return new Map([...found].map(([key, value]) => [key.slice(translation.length + 1), value]));
}

const bibles = new Map<string, Promise<BibleTranslationDto | null>>();

/** The Bible a language has, or null when none is imported. Throws when it cannot be read. */
export function bibleForLanguage(languageCode: string): Promise<BibleTranslationDto | null> {
  const key = languageCode.toLowerCase();
  let pending = bibles.get(key);
  if (!pending) {
    pending = bibleForLanguageAction(key);
    pending.catch(() => bibles.delete(key));
    bibles.set(key, pending);
  }
  return pending;
}

const identified = new Map<string, Promise<string | null>>();

/** The RSV-CE passage a reading is, found by its text, or null. Throws when the Bible cannot be read. */
export function identifyReading(text: string): Promise<string | null> {
  let pending = identified.get(text);
  if (!pending) {
    pending = identifyPassageAction(text);
    pending.catch(() => identified.delete(text));
    identified.set(text, pending);
  }
  return pending;
}
