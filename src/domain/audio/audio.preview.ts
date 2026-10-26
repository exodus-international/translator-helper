/**
 * The sample an admin listens to while tuning a language's narration. Pure,
 * and imported by the settings form for the prefill and the length limit.
 *
 * Each sample has a comma and a sentence end close together, and a question
 * at the end, so the pause and pitch settings are audible within a few
 * seconds. They are first drafts, not reviewed by the language teams, which
 * is why each team can replace its own in the settings.
 */

/** Long enough for a few sentences, short enough that a preview costs next to nothing. */
export const PREVIEW_TEXT_MAX_LENGTH = 500;

export const DEFAULT_PREVIEW_TEXTS: Record<string, string> = {
  cs: 'Dnes se zastav a buď v tichu s Pánem. Nemusíš nic dokazovat, stačí být přítomen. Na konci dne si polož otázku: kde jsem dnes potkal Boha?',
  de: 'Halte heute inne und sei still vor dem Herrn. Du musst nichts beweisen, es genügt, da zu sein. Frag dich am Ende des Tages: Wo bin ich heute Gott begegnet?',
  en: 'Today, stop and be still with the Lord. You do not need to prove anything, it is enough to be present. At the end of the day, ask yourself: where did I meet God today?',
  hr: 'Danas zastani i budi u tišini s Gospodinom. Ne moraš ništa dokazivati, dovoljno je biti prisutan. Na kraju dana upitaj se: gdje sam danas susreo Boga?',
  hu: 'Ma állj meg, és légy csendben az Úrral. Nem kell semmit bizonyítanod, elég jelen lenned. A nap végén kérdezd meg magadtól: hol találkoztam ma Istennel?',
  lt: 'Šiandien sustok ir pabūk tyloje su Viešpačiu. Tau nereikia nieko įrodinėti, pakanka būti čia. Dienos pabaigoje paklausk savęs: kur šiandien sutikau Dievą?',
  nl: 'Sta vandaag stil en wees in stilte bij de Heer. Je hoeft niets te bewijzen, het is genoeg om aanwezig te zijn. Vraag jezelf aan het eind van de dag: waar heb ik God vandaag ontmoet?',
  pl: 'Zatrzymaj się dziś i trwaj w ciszy z Panem. Nie musisz niczego udowadniać, wystarczy być obecnym. Na koniec dnia zapytaj siebie: gdzie dziś spotkałem Boga?',
  sk: 'Dnes sa zastav a buď v tichu s Pánom. Nemusíš nič dokazovať, stačí byť prítomný. Na konci dňa si polož otázku: kde som dnes stretol Boha?',
  sl: 'Danes se ustavi in bodi v tišini z Gospodom. Ničesar ti ni treba dokazovati, dovolj je, da si navzoč. Ob koncu dneva se vprašaj: kje sem danes srečal Boga?',
};

/** The language's own sample, or the English one for a language nobody wrote one for. */
export function defaultPreviewText(languageCode: string): string {
  return DEFAULT_PREVIEW_TEXTS[languageCode] ?? DEFAULT_PREVIEW_TEXTS.en;
}

/** What the preview box starts with: the saved sample, or the default when none is saved. */
export function previewText(language: { code: string; audioPreviewText?: string | null }): string {
  return language.audioPreviewText?.trim() ? language.audioPreviewText : defaultPreviewText(language.code);
}

/**
 * What to store for a sample as typed. The default is stored as null, so a
 * language that never changed it picks up a corrected default later.
 */
export function storedPreviewText(languageCode: string, text: string): string | null {
  const trimmed = text.trim();
  return !trimmed || trimmed === defaultPreviewText(languageCode) ? null : text;
}
