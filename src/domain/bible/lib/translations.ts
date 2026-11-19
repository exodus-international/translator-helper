export interface TranslationDef {
  code: string
  name: string
  language: string
  languageName: string
  /** The source translation is the one references are written against. */
  role: 'source' | 'target'
}

export const TRANSLATIONS: TranslationDef[] = [
  {
    code: 'rsvce-en',
    name: 'Revised Standard Version, Catholic Edition (RSV-CE)',
    language: 'en',
    languageName: 'English',
    role: 'source',
  },
  {
    code: 'sar-hr',
    name: 'Sveto pismo Staroga i Novoga zavjeta (Ivan Ev. Šarić)',
    language: 'hr',
    languageName: 'Hrvatski',
    role: 'target',
  },
  {
    code: 'eue-de',
    name: 'Einheitsübersetzung 2016',
    language: 'de',
    languageName: 'Deutsch',
    role: 'target',
  },
  {
    code: 'knb-hu',
    name: 'Káldi–Neovulgáta',
    language: 'hu',
    languageName: 'Magyar',
    role: 'target',
  },
  {
    code: 'cep-cs',
    name: 'Český ekumenický překlad (s deuterokanonickými knihami)',
    language: 'cs',
    languageName: 'Čeština',
    role: 'target',
  },
  {
    code: 'ssv-sk',
    name: 'Sväté písmo – katolícky preklad (Spolok sv. Vojtecha, 1996)',
    language: 'sk',
    languageName: 'Slovenčina',
    role: 'target',
  },
  {
    code: 'ssp-sl',
    name: 'Slovenski standardni prevod (SSP)',
    language: 'sl',
    languageName: 'Slovenščina',
    role: 'target',
  },
]

export function sourceTranslation(): TranslationDef {
  return TRANSLATIONS.find((t) => t.role === 'source')!
}

/** Import metadata for a known bible-api translation code, in the app's field names. */
export function catalogMeta(code: string) {
  const def = TRANSLATIONS.find((t) => t.code === code)
  if (!def) return null
  return { code: def.code, name: def.name, languageCode: def.language, languageName: def.languageName, role: def.role }
}
