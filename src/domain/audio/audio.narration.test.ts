import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_NARRATION, narrationProfile } from './audio.narration';

test('a language with nothing stored is narrated with the app default', () => {
  assert.deepEqual(narrationProfile({}), DEFAULT_NARRATION);
  assert.deepEqual(narrationProfile({ audioRate: null, audioPitch: null }), DEFAULT_NARRATION);
});

test('the app default is the rate and pitch chosen for Antonin', () => {
  assert.deepEqual(DEFAULT_NARRATION, { rate: '0.8', pitch: '-6%' });
});

test('stored values replace the default field by field', () => {
  assert.deepEqual(narrationProfile({ audioRate: '0.85', audioPitch: '-10%' }), { rate: '0.85', pitch: '-10%' });
  assert.deepEqual(narrationProfile({ audioRate: '0.85' }), { rate: '0.85', pitch: '-6%' });
  assert.deepEqual(narrationProfile({ audioPitch: '-10%' }), { rate: '0.8', pitch: '-10%' });
});

test('a blank stored value is no value', () => {
  assert.deepEqual(narrationProfile({ audioRate: '  ', audioPitch: '' }), DEFAULT_NARRATION);
});
