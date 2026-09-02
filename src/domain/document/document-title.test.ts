import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentType } from '@prisma/client';
import { buildDefaultTitle, dayNumberFromFilename, parseDayNumber } from './document-title';

describe('parseDayNumber', () => {
  it('takes a plain number from frontmatter', () => {
    assert.equal(parseDayNumber(13), 13);
  });

  it('takes a quoted number, which is how some files write it', () => {
    assert.equal(parseDayNumber('13'), 13);
    assert.equal(parseDayNumber(' 7 '), 7);
  });

  it('rejects anything that is not a positive whole number', () => {
    for (const value of [0, -1, 1.5, '', 'day 13', 'thirteen', null, undefined, {}, '13a']) {
      assert.equal(parseDayNumber(value), null, `expected ${JSON.stringify(value)} to be rejected`);
    }
  });
});

describe('dayNumberFromFilename', () => {
  it('reads the number off an uploaded day file', () => {
    assert.equal(dayNumberFromFilename('13.md'), 13);
    assert.equal(dayNumberFromFilename('1.md'), 1);
    assert.equal(dayNumberFromFilename('100.MD'), 100);
  });

  it('ignores filenames that are not a bare number', () => {
    for (const name of ['day-13.md', 'intro.md', '13-2.md', '20260101-1.md', '13.txt', '.md']) {
      assert.equal(dayNumberFromFilename(name), null, `expected ${name} to be rejected`);
    }
  });
});

describe('buildDefaultTitle', () => {
  const base = { baseTitle: 'Prayer and Fasting', type: DocumentType.DAY };

  it('composes acronym, padded day and title', () => {
    assert.equal(
      buildDefaultTitle({ ...base, acronym: 'SML', day: 3 }),
      'SML - DAY 03 - Prayer and Fasting',
    );
  });

  it('does not pad past two digits', () => {
    assert.equal(buildDefaultTitle({ ...base, acronym: 'SML', day: 13 }), 'SML - DAY 13 - Prayer and Fasting');
    assert.equal(buildDefaultTitle({ ...base, acronym: 'SML', day: 100 }), 'SML - DAY 100 - Prayer and Fasting');
  });

  it('pads so that titles sort correctly as plain strings', () => {
    const titles = [2, 14, 3].map((day) => buildDefaultTitle({ ...base, acronym: 'SML', day }));
    assert.deepEqual([...titles].sort((a, b) => a.localeCompare(b)), [
      'SML - DAY 02 - Prayer and Fasting',
      'SML - DAY 03 - Prayer and Fasting',
      'SML - DAY 14 - Prayer and Fasting',
    ]);
  });

  it('drops the prefix when the project has no acronym', () => {
    assert.equal(buildDefaultTitle({ ...base, day: 3 }), 'DAY 03 - Prayer and Fasting');
    assert.equal(buildDefaultTitle({ ...base, acronym: null, day: 3 }), 'DAY 03 - Prayer and Fasting');
    assert.equal(buildDefaultTitle({ ...base, acronym: '   ', day: 3 }), 'DAY 03 - Prayer and Fasting');
  });

  it('leaves the title alone when the acronym is a lone dash', () => {
    assert.equal(buildDefaultTitle({ ...base, acronym: '-', day: 3 }), 'Prayer and Fasting');
    assert.equal(buildDefaultTitle({ ...base, acronym: ' - ', day: 3 }), 'Prayer and Fasting');
  });

  it('tells an opted-out project apart from one that has no acronym yet', () => {
    assert.equal(buildDefaultTitle({ ...base, acronym: '-', day: 3 }), 'Prayer and Fasting');
    assert.equal(buildDefaultTitle({ ...base, acronym: '', day: 3 }), 'DAY 03 - Prayer and Fasting');
  });

  it('does not let the dash leak into a composed title', () => {
    assert.ok(!buildDefaultTitle({ ...base, acronym: '-', day: 3 }).includes('DAY'));
  });

  it('leaves the title alone when there is no day number', () => {
    assert.equal(buildDefaultTitle({ ...base, acronym: 'SML' }), 'Prayer and Fasting');
    assert.equal(buildDefaultTitle({ ...base, acronym: 'SML', day: null }), 'Prayer and Fasting');
  });

  it('leaves every other type alone, acronym or not', () => {
    for (const type of [DocumentType.DAILY_CONTENT, DocumentType.MEETING, DocumentType.FIELD_GUIDE, DocumentType.ROOT_FILE]) {
      assert.equal(buildDefaultTitle({ ...base, type, acronym: 'SML', day: 3 }), 'Prayer and Fasting');
    }
  });

  it('leaves the title alone before a type has been picked', () => {
    assert.equal(buildDefaultTitle({ ...base, type: null, acronym: 'SML', day: 3 }), 'Prayer and Fasting');
  });

  it('trims the incoming title', () => {
    assert.equal(buildDefaultTitle({ ...base, baseTitle: '  Prayer  ', acronym: 'SML', day: 3 }), 'SML - DAY 03 - Prayer');
  });

  it('still composes a prefix when the file had no usable title', () => {
    assert.equal(buildDefaultTitle({ ...base, baseTitle: '', acronym: 'SML', day: 3 }), 'SML - DAY 03');
  });
});
