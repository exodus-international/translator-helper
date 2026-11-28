import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { z } from 'zod';
import { formatIssues } from '@/lib/validation';
import {
  createStandardTranslationSchema,
  parseScope,
  moveStandardTranslationSchema,
  updateStandardTranslationSchema,
} from './standard-translation.types';

const LANGUAGE_ID = '6f1c1d6e-2b0a-4c39-9a57-3f0a3c1e9b11';
const PROJECT_ID = 'b2a4f0de-7c1e-4d55-8f1a-0e6c2d9a4b70';

const ENTRY = {
  sourceProjectId: null,
  sourceText: 'Glory Be',
  targetText: 'Slava Ocu',
};

function issuesOf(schema: z.ZodType, input: unknown): string {
  const result = schema.safeParse(input);
  if (result.success) assert.fail('expected the input to be rejected');
  return formatIssues(result.error);
}

describe('createStandardTranslationSchema', () => {
  it('accepts a general entry and fills in the defaults', () => {
    const parsed = createStandardTranslationSchema.parse({ languageId: LANGUAGE_ID, ...ENTRY });

    assert.deepEqual(parsed, {
      languageId: LANGUAGE_ID,
      sourceProjectId: null,
      name: null,
      sourceText: 'Glory Be',
      targetText: 'Slava Ocu',
      fixedForm: false,
      note: null,
    });
  });

  it('accepts a project entry', () => {
    const parsed = createStandardTranslationSchema.parse({ languageId: LANGUAGE_ID, ...ENTRY, sourceProjectId: PROJECT_ID });
    assert.equal(parsed.sourceProjectId, PROJECT_ID);
  });

  it('requires the scope to be chosen, not left out', () => {
    const withoutScope = { languageId: LANGUAGE_ID, sourceText: ENTRY.sourceText, targetText: ENTRY.targetText };
    assert.match(issuesOf(createStandardTranslationSchema, withoutScope), /^sourceProjectId:/);
  });

  it('rejects a language or project id that is not a uuid', () => {
    assert.match(issuesOf(createStandardTranslationSchema, { languageId: 'hr', ...ENTRY }), /^languageId:/);
    assert.match(
      issuesOf(createStandardTranslationSchema, { languageId: LANGUAGE_ID, ...ENTRY, sourceProjectId: 'exodus90' }),
      /^sourceProjectId:/,
    );
  });

  it('trims the texts, name and note', () => {
    const parsed = createStandardTranslationSchema.parse({
      languageId: LANGUAGE_ID,
      ...ENTRY,
      name: '  Glory Be ',
      sourceText: '\n Glory be to the Father \n',
      targetText: ' Slava Ocu\n',
      note: ' Liturgical text ',
    });

    assert.equal(parsed.name, 'Glory Be');
    assert.equal(parsed.sourceText, 'Glory be to the Father');
    assert.equal(parsed.targetText, 'Slava Ocu');
    assert.equal(parsed.note, 'Liturgical text');
  });

  it('stores a blank name or note as none', () => {
    const parsed = createStandardTranslationSchema.parse({ languageId: LANGUAGE_ID, ...ENTRY, name: '   ', note: '' });
    assert.equal(parsed.name, null);
    assert.equal(parsed.note, null);
  });

  it('requires a source and a translation that are more than whitespace', () => {
    assert.equal(
      issuesOf(createStandardTranslationSchema, { languageId: LANGUAGE_ID, ...ENTRY, sourceText: '  ', targetText: '' }),
      'sourceText: is required\ntargetText: is required',
    );
  });

  it('holds each field to its length limit, counted after trimming', () => {
    const at = (length: number) => 'a'.repeat(length);
    const valid = createStandardTranslationSchema.safeParse({
      languageId: LANGUAGE_ID,
      ...ENTRY,
      name: ` ${at(200)} `,
      sourceText: at(20000),
      targetText: at(20000),
      note: at(2000),
    });
    assert.equal(valid.success, true);

    assert.equal(
      issuesOf(createStandardTranslationSchema, {
        languageId: LANGUAGE_ID,
        ...ENTRY,
        name: at(201),
        sourceText: at(20001),
        targetText: at(20001),
        note: at(2001),
      }),
      [
        'name: is longer than 200 characters',
        'sourceText: is longer than 20,000 characters',
        'targetText: is longer than 20,000 characters',
        'note: is longer than 2,000 characters',
      ].join('\n'),
    );
  });
});

describe('updateStandardTranslationSchema', () => {
  it('accepts the same fields as create, without the language', () => {
    const parsed = updateStandardTranslationSchema.parse({ ...ENTRY, sourceProjectId: PROJECT_ID, fixedForm: true });
    assert.equal(parsed.sourceProjectId, PROJECT_ID);
    assert.equal(parsed.fixedForm, true);
  });

  it('refuses to move an entry to another language', () => {
    assert.match(issuesOf(updateStandardTranslationSchema, { ...ENTRY, languageId: LANGUAGE_ID }), /languageId/);
  });
});

describe('moveStandardTranslationSchema', () => {
  it('accepts no choice, or one of the two entries to keep', () => {
    assert.deepEqual(moveStandardTranslationSchema.parse({}), {});
    assert.deepEqual(moveStandardTranslationSchema.parse({ keep: 'project' }), { keep: 'project' });
    assert.deepEqual(moveStandardTranslationSchema.parse({ keep: 'general' }), { keep: 'general' });
  });

  it('rejects any other choice', () => {
    assert.match(issuesOf(moveStandardTranslationSchema, { keep: 'both' }), /^keep:/);
  });
});

describe('parseScope', () => {
  it('reads no scope as the default selection', () => {
    assert.equal(parseScope(undefined), null);
  });

  it('reads the scope as general plus project ids, dropping anything else', () => {
    assert.deepEqual(parseScope(`general,${PROJECT_ID},exodus90,${PROJECT_ID}`), {
      includeGeneral: true,
      projectIds: [PROJECT_ID],
    });
  });

  it('reads a scope without general as project entries only', () => {
    assert.deepEqual(parseScope(PROJECT_ID), { includeGeneral: false, projectIds: [PROJECT_ID] });
  });

  it('reads an empty scope as nothing selected, not as the default', () => {
    assert.deepEqual(parseScope(''), { includeGeneral: false, projectIds: [] });
  });

  it('takes the first value of a repeated param', () => {
    assert.deepEqual(parseScope(['general', PROJECT_ID]), { includeGeneral: true, projectIds: [] });
  });
});
