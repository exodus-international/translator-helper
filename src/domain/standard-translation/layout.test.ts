import assert from 'node:assert/strict';
import test from 'node:test';
import { renderInLayout } from './layout';

const GLORY_BE_HR =
  'Slava Ocu i Sinu i Duhu Svetomu.\nKako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.';

// ─── The issue's example ──────────────────────────────────

test('the Glory Be maps line for line, keeping the blockquote, italics and pause marker of each line', () => {
  const occurrence = `> *Glory be to the Father, and to the Son, and to the Holy Spirit,*
> *as it was in the beginning, is now, and ever shall be, world without end. Amen.* <!-- pause-duration="10s" -->`;

  assert.deepEqual(renderInLayout(occurrence, GLORY_BE_HR), {
    text: `> *Slava Ocu i Sinu i Duhu Svetomu.*
> *Kako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.* <!-- pause-duration="10s" -->`,
    notices: [],
  });
});

test('a single italic line keeps the entry’s lines inside one italic span', () => {
  const occurrence =
    '*Glory be to the Father, and to the Son, and to the Holy Spirit, as it was in the beginning, is now, and ever shall be, world without end. Amen.*';

  assert.deepEqual(renderInLayout(occurrence, GLORY_BE_HR), {
    text: '*Slava Ocu i Sinu i Duhu Svetomu.\nKako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.*',
    notices: [],
  });
});

// ─── Prefixes ─────────────────────────────────────────────

test('a list marker goes on the first line only, the entry’s other lines indented into the item', () => {
  const occurrence = '1. Glory be to the Father, and to the Son, and to the Holy Spirit. Amen.';

  assert.deepEqual(renderInLayout(occurrence, GLORY_BE_HR), {
    text: '1. Slava Ocu i Sinu i Duhu Svetomu.\n   Kako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.',
    notices: [],
  });
});

test('indentation goes on every line of the entry', () => {
  assert.deepEqual(renderInLayout('  Glory be to the Father. Amen.', GLORY_BE_HR), {
    text: '  Slava Ocu i Sinu i Duhu Svetomu.\n  Kako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.',
    notices: [],
  });
});

// ─── Emphasis around a paragraph ──────────────────────────

// The shape of src/domain/scripture/fixtures/the-victorious-life.md, lines 28–30.
const PARAGRAPH = `*Let us remember that we are in the holy presence of God.
Live as a free and courageous man who walks in the victory of Jesus today and always.
Take one minute of silence now.* <!-- ⁠pause-duration="60s" -->`;

test('italics around a paragraph stay on its first and last lines when the line counts match', () => {
  const target = 'Sjetimo se da smo u svetoj Božjoj prisutnosti.\nŽivi kao slobodan čovjek.\nUzmi sada minutu tišine.';

  assert.deepEqual(renderInLayout(PARAGRAPH, target), {
    text: `*Sjetimo se da smo u svetoj Božjoj prisutnosti.
Živi kao slobodan čovjek.
Uzmi sada minutu tišine.* <!-- ⁠pause-duration="60s" -->`,
    notices: [],
  });
});

test('italics around a paragraph wrap each of the entry’s paragraphs when the line counts differ', () => {
  const target = 'Sjetimo se da smo u svetoj Božjoj prisutnosti.\n\nUzmi sada minutu tišine.';

  assert.deepEqual(renderInLayout(PARAGRAPH, target), {
    text: `*Sjetimo se da smo u svetoj Božjoj prisutnosti.*

*Uzmi sada minutu tišine.* <!-- ⁠pause-duration="60s" -->`,
    notices: [],
  });
});

// ─── Extras at the end of a line ──────────────────────────

const PAUSED = '> Glory be to the Father, <!-- pause-duration="5s" -->\n> and to the Son.';

test('a pause marker stays on its own line when the line counts match', () => {
  assert.deepEqual(renderInLayout(PAUSED, 'Slava Ocu\ni Sinu.'), {
    text: '> Slava Ocu <!-- pause-duration="5s" -->\n> i Sinu.',
    notices: [],
  });
});

test('a pause marker moves to the end of the last line, with a notice, when the line counts differ', () => {
  assert.deepEqual(renderInLayout(PAUSED, 'Slava Ocu\ni Sinu\ni Duhu Svetomu.'), {
    text: '> Slava Ocu\n> i Sinu\n> i Duhu Svetomu. <!-- pause-duration="5s" -->',
    notices: ['pause-moved'],
  });
});

test('hard breaks stay on their lines when the line counts match', () => {
  assert.deepEqual(renderInLayout('Glory be\\\nto the Father,  \nand to the Son.', 'Slava\nOcu\ni Sinu.'), {
    text: 'Slava\\\nOcu  \ni Sinu.',
    notices: [],
  });
});

test('the hard break every line had breaks the entry’s lines when the line counts differ', () => {
  assert.deepEqual(renderInLayout('Glory be to the Father,\\\nand to the Son.', 'Slava\nOcu\ni Sinu.'), {
    text: 'Slava\\\nOcu\\\ni Sinu.',
    notices: [],
  });
});

// ─── Stanza breaks ────────────────────────────────────────

test('stanza breaks come from the occurrence when its shape matches the entry’s', () => {
  assert.deepEqual(renderInLayout('> Glory be\n>\n>\n> to the Father', 'Slava\n\nOcu'), {
    text: '> Slava\n>\n>\n> Ocu',
    notices: [],
  });
});

test('stanza breaks come from the entry when the shapes differ, as `>` lines in a blockquote', () => {
  assert.deepEqual(renderInLayout('> Glory be to the Father', 'Slava\n\nOcu'), {
    text: '> Slava\n>\n> Ocu',
    notices: [],
  });
});

// ─── Formatting inside the text ───────────────────────────

const REFRAIN = '> *Pray for us, **Holy Mother of God**, now and always.*';

test('a bold refrain inside the text is kept from the entry', () => {
  assert.deepEqual(renderInLayout(REFRAIN, 'Moli za nas, **Sveta Bogorodice**, sada i uvijek.'), {
    text: '> *Moli za nas, **Sveta Bogorodice**, sada i uvijek.*',
    notices: [],
  });
});

test('formatting inside the text that the entry lacks gives a notice, and the entry’s is kept', () => {
  assert.deepEqual(renderInLayout(REFRAIN, 'Moli za nas, Sveta Bogorodice, sada i uvijek.'), {
    text: '> *Moli za nas, Sveta Bogorodice, sada i uvijek.*',
    notices: ['formatting-differs'],
  });
});

test('formatting inside the entry that the occurrence lacks gives a notice, and the entry’s is kept', () => {
  assert.deepEqual(renderInLayout('> *Pray for us, Holy Mother of God.*', 'Moli za nas, **Sveta Bogorodice**.'), {
    text: '> *Moli za nas, **Sveta Bogorodice**.*',
    notices: ['formatting-differs'],
  });
});

// ─── No layout ────────────────────────────────────────────

const PLAIN: [name: string, occurrence: string][] = [
  ['the line counts match', 'Glory be to the Father,\nand to the Son.'],
  ['the line counts differ', 'Glory be to the Father, and to the Son.'],
];

for (const [name, occurrence] of PLAIN) {
  test(`a plain occurrence gives the entry unchanged when ${name}`, () => {
    assert.deepEqual(renderInLayout(occurrence, GLORY_BE_HR), { text: GLORY_BE_HR, notices: [] });
  });
}
