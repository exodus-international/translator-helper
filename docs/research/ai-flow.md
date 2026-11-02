# AI flow: stav a otevřené otázky

Větev `feat/ai-flow`, stav k 2026-11-02. Původní rešerše proveditelnosti je v historii tohoto souboru. Jak flow funguje a jak ho nasadit, popisuje `docs/AI_WORKFLOW.md`.

## Co je hotové

- Přepínač na jazyce: Languages, jazyk, Settings, karta Workflow (Manual / AI). Platí jen pro nově nahrané dokumenty. Každá verze si workflow zkopíruje při vzniku, takže přepnutí nikdy nerozbije rozpracovaný dokument.
- Nahrání anglického dokumentu pošle verze v AI jazycích AI. Překlad běží na pozadí po odeslání odpovědi. Kde si AI není jistá, založí komentář (nebo návrh změny, když má lepší znění) jako uživatel "AI Translator".
- Review textu: všichni členové jazyka jsou revieweři, i translatoři. Tlačítko Approve text v panelu AI workflow. Dva různí lidé = posun dál. Palec platí i po pozdější úpravě textu (podle tvé odpovědi). Schválit nejde, dokud je otevřený jakýkoli komentář, včetně komentářů od AI.
- AI připraví audio přepis (SSML ze záložky Audio text bez značek, které se nemají číst). Výstup se zahodí a krok zopakuje, když AI změní hlas nebo ztratí pauzu.
- Review audia: jeden člověk, Approve audio text ve status menu. Úprava textu v tomhle kroku dokument nevrací (podle tvé odpovědi).
- Approved: spustí se nahrávka, aplikace počká, až je hotová, zkontroluje YAML, frontmatter a lint (chyby, ne varování), deployne a zapne na PR auto-merge. GitHub pak mergne po zelených required checks v CI obsahového repa. Validace tedy běží v aplikaci i nezávisle v CI.
- Z AI flow se nedá vrátit do ručního (podle tvé odpovědi). Člověk v AI flow může jen schválit audio a deploynout nebo vrátit deploy.
- Selhání: krok se automaticky zkusí až třikrát. Chyba, kterou opakování nespraví (neprošla kontrola, GitHub odmítl PR nebo auto-merge), čeká na managera jazyka a tlačítko Retry.
- Dokument nahraný před přepnutím jazyka: manager ho pošle AI tlačítkem "Hand to the AI workflow" v editoru.
- My Work na dashboardu ukazuje AI dokumenty celému týmu, dokud je člověk neschválil. Notifikace jde celému týmu, když je hotový AI draft a když je hotový audio přepis.
- Testy: unit (přechody, pravidla, celá orchestrace s fakes), DB testy nad seedovanou databází, E2E scénář od AI draftu po deploy s auto-merge. Celá E2E sada 42/42 lokálně zelená. E2E při psaní našel skutečnou chybu (octokit nepovolí GraphQL proměnnou `method`), opraveno.

## Co je potřeba udělat před nasazením

1. Nastavit `AI_WORKFLOW_SWEEP_SECRET` a v Coolify naplánovanou úlohu `ai-workflow-sweep` (příkaz je v `docs/AI_WORKFLOW.md`). Bez ní nedoběhne deploy dokumentů, které čekají na nahrávku.
2. V obsahovém repozitáři zapnout "Allow auto-merge" a na `main` nastavit required status checks. Bez required checks GitHub považuje PR za mergovatelný hned a aplikace ho mergne bez čekání na CI.
3. Ověřit, že `CHATGPT_MODEL` umí structured output (`gpt-4o-mini` ano).

## Otevřené otázky

Kde jsem nemohl čekat na odpověď, zvolil jsem výchozí variantu. U každé otázky je napsané, jak to teď funguje.

1. **Musí audio schválit někdo jiný než ti dva, kdo schválili text?** Psal jsi "to udělá další reviewer". Teď to může být kdokoli z týmu, i jeden z těch dvou. Vynutit třetího člověka je malá změna.

2. **Stav "WAITING FOR REVIEW".** Použil jsem existující stav PENDING_REVIEW (v aplikaci "In Review"), aby fungoval review editor, kanban a filtry beze změn. Nové stavy jsou jen AI Translating, AI Preparing Audio a Audio Review. Chceš pro AI flow vlastní název "Waiting for Review"?

3. **Komentáře od AI blokují schválení textu.** Reviewer je musí vyřešit (aplikovat nebo zamítnout), jinak Approve text nepustí. Je to tak správně, nebo mají být AI komentáře jen informativní?

4. **Hromadné poslání AI.** Když se jazyk přepne na AI nebo se přidá do projektu, staré dokumenty se AI neposílají samy (stálo by to tokeny za celý projekt najednou). Manager je pošle po jednom. Chceš tlačítko "poslat AI všechny nezačaté dokumenty v projektu"?

5. **Změna anglického originálu po AI překladu.** Teď se nic nestane, stejně jako v ručním flow. Má AI v takovém případě přeložit znovu, nebo aspoň přidat komentář "originál se změnil"?

6. **Auto-merge merguje celý PR jazyka.** Jedna větev a jeden PR na jazyk sbírá všechny deploye, ruční i AI. Auto-merge tak mergne i ruční deploye, které v PR zrovna čekají. Vadí to? Alternativa je samostatná větev a PR pro každý AI dokument.

7. **Co blokuje automatický deploy.** Blokují ho chyby lintu (hlavně parity: jiný počet nadpisů nebo odkazů než v originále), ne varování. Stačí to, nebo přidat další pravidla?

8. **Počet schválení.** Napevno 2. Má to být nastavení na jazyce?

9. **Uživatel "AI Translator".** Existuje v databázi, aby měl kdo být autorem komentářů a draftů. Nemůže se přihlásit a není v žádném týmu. Z admin seznamu uživatelů jsem ho skryl, aby ho nikdo nezabanoval ani nesmazal. Je potřeba ho ukázat jinde, třeba ve statistikách?

10. **Model.** AI flow používá stejný model jako tlačítko AI translate (`CHATGPT_MODEL`, výchozí `gpt-4o-mini`). Kvalita poznámek o nejistotách na modelu hodně záleží. Chceš pro AI flow samostatnou proměnnou se silnějším modelem?

11. **Notifikace celému týmu.** Každý AI draft upozorní všechny členy jazyka. U českého týmu s hodně dokumenty to může být hodně notifikací. Nechat, nebo posílat jen e-mailový digest?

12. **Kdo smí Retry.** Teď manager jazyka a admin, protože retry stojí tokeny a může skončit deployem. Má to smět kdokoli z týmu?
