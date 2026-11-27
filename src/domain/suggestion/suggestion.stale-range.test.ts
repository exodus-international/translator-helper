/**
 * A suggestion is made on the text as it was, and applied to the text as it is
 * now. These tests change the text in between, the way a translator or an
 * earlier suggestion does, and say what applying must then do: change the
 * words the suggestion was made on, or refuse. Anything else is a write to
 * text nobody chose.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { planSuggestionApplication, type ApplicableSuggestion } from './suggestion.apply';

const asWritten = ['The call came early.', 'Nobody answered it.', 'So it came again.'].join('\n');

/** "call" in the first line, as the reviewer selected it. */
const callToSummons: ApplicableSuggestion = {
  id: 's1',
  status: SuggestionStatus.OPEN,
  type: SuggestionType.CHANGE,
  proposedText: 'summons',
  anchorText: 'call',
  startLine: 1,
  startColumn: 5,
  endLine: 1,
  endColumn: 9,
};

/** "early" in the same line, from a second reviewer. */
const earlyToLate: ApplicableSuggestion = {
  ...callToSummons,
  id: 's2',
  proposedText: 'late',
  anchorText: 'early',
  startColumn: 15,
  endColumn: 20,
};

/** The new text, or 'refused' when the suggestion was not applied. */
function apply(suggestion: ApplicableSuggestion, content: string): string {
  try {
    return planSuggestionApplication(suggestion, content).newContent;
  } catch {
    return 'refused';
  }
}

function assertAppliedOrRefused(actual: string, applied: string) {
  assert.ok(
    actual === applied || actual === 'refused',
    `expected the suggestion applied to its own words, or refused, but the text became:\n${actual}`,
  );
}

describe('applying a suggestion to the text it was made on', () => {
  it('changes the selected words', () => {
    assert.equal(apply(callToSummons, asWritten), ['The summons came early.', 'Nobody answered it.', 'So it came again.'].join('\n'));
  });
});

describe('applying a suggestion after the text changed', () => {
  it('a word typed earlier in the line does not move the change onto other letters', () => {
    const edited = asWritten.replace('The call', 'The first call');
    assertAppliedOrRefused(apply(callToSummons, edited), edited.replace('call', 'summons'));
  });

  it('a line added above does not move the change onto another line', () => {
    const edited = `A new opening line.\n${asWritten}`;
    assertAppliedOrRefused(apply(callToSummons, edited), edited.replace('call', 'summons'));
  });

  it('a line removed above does not move the change onto another line', () => {
    const second: ApplicableSuggestion = { ...callToSummons, proposedText: 'Somebody', anchorText: 'Nobody', startLine: 2, startColumn: 1, endLine: 2, endColumn: 7 };
    const edited = asWritten.split('\n').slice(1).join('\n');
    assertAppliedOrRefused(apply(second, edited), edited.replace('Nobody', 'Somebody'));
  });

  it('words added in front of the selected ones are not half replaced', () => {
    const edited = asWritten.replace('call', 'telephone call');
    assert.equal(apply(callToSummons, edited).split('\n')[0], 'The telephone summons came early.');
  });

  it('refuses when the translator rewrote the selected words', () => {
    assert.equal(apply(callToSummons, asWritten.replace('call', 'ring')), 'refused');
  });

  it('refuses when the selected words moved and now appear more than once', () => {
    const edited = `A call, they said.\n${asWritten}`;
    assert.equal(apply(callToSummons, edited), 'refused');
  });

  it('a shorter line does not get the proposed text appended', () => {
    const edited = asWritten.replace('The call came early.', 'Dawn.');
    assert.equal(apply(callToSummons, edited), 'refused');
  });
});

describe('applying two suggestions on one line', () => {
  it('the second lands on its own words after the first was applied', () => {
    const afterFirst = apply(callToSummons, asWritten);
    assert.equal(afterFirst.split('\n')[0], 'The summons came early.');
    assertAppliedOrRefused(apply(earlyToLate, afterFirst), afterFirst.replace('early', 'late'));
  });

  it('the order they are applied in does not matter when the later one in the line goes first', () => {
    const afterSecond = apply(earlyToLate, asWritten);
    assert.equal(apply(callToSummons, afterSecond).split('\n')[0], 'The summons came late.');
  });
});
