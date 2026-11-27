import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuggestionStatus } from '@/generated/prisma/enums';
import { extractTextAtRange } from '@/lib/text-range';
import { followContentChange, type PlacedSuggestion } from './suggestion.follow';
import { planSuggestionApplication } from './suggestion.apply';

const before = ['The call came early.', 'Nobody answered it.', 'So it came again.'].join('\n');

const at = (id: string, line: number, from: number, to: number, anchorText: string | null): PlacedSuggestion => ({
  id,
  status: SuggestionStatus.OPEN,
  startLine: line,
  startColumn: from,
  endLine: line,
  endColumn: to,
  anchorText,
  proposedText: null,
});

const call = at('call', 1, 5, 9, 'call');
const nobody = at('nobody', 2, 1, 7, 'Nobody');
const again = at('again', 3, 12, 17, 'again');
const general: PlacedSuggestion = { ...call, id: 'general', startLine: null, startColumn: null, endLine: null, endColumn: null };

describe('followContentChange', () => {
  it('moves only the suggestions after the edit, and each stays on its words', () => {
    const after = before.replace('Nobody', 'For a long while nobody at all');
    const moved = followContentChange(before, after, [call, again, general]);
    assert.deepEqual(
      moved.map((m) => m.id),
      [],
      'an edit on line 2 changes no line or column on lines 1 and 3',
    );
    const withLine = `Then:\n${after}`;
    const shifted = followContentChange(after, withLine, [call, again, general]);
    assert.deepEqual(shifted.map((m) => [m.id, extractTextAtRange(withLine, m)]), [
      ['call', 'call'],
      ['again', 'again'],
    ]);
  });

  it('moves a suggestion made before the words were recorded, when the edit is clear of it', () => {
    const after = before.replace('The call', 'The first call');
    const [moved] = followContentChange(before, after, [{ ...call, anchorText: null }]);
    assert.equal(extractTextAtRange(after, moved), 'call');
  });

  it('leaves a suggestion where it was when its words were rewritten', () => {
    const after = before.replace('Nobody answered', 'No one picked up');
    assert.deepEqual(followContentChange(before, after, [nobody]), []);
  });

  it('keeps an applied change on its proposed text, so reopening it reverts the right words', () => {
    const applied: PlacedSuggestion = { ...at('applied', 1, 5, 12, 'call'), status: SuggestionStatus.APPLIED, proposedText: 'summons' };
    const text = before.replace('call', 'summons');
    const after = `Then:\n${text}`;
    const [moved] = followContentChange(text, after, [applied]);
    assert.equal(extractTextAtRange(after, moved), 'summons');
  });

  it('is what lets a second suggestion on a line apply after the first', () => {
    const early = { ...at('early', 1, 15, 20, 'early'), proposedText: 'late' };
    const first = planSuggestionApplication({ ...call, type: 'CHANGE', proposedText: 'summons' }, before);
    const [moved] = followContentChange(before, first.newContent, [early]);
    const second = planSuggestionApplication({ ...early, ...moved, type: 'CHANGE' }, first.newContent);
    assert.deepEqual(second.range, { startLine: 1, startColumn: 18, endLine: 1, endColumn: 23 });
    assert.equal(second.newContent.split('\n')[0], 'The summons came late.');
  });
});
