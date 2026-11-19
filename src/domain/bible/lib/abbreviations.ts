// Citation abbreviations per language, keyed by public book id. They replace the
// scraped abbreviation at import time wherever the source had none (it fell back
// to the USFM code) or used a non-standard one. Croatian and Hungarian come from
// their sources and are not listed.

const EN = 'Gen Exod Lev Num Deut Josh Judg Ruth 1_Sam 2_Sam 1_Kgs 2_Kgs 1_Chr 2_Chr Ezra Neh Tob Jdt Esth 1_Macc 2_Macc Job Ps Prov Eccl Song Wis Sir Isa Jer Lam Bar Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1_Cor 2_Cor Gal Eph Phil Col 1_Thess 2_Thess 1_Tim 2_Tim Titus Phlm Heb Jas 1_Pet 2_Pet 1_John 2_John 3_John Jude Rev'
const DE = 'Gen Ex Lev Num Dtn Jos Ri Rut 1_Sam 2_Sam 1_Kön 2_Kön 1_Chr 2_Chr Esra Neh Tob Jdt Est 1_Makk 2_Makk Ijob Ps Spr Koh Hld Weish Sir Jes Jer Klgl Bar Ez Dan Hos Joël Am Obd Jona Mi Nah Hab Zef Hag Sach Mal Mt Mk Lk Joh Apg Röm 1_Kor 2_Kor Gal Eph Phil Kol 1_Thess 2_Thess 1_Tim 2_Tim Tit Phlm Hebr Jak 1_Petr 2_Petr 1_Joh 2_Joh 3_Joh Jud Offb'
const CS = 'Gn Ex Lv Nu Dt Joz Sd Rt 1S 2S 1Kr 2Kr 1Pa 2Pa Ezd Neh Tob Jdt Est 1Mak 2Mak Jb Ž Př Kaz Pís Mdr Sír Iz Jr Pl Bár Ez Da Oz Jl Am Abd Jon Mi Na Abk Sf Ag Za Mal Mt Mk L J Sk Ř 1K 2K Ga Ef Fp Ko 1Te 2Te 1Tm 2Tm Tt Fm Žd Jk 1P 2P 1J 2J 3J Ju Zj'
const SK = 'Gn Ex Lv Nm Dt Joz Sdc Rút 1_Sam 2_Sam 1_Kr 2_Kr 1_Krn 2_Krn Ezd Neh Tob Jdt Est 1_Mak 2_Mak Jób Ž Prís Kaz Pies Múd Sir Iz Jer Nár Bar Ez Dan Oz Joel Am Abd Jon Mich Nah Hab Sof Ag Zach Mal Mt Mk Lk Jn Sk Rim 1_Kor 2_Kor Gal Ef Flp Kol 1_Sol 2_Sol 1_Tim 2_Tim Tít Flm Hebr Jak 1_Pt 2_Pt 1_Jn 2_Jn 3_Jn Júd Zjv'

// Same order as CANON, with ESG/DAG published as EST/DAN.
const IDS = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH TOB JDT EST 1MA 2MA JOB PSA PRO ECC SNG WIS SIR ISA JER LAM BAR EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ')

function table(list: string): Record<string, string> {
  const names = list.split(' ').map((n) => n.replace('_', ' '))
  if (names.length !== IDS.length) throw new Error('abbreviation table does not cover the canon')
  return Object.fromEntries(IDS.map((id, i) => [id, names[i]!]))
}

export const ABBREVIATIONS: Record<string, Record<string, string>> = {
  en: table(EN),
  de: table(DE),
  cs: table(CS),
  sk: table(SK),
  sl: { EST: 'Est' },
}
