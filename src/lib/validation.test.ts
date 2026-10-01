import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { formatIssues, parseInput } from './validation';

const schema = z
  .strictObject({
    name: z.string().min(2, 'A name needs at least two characters'),
    voice: z.string().nullable(),
    provider: z.string().nullable(),
  })
  .refine((value) => !value.provider || !!value.voice, {
    message: 'A voice is required when a provider is selected',
  });

describe('parseInput', () => {
  it('returns the parsed value when the input is valid', () => {
    const parsed = parseInput(schema, { name: 'Croatian', voice: null, provider: null });

    assert.equal(parsed.name, 'Croatian');
  });

  it('throws the rule as a sentence, not as serialised JSON', () => {
    // A ZodError's own message is the issue array, so a toast that prints
    // error.message showed the user `[ { "code": "custom", … } ]`.
    assert.throws(() => parseInput(schema, { name: 'Croatian', voice: null, provider: 'AZURE_SPEECH' }), {
      message: 'A voice is required when a provider is selected',
    });
  });

  it('names the field when the schema knows which one failed', () => {
    assert.throws(() => parseInput(schema, { name: 'x', voice: null, provider: null }), {
      message: 'name: A name needs at least two characters',
    });
  });

  it('reports every problem, one per line', () => {
    const error = (() => {
      try {
        parseInput(schema, { name: 'x', voice: null, provider: 'AZURE_SPEECH' });
        return null;
      } catch (thrown) {
        return thrown as Error;
      }
    })();

    assert.equal(error?.message.split('\n').length, 2);
    assert.equal(error?.message.includes('A voice is required when a provider is selected'), true);
  });

  it('still rejects a key the schema does not accept', () => {
    // Code immutability rests on this: a strict object must keep refusing.
    assert.throws(() => parseInput(schema, { name: 'Croatian', voice: null, provider: null, code: 'hrv' }));
  });
});

describe('formatIssues', () => {
  it('leaves a whole-object rule to speak for itself', () => {
    const result = schema.safeParse({ name: 'Croatian', voice: null, provider: 'AZURE_SPEECH' });

    assert.equal(result.success, false);
    assert.equal(result.success === false && formatIssues(result.error), 'A voice is required when a provider is selected');
  });
});
