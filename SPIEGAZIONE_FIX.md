# Perché "Il ruolo in breve" e "Responsabilità principali" erano identici (e industria/RAL/esperienza erano N/A)

## Correzione rispetto al primo messaggio

Il mio primo tentativo (file `jobParser.js` + `PARSING_IMPROVEMENTS.md`) era basato su
ipotesi, perché non riuscivo a leggere `app.js`. Ora ho letto il codice vero: quei due
file erano sbagliati nelle premesse e vanno ignorati. Questo documento sostituisce
quello precedente.

## Cosa ho scoperto leggendo `app.js`

Il parsing **esiste già ed è piuttosto sofisticato**: `salaryFromJob`, `jobSeniority`,
`jobExperience`, `jobContract`, `jobLanguages`, `companySummaryFromText`,
`industryFromText`, `responsibilityItems`, `roleSynopsis` sono tutte funzioni che
estraggono davvero questi campi dal testo incollato in "Importa annuncio". Anche
`config.js` mappa già correttamente tutte le colonne (`industry`, `salary_text`,
`seniority`, `experience_required`, `employment_type`, `languages`,
`company_description`, `responsibilities`) — **non serve nessuna modifica a
`config.js`**.

### Causa reale del problema nello screenshot

Tutte queste funzioni leggono il testo da `jobDescriptionText(job)`, cioè dalla colonna
`jobs.description` (o da una copia locale nel browser). **Per l'annuncio nello
screenshot quel testo è vuoto.** Quando manca:

- `salaryFromJob`, `jobExperience`, `jobContract` non hanno nulla da analizzare →
  restituiscono "Non indicata/o" → mostrato come `N/A`. **Questo non è un bug**: è il
  comportamento corretto quando davvero non c'è testo da leggere.
- `companyOverview` arriva fino al suo ultimo fallback onesto, che è esattamente la
  frase che hai visto: *"L'annuncio non contiene una descrizione verificabile..."*.
  Anche questo è il comportamento voluto della funzione, non un errore.
- **Il vero bug** era in `responsibilityItems()`: quando non trova né una lista
  strutturata né una sezione "Responsibilities" né frasi con verbi d'azione, andava a
  **ri-spezzare lo stesso identico testo** già mostrato da `roleSynopsis()` sotto "Il
  ruolo in breve" (`inferredRoleSummary(job)`). Risultato: i due campi mostravano lo
  stesso paragrafo, uno come blocco unico e l'altro spezzato in 2 righe puntate — è
  esattamente quello che si vede nello screenshot.

In sintesi: **il job in questione non ha una descrizione salvata**. Che sia stato
creato manualmente, importato senza incollare il testo completo, o inserito da
un'automazione esterna che scrive direttamente su Supabase saltando il form "Importa
annuncio" — in tutti questi casi il parsing lato client non ha materiale su cui
lavorare, e prima o poi mostrerà campi vuoti per qualunque annuncio arrivi così.

## Cosa ho corretto in `app.js`

Solo due funzioni, minime e mirate:

1. **`responsibilityItems(job)`** — rimossa la ricaduta su
   `inferredRoleSummary(job).split(...)`. Ora, quando non trova responsabilità
   distinte, restituisce un messaggio onesto e diverso da "Il ruolo in breve":
   - se una descrizione esiste ma non contiene un elenco riconoscibile: *"Non è stato
     possibile individuare un elenco di responsabilità distinto nel testo
     importato..."*
   - se manca del tutto la descrizione: *"Responsabilità non specificate: per questo
     annuncio non è stata importata alcuna descrizione..."*

2. **`roleSynopsis(job)`** — quando ricade sulla sintesi stimata dal titolo
   (`inferredRoleSummary`), ora lo dice esplicitamente aggiungendo: *"(Sintesi stimata
   dal titolo del ruolo: nessuna descrizione importata per questo annuncio.)"* — così
   è chiaro quando il testo è una stima generica e non un'estrazione reale
   dall'annuncio.

3. **`submitOpportunityImport(form)`** — questo era il pezzo che impediva di
   *risolvere* davvero il problema, non solo di capirlo. Prima, se incollavi di nuovo
   un annuncio già presente (stesso URL, o stesso ruolo+azienda) per aggiungere il
   testo completo che mancava, l'app rilevava il duplicato e **riapriva il record
   esistente senza toccarlo** — la descrizione restava vuota per sempre, quante volte
   lo reincollavi. Ora, se il job esistente non ha ancora una descrizione e quella
   appena incollata non è vuota, l'app **aggiorna il record esistente** con la nuova
   descrizione e ricalcola industria, RAL, seniority, esperienza, contratto, lingue,
   descrizione azienda e responsabilità — esattamente come fa per un annuncio nuovo.
   Se il job ha già una descrizione, il comportamento resta quello di prima (si apre
   senza modificarlo, per non sovrascrivere dati già buoni).

Nient'altro è stato toccato: tutta la logica di estrazione di RAL, esperienza,
contratto, lingue, industria resta invariata, perché già funziona correttamente
quando riceve del testo da analizzare.

## Come chiudere il problema anche sui job già esistenti

1. Sostituisci `app.js` nel repo con quello aggiornato.
2. Apri il SQL Editor di Supabase ed esegui `trova_job_senza_descrizione.sql`
   (allegato) — la prima query ti dice quante opportunità hanno `description` vuota,
   la seconda te le elenca una per una con titolo, azienda e link all'annuncio
   originale.
3. Per ciascuna di quelle, apri "Importa annuncio" nell'app, incolla di nuovo **URL,
   ruolo, azienda** identici a come sono già salvati, e stavolta incolla anche il
   **testo completo** dell'annuncio nel campo "Testo dell'annuncio". Con il fix del
   punto 3 sopra, l'app riconoscerà che è la stessa opportunità e aggiornerà quel
   record con la descrizione e tutti i campi estratti, invece di lasciarlo com'era.
4. Da qui in avanti, basta che il testo completo dell'annuncio venga sempre incollato
   in quel campo (sia per le opportunità nuove sia quando arricchisci una vecchia) e
   il parsing esistente farà il resto automaticamente.

## Cosa fare con questi file

- **`app.js`**: sostituisci il file nel repo con questo. Ho verificato la sintassi
  (`node --check app.js`).
- **`config.js`**, **`index.html`**, **`styles.css`**, **`vercel.json`**: nessuna
  modifica necessaria — verificato che gli elementi e le classi usate da `app.js`
  esistono già esattamente come previsto.
- **Database Supabase**: nessuna modifica di schema necessaria; usa
  `trova_job_senza_descrizione.sql` (sola lettura) per capire quante opportunità
  vanno arricchite con il passaggio 3 qui sopra.

## L'unica cosa che risolve davvero gli "N/A ovunque"

Il fix in `app.js` toglie la duplicazione ingannevole, ma **non fa comparire dati che
non esistono**. Per avere industria, RAL, esperienza e responsabilità reali devi
assicurarti che ogni riga creata nella tabella `jobs` abbia il campo `description`
valorizzato con il testo completo dell'annuncio:

- se crei le opportunità dal form "Importa annuncio" dentro l'app, basta incollare il
  testo completo nel campo "Testo dell'annuncio" — il parsing esistente farà il resto;
  è un semplice appunto per l'uso quotidiano, non un cambiamento a `app.js`;
- se invece qualcosa (uno script, un'automazione, un inserimento manuale su Supabase)
  crea righe in `jobs` senza passare da quel form, quella è la parte da correggere: va
  fuori da questi due file, perché non so come sia strutturata quella eventuale
  automazione. Se mi incolli il codice o la configurazione di quel processo, posso
  fare la stessa cosa: leggerlo e prepararti la correzione pronta da incollare.
