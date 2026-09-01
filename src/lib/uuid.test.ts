import assert from 'node:assert/strict';
import test from 'node:test';
import { isUuid } from './uuid';

test('a UUID is told apart from a slug', () => {
  assert.equal(isUuid('aa5eec1f-e70b-4877-aefd-bf837587ae31'), true);
  assert.equal(isUuid('AA5EEC1F-E70B-4877-AEFD-BF837587AE31'), true);
  assert.equal(isUuid('day-1'), false);
  assert.equal(isUuid('ex90-day-1'), false);
  assert.equal(isUuid('exodus90'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(undefined), false);
});

test('a UUID with the wrong shape is not mistaken for one', () => {
  assert.equal(isUuid('aa5eec1f-e70b-4877-aefd-bf837587ae3'), false, 'too short');
  assert.equal(isUuid('aa5eec1f-e70b-4877-aefd-bf837587ae31x'), false, 'trailing character');
  assert.equal(isUuid('zz5eec1f-e70b-4877-aefd-bf837587ae31'), false, 'not hex');
});
