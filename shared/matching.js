/*
 * JobFinder — preference matching shared by the browser (window.JobFinderMatching)
 * and the serverless API (require("../shared/matching")).
 *
 * One implementation means the opportunity the server selects and the badges /
 * Fit Score the UI shows are always computed with the same rules.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JobFinderMatching = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- helpers
  function normalized(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9+#]+/g, " ")
      .trim();
  }

  function list(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    if (value === null || value === undefined) return [];
    const text = String(value).trim();
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return list(parsed);
      } catch (_) { /* fall through */ }
    }
    return text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  }

  function hasPhrase(haystack, phrase) {
    const needle = normalized(phrase);
    return Boolean(needle) && ` ${haystack} `.includes(` ${needle} `);
  }

  // Multi-word expressions rewritten to a single canonical token before matching.
  const PHRASES = [
    ["risorse umane", "hr"], ["human resources", "hr"], ["people operations", "hr"],
    ["intelligenza artificiale", "ai"], ["artificial intelligence", "ai"], ["machine learning", "ml"],
    ["business development", "bizdev"], ["sviluppo commerciale", "bizdev"], ["sviluppo business", "bizdev"],
    ["assistenza clienti", "customer support"], ["servizio clienti", "customer service"],
    ["esperienza cliente", "customer experience"], ["customer care", "customer support"],
    ["talent acquisition", "recruiting"], ["project management", "project manager"],
    ["product management", "product manager"], ["account executive", "account sales"],
    ["e commerce", "ecommerce"], ["front end", "frontend"], ["back end", "backend"], ["full stack", "fullstack"],
    ["data science", "data scientist"], ["user experience", "ux"], ["user interface", "ui"]
  ];

  const ALIASES = {
    prodotto: "product", prodotti: "product", progetto: "project", progetti: "project",
    analista: "analyst", analisi: "analysis", sviluppatore: "developer", sviluppatrice: "developer",
    ingegnere: "engineer", engineering: "engineer", responsabile: "manager", consulente: "consultant",
    consulting: "consultant", consulenza: "consultant", coordinatore: "coordinator", coordinatrice: "coordinator",
    specialista: "specialist", addetto: "specialist", addetta: "specialist", assistente: "assistant",
    direttore: "director", direttrice: "director", progettista: "designer",
    marketing: "marketing", growth: "marketing",
    comunicazione: "communication", communications: "communication",
    commerciale: "sales", vendite: "sales", vendita: "sales", venditore: "sales",
    recruitment: "recruiting", recruiter: "recruiting", talent: "recruiting", selezione: "recruiting",
    operations: "operation", operativo: "operation", operativa: "operation", ops: "operation",
    clienti: "customer", cliente: "customer", client: "customer", clients: "customer", customers: "customer",
    finanza: "finance", financial: "finance", finanziario: "finance", contabile: "accounting", contabilita: "accounting",
    logistica: "logistics", acquisti: "procurement", purchasing: "procurement", buyer: "procurement",
    legale: "legal", dati: "data", strategia: "strategy", strategic: "strategy", strategico: "strategy",
    amministrazione: "administration", amministrativo: "administration", qualita: "quality",
    pm: "product manager", po: "product owner", ba: "business analyst", cs: "customer success"
  };

  const SENIORITY = new Set(["senior", "junior", "sr", "jr", "mid", "middle", "lead", "head", "principal", "staff",
    "intern", "internship", "stage", "stagista", "tirocinio", "tirocinante", "trainee", "graduate", "entry", "level",
    "i", "ii", "iii", "iv", "m", "f", "w", "d", "x", "remote", "hybrid", "full", "time", "part"]);
  const CONNECTORS = new Set(["and", "the", "for", "with", "of", "to", "in", "at", "on", "a", "an",
    "di", "del", "della", "delle", "dei", "degli", "per", "e", "ed", "il", "la", "le", "lo", "gli", "da", "con", "su"]);
  const FUNCTION_WORDS = new Set(["manager", "specialist", "analyst", "coordinator", "consultant", "associate",
    "executive", "officer", "director", "engineer", "developer", "designer", "representative", "assistant",
    "administrator", "partner", "owner", "advisor", "architect", "scientist", "expert", "agent"]);

  function canonicalWords(text) {
    let value = ` ${normalized(text)} `;
    for (const [phrase, replacement] of PHRASES) value = value.split(` ${phrase} `).join(` ${replacement} `);
    const words = [];
    value.split(" ").filter(Boolean).forEach((raw) => {
      let alias = ALIASES[raw];
      if (!alias && raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss")) alias = ALIASES[raw.slice(0, -1)] || raw.slice(0, -1);
      String(alias || raw).split(" ").forEach((word) => words.push(word));
    });
    return words;
  }

  // ------------------------------------------------------------------ roles
  function roleMatch(role, title) {
    const titleWords = new Set(canonicalWords(title));
    const roleWords = canonicalWords(role).filter((word) => !CONNECTORS.has(word) && !SENIORITY.has(word));
    if (!roleWords.length || !titleWords.size) return null;
    const core = roleWords.filter((word) => !FUNCTION_WORDS.has(word));
    const functions = roleWords.filter((word) => FUNCTION_WORDS.has(word));
    const required = core.length ? core : functions;
    if (!required.every((word) => titleWords.has(word))) return null;
    const functionHit = !functions.length || functions.some((word) => titleWords.has(word));
    // "Product Manager" must not match "Product Designer": a different job function is a different role.
    const titleFunctions = [...titleWords].filter((word) => FUNCTION_WORDS.has(word));
    if (!functionHit && titleFunctions.length) return null;
    return { value: role, strength: functionHit ? "strong" : "partial" };
  }

  // ---------------------------------------------------------------- sectors
  const SECTOR_GROUPS = [
    ["tech", "technology", "tecnologia", "tecnologico", "software", "saas", "it", "information technology", "digital", "cloud"],
    ["ai", "ml", "genai", "llm", "data science", "intelligenza artificiale", "artificial intelligence", "machine learning"],
    ["automotive", "automobilistico", "automobile", "automotive industry", "mobility", "mobilita", "ev", "electric vehicles", "vehicles"],
    ["fintech", "payments", "pagamenti", "banking", "bancario", "banca", "bank", "financial services", "servizi finanziari", "finance"],
    ["insurance", "assicurazioni", "assicurativo", "insurtech"],
    ["healthcare", "health", "sanita", "sanitario", "medical", "medicale", "pharma", "pharmaceutical", "farmaceutico", "biotech", "healthtech", "life sciences"],
    ["ecommerce", "e commerce", "retail", "marketplace", "commercio", "gdo"],
    ["fashion", "moda", "luxury", "lusso", "apparel", "abbigliamento", "beauty", "cosmetics", "cosmetica"],
    ["energy", "energia", "renewable", "renewables", "rinnovabili", "utilities", "utility", "cleantech", "sustainability", "sostenibilita"],
    ["consulting", "consulenza", "advisory", "professional services"],
    ["media", "editoria", "publishing", "entertainment", "intrattenimento", "advertising", "pubblicita", "agency", "agenzia"],
    ["gaming", "videogames", "video games", "games", "esports"],
    ["education", "edtech", "istruzione", "formazione", "e learning", "learning"],
    ["travel", "turismo", "tourism", "hospitality", "ospitalita", "hotel", "airline", "aviation"],
    ["food", "beverage", "food and beverage", "alimentare", "fmcg", "cpg", "consumer goods", "beni di consumo"],
    ["logistics", "logistica", "supply chain", "shipping", "trasporti", "transportation"],
    ["manufacturing", "industria", "industriale", "industrial", "produzione", "manifatturiero", "engineering"],
    ["telecommunications", "telecom", "telco", "telecomunicazioni"],
    ["real estate", "immobiliare", "proptech", "construction", "edilizia"],
    ["public sector", "pubblica amministrazione", "government", "ngo", "nonprofit", "non profit", "onlus", "terzo settore"],
    ["cybersecurity", "security", "sicurezza informatica", "infosec"]
  ];

  function sectorCandidates(sector) {
    const value = normalized(sector);
    const candidates = new Set([value]);
    SECTOR_GROUPS.forEach((group) => {
      if (group.some((item) => normalized(item) === value)) group.forEach((item) => candidates.add(normalized(item)));
    });
    return [...candidates].filter(Boolean);
  }

  function sectorMatch(sector, strongText, weakText) {
    const candidates = sectorCandidates(sector);
    if (candidates.some((candidate) => hasPhrase(strongText, candidate))) return { value: sector, strength: "strong" };
    // Short ambiguous tokens ("ai", "it", "ev") only count when they are in title/industry/company.
    if (candidates.some((candidate) => candidate.length > 3 && hasPhrase(weakText, candidate))) return { value: sector, strength: "weak" };
    return null;
  }

  // -------------------------------------------------------------- locations
  const EUROPE = "AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA".split(" ");
  const REGIONS = {
    europe: EUROPE, europa: EUROPE, eu: EUROPE, ue: EUROPE, emea: EUROPE, eea: EUROPE, "european union": EUROPE, "unione europea": EUROPE,
    dach: ["DE", "AT", "CH"], benelux: ["BE", "NL", "LU"], nordics: ["DK", "FI", "IS", "NO", "SE"], uk: ["GB"],
    "north america": ["US", "CA"], americas: ["US", "CA", "MX", "BR", "AR", "CL", "CO"], latam: ["MX", "BR", "AR", "CL", "CO", "PE"]
  };
  const WORLDWIDE = ["worldwide", "anywhere", "global", "globally", "international", "everywhere", "ovunque", "tutto il mondo", "world"];

  // City / region name variants, tagged with their ISO country.
  const PLACES = [
    ["IT", "milano", "milan", "mailand"], ["IT", "roma", "rome", "rom"], ["IT", "torino", "turin"], ["IT", "firenze", "florence"],
    ["IT", "napoli", "naples"], ["IT", "venezia", "venice"], ["IT", "genova", "genoa"], ["IT", "padova", "padua"],
    ["IT", "mantova", "mantua"], ["IT", "bologna"], ["IT", "bergamo"], ["IT", "brescia"], ["IT", "verona"], ["IT", "monza"],
    ["IT", "varese"], ["IT", "como"], ["IT", "pavia"], ["IT", "trento"], ["IT", "bolzano", "bozen"], ["IT", "trieste"],
    ["IT", "bari"], ["IT", "palermo"], ["IT", "catania"], ["IT", "cagliari"], ["IT", "pisa"], ["IT", "parma"], ["IT", "modena"],
    ["IT", "lombardia", "lombardy"], ["IT", "lazio"], ["IT", "piemonte", "piedmont"], ["IT", "veneto"], ["IT", "emilia romagna"],
    ["IT", "toscana", "tuscany"], ["IT", "campania"], ["IT", "sicilia", "sicily"], ["IT", "puglia", "apulia"], ["IT", "liguria"],
    ["IT", "sardegna", "sardinia"], ["IT", "trentino"], ["IT", "friuli"], ["IT", "marche"], ["IT", "abruzzo"], ["IT", "umbria"],
    ["IT", "calabria"], ["IT", "valle d aosta", "aosta valley"],
    ["GB", "londra", "london"], ["GB", "edimburgo", "edinburgh"], ["GB", "manchester"], ["FR", "parigi", "paris"],
    ["FR", "lione", "lyon"], ["FR", "marsiglia", "marseille"], ["DE", "berlino", "berlin"], ["DE", "monaco di baviera", "munich", "munchen", "muenchen"],
    ["DE", "amburgo", "hamburg"], ["DE", "francoforte", "frankfurt"], ["DE", "colonia", "koln", "cologne"], ["AT", "vienna", "wien"],
    ["CH", "zurigo", "zurich", "zuerich"], ["CH", "ginevra", "geneva", "geneve"], ["CH", "lugano"], ["ES", "madrid"],
    ["ES", "barcellona", "barcelona"], ["ES", "valencia"], ["ES", "siviglia", "seville", "sevilla"], ["PT", "lisbona", "lisbon", "lisboa"],
    ["PT", "porto", "oporto"], ["NL", "amsterdam"], ["NL", "rotterdam"], ["NL", "l aia", "the hague", "den haag"],
    ["BE", "bruxelles", "brussels", "brussel"], ["BE", "anversa", "antwerp"], ["IE", "dublino", "dublin"],
    ["PL", "varsavia", "warsaw", "warszawa"], ["PL", "cracovia", "krakow"], ["CZ", "praga", "prague", "praha"],
    ["DK", "copenaghen", "copenhagen", "kobenhavn"], ["SE", "stoccolma", "stockholm"], ["GR", "atene", "athens"],
    ["RO", "bucarest", "bucharest"], ["LU", "lussemburgo", "luxembourg"], ["US", "new york", "nyc"], ["US", "san francisco"]
  ];
  const PLACE_INDEX = new Map();
  PLACES.forEach(([country, ...names]) => names.forEach((name) => PLACE_INDEX.set(normalized(name), { country, names: names.map(normalized) })));

  let countryIndex = null;
  function countries() {
    if (countryIndex) return countryIndex;
    const byName = new Map();
    const byCode = new Map();
    let displays = [];
    try { displays = ["en", "it", "fr", "de", "es", "nl", "pt"].map((locale) => new Intl.DisplayNames([locale], { type: "region" })); }
    catch (_) { displays = []; }
    for (let a = 65; a <= 90; a += 1) for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const names = new Set();
      displays.forEach((display) => {
        try {
          const label = display.of(code);
          if (label && label !== code) names.add(normalized(label));
        } catch (_) { /* ignore */ }
      });
      if (!names.size) continue;
      if (code === "GB") ["uk", "united kingdom", "great britain", "england", "scotland", "wales"].forEach((n) => names.add(n));
      if (code === "US") ["usa", "us", "united states", "united states of america", "america", "stati uniti"].forEach((n) => names.add(n));
      if (code === "NL") ["holland", "olanda"].forEach((n) => names.add(n));
      byCode.set(code, [...names]);
      names.forEach((name) => byName.set(name, code));
    }
    countryIndex = { byName, byCode };
    return countryIndex;
  }

  function countriesInText(locationText) {
    const { byName } = countries();
    const found = new Set();
    byName.forEach((code, name) => {
      if (name.length >= 4 || ["uk", "usa"].includes(name)) { if (hasPhrase(locationText, name)) found.add(code); }
    });
    PLACE_INDEX.forEach((place, name) => { if (hasPhrase(locationText, name)) found.add(place.country); });
    // Two-letter ISO codes only when written as a standalone token in upper case in the raw location (e.g. "Remote - IT").
    return found;
  }

  function locationMatch(preference, job, mode) {
    const locationText = normalized(job.location);
    const pref = normalized(preference);
    if (!pref) return null;
    const place = PLACE_INDEX.get(pref);
    const { byName } = countries();
    const countryCode = place ? null : byName.get(pref) || (pref.length === 2 ? pref.toUpperCase() : null);
    if (place) {
      if (place.names.some((name) => hasPhrase(locationText, name))) return { value: preference, strength: "city" };
      return null;
    }
    if (countryCode && countries().byCode.has(countryCode)) {
      const inJob = countriesInText(locationText);
      // A chosen country always counts; chosen cities only raise the Fit Score (see scoreJob).
      if (inJob.has(countryCode)) return { value: preference, strength: "country" };
      if (mode === "remote") {
        const regionHit = Object.entries(REGIONS).some(([region, codes]) => codes.includes(countryCode) && hasPhrase(locationText, region));
        if (regionHit) return { value: preference, strength: "region" };
      }
      return null;
    }
    // Free-text place not in our dictionaries: plain phrase match.
    if (hasPhrase(locationText, pref)) return { value: preference, strength: "city" };
    return null;
  }

  function isWorldwide(job) {
    const text = normalized(job.location);
    if (!text) return true;
    const generic = new Set(["remote", "remoto", "remota", "fully", "full", "100", "only", "work", "from", "home", "da", "in", "the", "of", "il", "di"]);
    WORLDWIDE.forEach((word) => normalized(word).split(" ").forEach((piece) => generic.add(piece)));
    return text.split(" ").every((word) => generic.has(word));
  }

  // -------------------------------------------------------------- work mode
  const MODE_PATTERNS = {
    hybrid: /\b(hybrid|ibrid[oa]|smart working|partially remote|parzialmente da remoto|flexible working)\b/,
    remote: /\b(remote|remoto|remota|fully remote|full remote|100 remote|remote first|work from home|wfh|telelavoro|da remoto|anywhere)\b/,
    onsite: /\b(on site|onsite|in office|office based|in sede|in presenza|presso la sede)\b/
  };

  function jobWorkMode(job) {
    const direct = normalized(`${job.remote_type || ""} ${job.location || ""}`);
    if (MODE_PATTERNS.hybrid.test(direct)) return "hybrid";
    if (MODE_PATTERNS.remote.test(direct) && !/\b(no remote|not remote|non remoto)\b/.test(direct)) return "remote";
    if (MODE_PATTERNS.onsite.test(direct)) return "onsite";
    const body = normalized(`${job.title || ""} ${String(job.description || "").slice(0, 2500)}`);
    if (/\b(hybrid|ibrid[oa])\b/.test(body)) return "hybrid";
    if (/\b(fully remote|full remote|100 remote|remote first|completely remote|lavoro da remoto|full remote working)\b/.test(body)) return "remote";
    if (/\b(on site|onsite|in office|in sede|in presenza)\b/.test(body)) return "onsite";
    return "unknown";
  }

  function preferredModes(values) {
    const modes = new Set();
    list(values).forEach((value) => {
      const text = normalized(value);
      if (MODE_PATTERNS.hybrid.test(text)) modes.add("hybrid");
      else if (MODE_PATTERNS.remote.test(text)) modes.add("remote");
      else if (MODE_PATTERNS.onsite.test(text) || /\b(ufficio|office|presenza|sede)\b/.test(text)) modes.add("onsite");
    });
    return modes;
  }

  const MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Non indicata" };

  // ------------------------------------------------------------- preferences
  function readPreferences(preferences = {}) {
    return {
      roles: list(preferences.roles ?? preferences.target_roles),
      sectors: list(preferences.sectors ?? preferences.target_sectors),
      locations: list(preferences.locations),
      workModes: list(preferences.workModes ?? preferences.work_modes),
      minFit: Number(preferences.minFit ?? preferences.min_fit_score) || 0
    };
  }

  function hasCriteria(preferences) {
    const p = readPreferences(preferences);
    return Boolean(p.roles.length || p.sectors.length || p.locations.length || p.workModes.length);
  }

  /**
   * job: { title, company_name, industry, location, remote_type, description, company_description, salary_text }
   * Returns { fit, matchesPreferences, matched, missing, workMode, notes }.
   */
  function scoreJob(job, rawPreferences) {
    const preferences = readPreferences(rawPreferences);
    const strongText = normalized(`${job.title || ""} ${job.industry || ""} ${job.company_name || ""} ${job.company_description || ""}`);
    const weakText = normalized(String(job.description || "").slice(0, 3000));
    const mode = jobWorkMode(job);
    const modes = preferredModes(preferences.workModes);
    const matched = {};
    const missing = [];
    const notes = [];
    let score = 4;

    // Roles — required when configured.
    if (preferences.roles.length) {
      const hits = preferences.roles.map((role) => roleMatch(role, job.title)).filter(Boolean);
      if (hits.length) {
        matched.roles = hits.map((hit) => hit.value);
        score += hits.some((hit) => hit.strength === "strong") ? 3 : 2.5;
      } else missing.push("roles");
    } else score += 1.5;

    // Sectors — bonus; required only when no role is configured.
    if (preferences.sectors.length) {
      const hits = preferences.sectors.map((sector) => sectorMatch(sector, strongText, weakText)).filter(Boolean);
      if (hits.length) {
        matched.sectors = hits.map((hit) => hit.value);
        score += hits.some((hit) => hit.strength === "strong") ? 1 : 0.5;
      } else if (!preferences.roles.length) missing.push("sectors");
    } else score += 0.5;

    // Work mode.
    let modeOk = true;
    if (modes.size) {
      if (mode !== "unknown") modeOk = modes.has(mode);
      else modeOk = modes.has("onsite") || modes.has("hybrid");
      if (modeOk) {
        matched.work_modes = [mode === "unknown" ? "Modalità da verificare" : MODE_LABELS[mode]];
        score += mode === "unknown" ? 0.25 : 0.75;
        if (mode === "unknown") notes.push("Modalità di lavoro non indicata nell’annuncio");
      } else missing.push("work_modes");
    } else score += 0.5;

    // Location. A worldwide remote role is fine wherever you live, if you accept remote.
    let locationOk = true;
    if (preferences.locations.length) {
      const hits = preferences.locations.map((place) => locationMatch(place, job, mode)).filter(Boolean);
      if (hits.length) matched.locations = hits.map((hit) => hit.value);
      else if (mode === "remote" && isWorldwide(job) && (!modes.size || modes.has("remote"))) matched.locations = ["Full remote"];
      locationOk = Boolean(matched.locations);
      if (locationOk) score += hits.some((hit) => hit.strength === "city") ? 1.5 : 1;
      else missing.push("locations");
    } else score += 0.5;

    if (job.salary_text || job.salary_min || job.salary_max) score += 0.25;

    const roleOrSectorOk = preferences.roles.length
      ? Boolean(matched.roles)
      : (preferences.sectors.length ? Boolean(matched.sectors) : true);
    const matchesPreferences = roleOrSectorOk && locationOk && modeOk;
    // An opportunity outside your criteria can never look like a strong fit.
    if (!matchesPreferences) score = Math.min(score, 5.5 - missing.length * 0.5);
    const fit = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
    return { fit, matchesPreferences, matched, missing, workMode: mode, notes };
  }

  /** Country ISO codes for the preferred locations (countries and known cities). */
  function preferredCountryCodes(rawPreferences) {
    const { byName } = countries();
    const codes = new Set();
    readPreferences(rawPreferences).locations.forEach((value) => {
      const key = normalized(value);
      const place = PLACE_INDEX.get(key);
      if (place) codes.add(place.country);
      else if (byName.has(key)) codes.add(byName.get(key));
    });
    return [...codes];
  }

  /** Cities among the preferred locations: [{ name, country }] (country null when unknown). */
  function preferredCities(rawPreferences) {
    const { byName } = countries();
    return readPreferences(rawPreferences).locations
      .filter((value) => !byName.has(normalized(value)))
      .map((name) => ({ name, country: PLACE_INDEX.get(normalized(name))?.country || null }));
  }

  /** ISO country of a known city/region name in any supported language ("Milano" / "Milan" -> "IT"). */
  function placeCountry(name) {
    return PLACE_INDEX.get(normalized(name))?.country || null;
  }

  /** True when two names refer to the same known place ("Milano" vs "Milan"). */
  function samePlace(a, b) {
    const x = normalized(a);
    const y = normalized(b);
    if (x === y) return true;
    const place = PLACE_INDEX.get(x);
    return Boolean(place && place.names.includes(y));
  }

  const GROUP_LABELS = { roles: "Ruolo", sectors: "Settore", locations: "Location", work_modes: "Modalità" };

  return {
    normalized, list, scoreJob, readPreferences, hasCriteria, jobWorkMode, preferredModes,
    preferredCountryCodes, preferredCities, roleMatch, placeCountry, samePlace, GROUP_LABELS, MODE_LABELS
  };
});
