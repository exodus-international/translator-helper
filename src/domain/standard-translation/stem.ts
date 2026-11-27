/**
 * Finding a standard term in a translation whatever grammatical form it takes.
 *
 * Croatian, Czech, Slovak, Slovenian, Hungarian and German change word endings
 * with grammar: the entry holds "znak križa", and a translation writes
 * "znakom križa". So a term is found word by word, each translation word
 * starting with the stem of the entry's word, in the entry's order with nothing
 * but spaces and punctuation between them.
 *
 * The stem is a plain prefix, not a language's stemmer: every word keeps at
 * least four letters, and longer words drop at most two from the end, which is
 * as far as these endings reach (Očenaš → Očenaša, Očenašu; Liturgija →
 * Liturgiju). It errs towards finding a term rather than missing one; what it
 * answers is "may the AI have dropped this term", not a grammar check.
 *
 * Pure and linear in the text: the editor runs it on every visible line, and
 * AI translation on the whole draft.
 */

const WORDS = /[\p{L}\p{N}]+/gu;
const MIN_STEM = 4;
const MAX_ENDING = 2;

interface Word {
  text: string;
  from: number;
  to: number;
}

function wordsOf(text: string): Word[] {
  return [...text.matchAll(WORDS)].map((match) => ({
    text: match[0].toLowerCase(),
    from: match.index,
    to: match.index + match[0].length,
  }));
}

function stemOf(word: string): string {
  const letters = [...word];
  return letters.slice(0, Math.max(MIN_STEM, letters.length - MAX_ENDING)).join('');
}

/** Only spaces and punctuation between two words: no third word, no line of its own. */
const ADJACENT = /^[^\p{L}\p{N}\n]*$/u;

/**
 * A text read once, to find terms in: its words, indexed by their first
 * letters, so finding a term looks only at the words that could start it.
 * The editor's check looks for every term of a dictionary on the same lines;
 * reading them again for each term would cost the dictionary's size times the
 * text's.
 */
export function termFinder(text: string): (term: string) => Array<{ from: number; to: number }> {
  const words = wordsOf(text);
  // Word indexes by their first 1 to MIN_STEM letters: a stem of n letters
  // (shorter only for a short word) is looked up by its first min(n, MIN_STEM).
  const byPrefix = new Map<string, number[]>();
  words.forEach((word, index) => {
    const letters = [...word.text];
    for (let length = 1; length <= Math.min(MIN_STEM, letters.length); length++) {
      const prefix = letters.slice(0, length).join('');
      const holders = byPrefix.get(prefix);
      if (holders) holders.push(index);
      else byPrefix.set(prefix, [index]);
    }
  });

  return (term) => {
    const stems = wordsOf(term).map((word) => stemOf(word.text));
    if (stems.length === 0) return [];
    const lead = [...stems[0]].slice(0, MIN_STEM).join('');
    const found: Array<{ from: number; to: number }> = [];
    let next = 0;
    for (const start of byPrefix.get(lead) ?? []) {
      if (start < next || start + stems.length > words.length) continue;
      const matches = stems.every((stem, i) => {
        const word = words[start + i];
        if (!word.text.startsWith(stem)) return false;
        return i === 0 || ADJACENT.test(text.slice(words[start + i - 1].to, word.from));
      });
      if (matches) {
        found.push({ from: words[start].from, to: words[start + stems.length - 1].to });
        next = start + stems.length;
      }
    }
    return found;
  };
}

/**
 * Every place the term occurs in the text, in any of its forms, as raw offsets
 * from the first word's start to the last word's end. Occurrences don't
 * overlap. A term with no words is never found.
 */
export function findTermOccurrences(text: string, term: string): Array<{ from: number; to: number }> {
  return termFinder(text)(term);
}
