-- ============================================================================
-- JobFinder — trova le opportunità senza descrizione importata
-- ============================================================================
-- Esegui questo nel SQL Editor di Supabase (Project > SQL Editor > New query).
-- Non modifica nulla: sono tutte query di sola lettura (SELECT).
-- Adatta i nomi di colonna solo se il tuo config.js li ha rinominati rispetto
-- ai default (title, description, company_name, status, created_at).
-- ============================================================================

-- 1) Quante opportunità in totale, e quante hanno la descrizione vuota
select
  count(*) as totale_opportunita,
  count(*) filter (where description is null or trim(description) = '') as senza_descrizione,
  count(*) filter (where description is not null and trim(description) <> '') as con_descrizione
from jobs;

-- 2) Elenco delle opportunità senza descrizione, le più recenti prima
--    (queste sono quelle che oggi mostrano N/A su industria/RAL/esperienza/contratto
--    e il messaggio onesto "Responsabilità non specificate" dopo il fix in app.js)
select
  id,
  title,
  company_name,
  status,
  source,
  url,
  created_at
from jobs
where description is null or trim(description) = ''
order by created_at desc;

-- 3) Se sospetti che alcune arrivino da un'automazione esterna (non dal form
--    "Importa annuncio" dell'app), questo raggruppa per fonte per capire da dove
--    arrivano quelle senza descrizione
select
  coalesce(source, '(fonte non indicata)') as fonte,
  count(*) as totale,
  count(*) filter (where description is null or trim(description) = '') as senza_descrizione
from jobs
group by source
order by senza_descrizione desc, totale desc;
