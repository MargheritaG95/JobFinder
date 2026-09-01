# JobFinder

JobFinder è una single-page application pronta per GitHub Pages che gestisce il flusso:

`opportunità → valutazione → preparazione → application → follow-up → colloquio → offer/closed`

Il frontend usa Supabase Auth e le tabelle del progetto tramite la sola publishable key. Non usa e non accetta una `service_role`/secret key.

## Avvio rapido

1. Apri `config.js`.
2. Sostituisci:

   ```js
   supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
   supabasePublishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
   ```

   con Project URL e publishable key del progetto Supabase.

3. Avvia un server locale dalla cartella del progetto:

   ```bash
   python3 -m http.server 8080
   ```

4. Apri `http://localhost:8080`.

Aprire direttamente `index.html` con `file://` non è consigliato: OAuth e recovery richiedono un origin HTTP/HTTPS valido.

## Auth Supabase

Sono implementati:

- login email/password;
- sessione persistente e refresh automatico;
- login Google OAuth;
- invio email per password recovery;
- impostazione della nuova password al ritorno dal link;
- logout.

Nel pannello Supabase:

1. abilita Email e, se desiderato, Google in **Authentication → Providers**;
2. imposta il Site URL della pubblicazione;
3. aggiungi tra i Redirect URLs sia l’URL locale sia quello GitHub Pages, per esempio:

   ```text
   http://localhost:8080/
   https://USERNAME.github.io/jobfinder/
   ```

Se il sito è pubblicato in una sottocartella GitHub Pages, puoi valorizzare `siteUrl` in `config.js` con l’URL assoluto finale.

## Schema e mapping

JobFinder legge tutte le righe con un filtro esplicito sull’utente autenticato, oltre a rispettare RLS. I nomi sono configurabili in `config.js`; non occorre cambiare `app.js` se il database usa nomi diversi.

| Entità | Tabella predefinita | Ownership predefinita |
|---|---|---|
| Profilo | `profiles` | `id = auth.uid()` |
| Aziende | `companies` | `user_id = auth.uid()` |
| Job | `jobs` | `user_id = auth.uid()` |
| Feedback | `feedback` | `user_id = auth.uid()` |
| Application | `applications` | `user_id = auth.uid()` |
| Contatti | `contacts` | `user_id = auth.uid()` |
| Follow-up | `followups` | `user_id = auth.uid()` |
| Answer bank | `answer_bank` | `user_id = auth.uid()` |
| Preferenze | `search_preferences` | `user_id = auth.uid()` |

Le colonne attese e modificabili sono elencate in `schema.columns` dentro `config.js`. I campi principali sono:

- `jobs`: `title`, `company_id`, `company_name`, `location`, `fit_score`, `status`, `priority`, `source`, `url`, `is_saved`, `why_fit`, `gaps`, `angle`, `recommended_cv`;
- `applications`: `job_id`, `company_id`, `status`, `cv_used`, `progress`, `applied_at`, `notes`, `why_fit`, `gaps`, `angle`, `recruiter_note`, `preparation_status`;
- `feedback`: `job_id`, `feedback_type`;
- `followups`: `action`, `job_id`, `application_id`, `contact_id`, `contact_name`, `due_date`, `completed`, `notes`;
- `search_preferences`: `target_roles`, `target_sectors`, `locations`, `work_modes`, `min_fit_score`, `ai_learning_enabled`.

Gli array delle preferenze funzionano con colonne `jsonb` o array PostgreSQL. Se il progetto usa colonne di testo semplici, adatta il tipo nel database o la serializzazione.

### RLS

RLS deve essere attivo e le policy devono consentire `select`, `insert`, `update` e, per i follow-up, `delete` solo quando l’owner coincide con `auth.uid()`. JobFinder aggiunge `user_id` a ogni insert e aggiunge il filtro owner a ogni select/update/delete, ma non tenta di aggirare policy mancanti.

Un errore di tabella, colonna o policy non blocca l’intera app: la sorgente interessata viene segnalata nella dashboard e le altre sezioni restano disponibili.

## Application Copilot

“Applica ora” apre una pagina compilabile con:

- dati del job e Fit Score;
- Why you fit, gap e angle;
- versione CV;
- nota recruiter;
- stato della preparazione.

Il Copilot parte dai dati già presenti in `jobs`/`applications`; quando mancano, genera una prima bozza strutturata usando ruolo, azienda e preferenze dell’utente. “Prepara application” crea o aggiorna il record Supabase e porta il job nello stato coerente. Non invia candidature esterne: la submission finale resta intenzionalmente sotto il controllo dell’utente.

Le card opportunità e il Copilot espongono inoltre due azioni condivise:

- **Applica più tardi** salva il job, lo porta da `NEW`/`REVIEW` ad `APPLY` e crea una sola application non inviata con stato `DRAFT`;
- **Ho applicato** aggiorna la stessa application a `APPLIED`, imposta progresso e preparazione come completati e conserva la prima data `applied_at`.

Dopo “Ho applicato” viene proposto, senza crearlo automaticamente, un follow-up collegato all’application.

La pagina **Le mie Application** funziona come registro operativo: unisce i record `applications` ai job già marcati `APPLIED`, segnala eventuali record mancanti e mostra candidature senza follow-up. Per ogni candidatura permette inoltre di copiare un kit con Why Fit, gap, angle e messaggio recruiter e di avviare ricerche mirate per contatti già salvati, LinkedIn e fonti pubbliche.

Il frontend non effettua scraping né compila automaticamente form su domini esterni: GitHub Pages non può superare CORS, login e protezioni dei siti terzi in modo affidabile. Il kit copiabile riduce il lavoro manuale senza esporre chiavi AI o dati sensibili.

## Importazione e ranking delle opportunità

La pagina **Opportunità** include **Importa annuncio**. Inserendo URL, ruolo, azienda e testo dell’offerta, JobFinder:

- evita duplicati confrontando URL oppure coppia ruolo/azienda;
- calcola un Fit Score trasparente usando ruoli, settori, località e modalità di lavoro salvati in `search_preferences`;
- salva l’opportunità su Supabase nello stato `REVIEW`;
- prepara Why Fit, gap e angle senza inventare esperienze;
- apre subito Application Copilot con una cover letter modificabile;
- conserva la cover letter nel campo configurato come `applications.notes` e la include nel kit copiabile.

Questa è un’importazione assistita, non uno scraper LinkedIn. Gli alert LinkedIn possono essere usati come fonte incollando il testo ricevuto; l’acquisizione automatica dalle email richiede un backend OAuth Gmail. Il ranking attuale è deterministico e spiegabile: una generazione AI completa richiederà una funzione server protetta, perché una chiave privata non deve essere pubblicata in GitHub Pages.

## Stati pipeline

```text
NEW → REVIEW → APPLY → APPLIED → CONTACTED → INTERVIEW → OFFER → CLOSED
```

Il pulsante **Avanza** aggiorna la colonna `jobs.status` su Supabase. Lo stato di un’application può essere aggiornato separatamente, con sincronizzazione opzionale del job collegato.

## Modalità demo

`demoMode` è `false` per impostazione predefinita. Se viene impostato esplicitamente a `true` senza credenziali Supabase, vengono mostrati dati locali chiaramente contrassegnati e tutte le scritture remote sono disabilitate.

## Pubblicazione GitHub Pages

Pubblica questa cartella dalla root del branch scelto. Il file `.nojekyll` evita elaborazioni Jekyll. Gli asset usano query string di versione:

```html
styles.css?v=20260901.5
app.js?v=20260901.5
config.js?v=20260901.5
```

Quando distribuisci una nuova release, incrementa lo stesso valore in `index.html` per invalidare la cache del browser e di GitHub Pages.

## Verifiche locali

Controllo sintassi:

```bash
node --check app.js
node --check config.js
```

Per una verifica reale delle scritture serve un utente del progetto e uno schema corrispondente alla mappatura. In assenza di credenziali, la UI può essere collaudata impostando temporaneamente `demoMode: true`; la modalità demo non effettua insert/update/delete.

## Sicurezza

- Non inserire mai chiavi `service_role`, `sb_secret_…` o altre secret key in `config.js`.
- Le publishable key sono progettate per il browser, ma la sicurezza dei dati dipende comunque dalle policy RLS.
- I link esterni vengono aperti solo se usano `http` o `https`.
- I dati renderizzati vengono sottoposti a escaping per ridurre il rischio di injection HTML.
