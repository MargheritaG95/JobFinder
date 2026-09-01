# JobFinder

JobFinder è una dashboard personale per gestire la ricerca lavoro come un vero Job Search Operating System.

## Funzionalità incluse nella V1

- Dashboard con KPI principali
- Opportunità ordinate per Fit Score
- Pipeline: NEW → REVIEW → APPLY → APPLIED → CONTACTED → INTERVIEW → OFFER → CLOSED
- Application Copilot
- Aziende target
- Follow-up
- Feedback LIKE / PASS / SAVE
- Login via Supabase Magic Link
- Modalità demo quando non sei autenticata
- Connessione al database Supabase già creato

## File

- `index.html` — struttura dell'app
- `styles.css` — design e responsive layout
- `app.js` — logica dell'app e connessione Supabase
- `config.js` — URL progetto Supabase + publishable key
- `vercel.json` — configurazione deploy Vercel
- `.gitignore` — file da ignorare

## Come caricarlo manualmente su GitHub

Apri il repository `JobFinder`.

Carica nella root del repository tutti questi file:

- index.html
- styles.css
- app.js
- config.js
- vercel.json
- .gitignore
- README.md

Poi fai commit direttamente sul branch `main`.

## Deploy su Vercel

1. Accedi a Vercel.
2. New Project.
3. Importa il repository GitHub `JobFinder`.
4. Framework Preset: `Other`.
5. Root Directory: lascia vuoto.
6. Build Command: lascia vuoto.
7. Output Directory: lascia vuoto.
8. Deploy.

Essendo una web app statica, Vercel servirà direttamente `index.html`.

## Supabase Auth

Dopo il deploy dovrai aggiungere il dominio Vercel tra i redirect autorizzati di Supabase Auth.

Esempio:

`https://jobfinder-xxxxx.vercel.app`

Il Magic Link userà `window.location.origin`, quindi funzionerà automaticamente appena il dominio sarà autorizzato.

## Sicurezza

La chiave contenuta in `config.js` è una Supabase Publishable Key, pensata per essere usata nel browser.

Il database è protetto da Row Level Security (RLS). Non inserire mai una `service_role` key o una secret key nel frontend.

## Prossima evoluzione

La V2 potrà includere:

- import automatico di nuove offerte
- Fit Score AI
- Application Copilot completo
- Answer Bank
- varianti CV
- networking/contact suggestions
- reminders automatici
- analytics su response rate e interview rate


## Accesso email + password

Questa versione usa Supabase Auth con email e password:
- **Accedi**: `signInWithPassword`.
- **Crea account**: `signUp` con password di almeno 8 caratteri.
- **Imposta / reimposta password**: invia una sola email di recovery; dopo l'impostazione, gli accessi successivi non richiedono email.
- Google Login e Magic Link sono rimossi dalla UI principale.

Per un account creato in precedenza solo tramite Magic Link, usare una sola volta **Imposta / reimposta password** con la stessa email. Dopo il reset, usare sempre email + password.
