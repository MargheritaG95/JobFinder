# JobFinder CLICKABLE FIXED

Questa build è stata rifatta con una sola gestione centralizzata dei click, per evitare listener mancanti.

IMPORTANTE:
- usa versioni cache-busting: styles.css?v=20260901-3 e app.js?v=20260901-3
- quindi GitHub Pages non dovrebbe continuare a servire il vecchio JS
- i pulsanti principali hanno `data-action` o `data-page` e vengono gestiti da un unico listener globale

Cliccabili:
- sidebar
- Applica ora
- Salva opportunità
- Avanza pipeline
- Nuova application
- Aziende Target
- Nuovo follow-up
- Feedback
- Preferenze
- Logout

Test automatico eseguito:
- sintassi JavaScript con `node --check`
- presenza degli action handler principali
