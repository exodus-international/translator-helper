import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { squareCropRect } from './image-crop';

describe('squareCropRect', () => {
  it('leaves a square image untouched', () => {
    assert.deepEqual(squareCropRect(512, 512), { x: 0, y: 0, size: 512 });
  });

  it('takes the middle column of a landscape image', () => {
    assert.deepEqual(squareCropRect(1000, 400), { x: 300, y: 0, size: 400 });
  });

  it('takes the middle band of a portrait image', () => {
    assert.deepEqual(squareCropRect(400, 1000), { x: 0, y: 300, size: 400 });
  });

  it('rounds to whole pixels on odd dimensions', () => {
    const rect = squareCropRect(101, 50);
    assert.deepEqual(rect, { x: 26, y: 0, size: 50 });
    assert.equal(Number.isInteger(rect.x), true);
  });
});
