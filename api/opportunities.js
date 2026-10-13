const { isRemoteOnlySource, rotateQueries, fetchSources, fetchBoards, boardFromUrl, fetchTargeted, queriesFromPreferences, upsertCatalog, refreshCatalog, supabase, usable, isRecent } = require("./_lib/catalog");
const matching = require("../shared/matching");

const PUBLIC_SUPABASE_URL = "https://moyabdwxlbkfqmtjuwwa.supabase.co";
const PUBLIC_SUPABASE_KEY = "sb_publishable_kzopFoXWx_DBRo8giCgGDg_ITMsOsbV";

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || PUBLIC_SUPABASE_KEY,
    hasServiceRole: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

async function userSupabase(path, token, options = {}) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function normalized(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function stableUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|trk|tracking|ref|source|campaign|gh_src)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch (_) {
    return String(value || "").trim();
  }
}

function opportunityKey(job) {
  return `${normalized(job.title || job.role_title)}::${normalized(job.company_name)}`;
}

function scoreJob(job, preferences) {
  return matching.scoreJob(job, preferences);
}

async function authenticatedUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Missing user session"), { status: 401 });
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.key, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw Object.assign(new Error("Invalid or expired user session"), { status: 401 });
  return response.json();
}

async function catalogRows() {
  const since = new Date(Date.now() - 40 * 86400000).toISOString();
  const pages = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const batch = await supabase(`job_catalog?select=*&is_active=eq.true&published_at=gte.${encodeURIComponent(since)}&order=published_at.desc.nullslast&limit=1000&offset=${offset}`);
    pages.push(...(batch || []));
    if (!batch || batch.length < 1000) break;
  }
  return pages;
}

function legacyJob(userId, job, result, companyId) {
  const why = (result.criteria || []).filter((item) => item.status === "match").map((item) => `${item.label}: ${item.detail}`)
    .concat(result.target ? [`Azienda target: ${result.target}`] : []);
  return {
    user_id: userId, ...(job.id && /^[0-9a-f-]{36}$/i.test(job.id) ? { catalog_job_id: job.id } : {}), title: job.title, role_title: job.title,
    company_name: job.company_name, company_id: companyId || null, location: [job.location, job.remote_type && !matching.normalized(job.location).includes(matching.normalized(job.remote_type)) ? job.remote_type : ""].filter(Boolean).join(" · ") || "N/A",
    fit_score: result.fit, status: "NEW", priority: result.fit >= 8 ? "APPLY" : "REVIEW",
    source: job.source, url: job.source_url, is_saved: false,
    why_fit: why.length ? why : ["Annuncio recente compatibile con la ricerca attiva"],
    gaps: [], angle: [], industry: job.industry, description: job.description,
    salary_text: job.salary_text, seniority: job.seniority,
    experience_required: job.experience_required, employment_type: job.employment_type,
    languages: job.languages || [], company_description: job.company_description,
    responsibilities: job.responsibilities || [], scrape_status: "complete", scraped_at: new Date().toISOString()
  };
}

async function ensureCompanyId(userId, token, companiesByName, job) {
  const name = String(job.company_name || "").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  if (companiesByName.has(key)) return companiesByName.get(key);
  try {
    const rows = await userSupabase("companies", token, {
      method: "POST",
      body: JSON.stringify({
        user_id: userId, name, sector: job.industry || null,
        logo_url: job.company_logo_url || null, website: job.company_website || null,
        tier: "C", notes: job.company_description || null
      }),
      headers: { Prefer: "return=representation" }
    });
    const id = rows?.[0]?.id || null;
    companiesByName.set(key, id);
    return id;
  } catch (error) {
    console.error("[opportunities] company creation failed", { name, message: error.message });
    companiesByName.set(key, null);
    return null;
  }
}

module.exports = async function handler(req, res) {
  const requestOrigin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await authenticatedUser(req);
    const token = String(req.headers.authorization).replace(/^Bearer\s+/i, "");
    const requested = Math.max(1, Math.min(20, Number(req.body?.limit) || 6));
    let preferences = (await userSupabase(`search_preferences?user_id=eq.${user.id}&select=*&limit=1`, token).catch(() => null))?.[0] || {};
    // Fallback: the app sends the preferences it shows; use them when the stored row has no criteria.
    const sent = req.body?.preferences;
    if (!matching.hasCriteria(preferences) && sent && typeof sent === "object") {
      const clean = (value) => matching.list(value).map((item) => String(item).slice(0, 120)).slice(0, 30);
      preferences = {
        ...preferences,
        target_roles: clean(sent.target_roles), target_sectors: clean(sent.target_sectors),
        locations: clean(sent.locations), work_modes: clean(sent.work_modes),
        min_fit_score: Math.max(0, Math.min(10, Number(sent.min_fit_score) || 0))
      };
    }
    // "Solo multinazionali" lives in the user's account settings, so the app sends it with each request.
    preferences = { ...preferences, only_multinationals: false };
    // Aziende target: the companies the user chose to focus on. They get dedicated searches,
    // a higher Fit and always pass the "solo multinazionali" filter.
    const ownCompanies = (await userSupabase(`companies?user_id=eq.${user.id}&select=id,name,website&limit=500`, token).catch(() => [])) || [];
    preferences = { ...preferences, target_companies: ownCompanies.map((row) => String(row.name || "").trim()).filter(Boolean) };
    const config = supabaseConfig();
    // What every source returned and why listings were discarded, shown in the app
    // ("Dettagli ultima ricerca") so a thin result can be explained.
    const diag = { at: new Date().toISOString(), mode: config.hasServiceRole ? "catalogo" : "diretta", sources: {}, errors: [] };
    const track = (outcome) => {
      (outcome?.results || []).forEach((result) => {
        const name = String(result.source || "?").split(":")[0];
        diag.sources[name] = (diag.sources[name] || 0) + (result.jobs || []).length;
      });
      (outcome?.errors || []).forEach((error) => { if (diag.errors.length < 10) diag.errors.push(String(error).slice(0, 160)); });
      return outcome;
    };
    // Searches built from this user's roles and places run alongside the shared catalog.
    // Every role × country and role × city combination, in fair order; JSearch walks through it
    // three queries per click, continuing where this user's previous click stopped.
    const allQueries = queriesFromPreferences([preferences], { maxQueries: 80 });
    const rotation = rotateQueries(allQueries, req.body?.jsearchOffset, 5);
    const jsearchInfo = (process.env.OPENWEBNINJA_API_KEY || process.env.JSEARCH_API_KEY)
      ? { jsearchNextOffset: rotation.nextOffset, jsearchSearched: rotation.picked.map((query) => `${query.what} · ${query.where || query.country.toUpperCase()}`), jsearchTotal: allQueries.length }
      : {};
    const targetedPromise = matching.hasCriteria(preferences)
      ? fetchTargeted(allQueries.slice(0, 20), {
        timeoutMs: 7000, jsearchQueries: rotation.picked,
        userIp: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1",
        userAgent: String(req.headers["user-agent"] || "JobFinder/2.0").slice(0, 200)
      }).catch((error) => ({ jobs: [], errors: [error.message] })).then(track)
      : Promise.resolve({ jobs: [], errors: [] });
    // Career boards of the companies this user follows: any saved/imported job or target company
    // whose link is a public Greenhouse / Lever / Ashby board gets all its openings scanned.
    const boardsPromise = Promise.all([
      userSupabase(`jobs?user_id=eq.${user.id}&select=url&limit=500`, token).catch(() => []),
      Promise.resolve(ownCompanies)
    ]).then(([jobRows, companyRows]) => fetchBoards(
      [...(jobRows || []).map((row) => boardFromUrl(row.url)), ...(companyRows || []).map((row) => boardFromUrl(row.website))],
      { timeoutMs: 7000, max: 15 }
    )).catch((error) => ({ jobs: [], errors: [error.message] })).then(track);
    let catalog;
    let excluded = new Set();
    let excludedKeys = new Set();
    if (config.hasServiceRole) {
      const existingMatches = await supabase(`user_job_matches?user_id=eq.${user.id}&select=job_id`);
      excluded = new Set((existingMatches || []).map((row) => row.job_id));
      catalog = (await catalogRows()).filter(isRecent);
      const [targeted, followed] = await Promise.all([targetedPromise, boardsPromise]);
      const extra = targeted.jobs.concat(followed.jobs);
      if (extra.length) {
        const { stored } = await upsertCatalog(extra);
        const known = new Set(catalog.map((job) => job.id));
        catalog.push(...stored.filter((job) => !known.has(job.id) && isRecent(job)));
      }
      const compatibleLeft = () => catalog.filter((job) => !excluded.has(job.id) && scoreJob(job, preferences).matchesPreferences).length;
      if (!catalog?.length || compatibleLeft() < requested) {
        try { track(await refreshCatalog({ queries: queriesFromPreferences([preferences]) })); }
        catch (error) { diag.errors.push(`Aggiornamento catalogo: ${String(error.message).slice(0, 160)}`); }
        catalog = (await catalogRows()).filter(isRecent);
      }
      diag.catalogBySource = catalog.reduce((acc, job) => { acc[job.source || "?"] = (acc[job.source || "?"] || 0) + 1; return acc; }, {});
    } else {
      const sourceResult = track(await fetchSources());
      console.log("[opportunities] direct source refresh", {
        sources: sourceResult.results.map((result) => `${result.source}:${result.jobs.length}`),
        errors: sourceResult.errors
      });
      const [targeted, followed] = await Promise.all([targetedPromise, boardsPromise]);
      catalog = sourceResult.results.flatMap((result) => result.jobs).filter(usable).concat(targeted.jobs, followed.jobs);
      const existingJobs = await userSupabase(`jobs?user_id=eq.${user.id}&select=url,title,role_title,company_name`, token);
      const proposalHistory = await userSupabase(`user_opportunity_history?user_id=eq.${user.id}&select=opportunity_key,source_url`, token);
      excluded = new Set((existingJobs || []).map((row) => stableUrl(row.url)));
      (proposalHistory || []).forEach((row) => excluded.add(stableUrl(row.source_url)));
      excludedKeys = new Set((existingJobs || []).map(opportunityKey));
      (proposalHistory || []).forEach((row) => excludedKeys.add(row.opportunity_key));
    }
    if (!matching.hasCriteria(preferences)) return res.status(200).json({
      jobs: [], count: 0, reason: "missing_preferences", diagnostics: diag,
      message: "Imposta almeno un ruolo, una location o una modalità di lavoro in Preferenze e salva: le proposte vengono scelte su quei criteri."
    });
    catalog = (catalog || []).filter((job) => !isRemoteOnlySource(job.source));
    const stats = { letti: (catalog || []).length, giaProposti: 0, fuoriRuolo: 0, fuoriSettore: 0, fuoriLocation: 0, fuoriModalita: 0, nonMultinazionali: 0, compatibili: 0 };
    const missingKey = { roles: "fuoriRuolo", sectors: "fuoriSettore", locations: "fuoriLocation", work_modes: "fuoriModalita", company: "nonMultinazionali" };
    stats.daAziendeTarget = 0;
    const samples = [];
    let ranked = (catalog || []).map((job) => ({ job, result: scoreJob(job, preferences) }))
      .filter(({ job, result }) => {
        const wasAlreadyProposed = config.hasServiceRole
          ? excluded.has(job.id)
          : excluded.has(stableUrl(job.source_url)) || excludedKeys.has(opportunityKey(job));
        if (wasAlreadyProposed) { stats.giaProposti += 1; return false; }
        if (!result.matchesPreferences) {
          result.missing.forEach((group) => { if (missingKey[group]) stats[missingKey[group]] += 1; });
          // Right role, wrong place or mode: the most useful examples to understand the filters.
          if (result.matched.roles && samples.length < 6) samples.push({ titolo: job.title, luogo: job.location || "—", fonte: job.source, scartato: result.missing.map((group) => ({ roles: "ruolo", sectors: "settore", locations: "luogo", work_modes: "modalità", company: "non multinazionale" })[group] || group).join(", ") });
          return false;
        }
        stats.compatibili += 1;
        if (result.target) stats.daAziendeTarget += 1;
        return true;
      })
      // Paese/città, then ruolo, settore, modalità (see shared/matching.js scoreJob).
      .sort((a, b) => b.result.rank - a.result.rank);
    console.log("[opportunities] matching summary", {
      mode: config.hasServiceRole ? "catalog" : "direct-fallback",
      catalog: (catalog || []).length,
      excluded: excluded.size,
      excludedKeys: excludedKeys.size,
      compatible: ranked.length,
      requested
    });
    const diversified = [];
    const remaining = [...ranked];
    const seenCompanies = new Set();
    while (remaining.length && diversified.length < requested) {
      const index = remaining.findIndex(({ job }) => !seenCompanies.has(normalized(job.company_name)));
      const [picked] = remaining.splice(index < 0 ? 0 : index, 1);
      diversified.push(picked);
      seenCompanies.add(normalized(picked.job.company_name));
    }
    ranked = diversified;
    Object.assign(diag, { stats, esempiScartati: samples, jsearch: jsearchInfo.jsearchSearched || null });
    if (!ranked.length) return res.status(200).json({
      ...jsearchInfo,
      diagnostics: diag,
      jobs: [],
      count: 0,
      reason: "no_matching_opportunities",
      message: "Al momento non ci sono altre opportunità che rispettano Paese/città, ruoli, settori e modalità scelti. Puoi allargare i criteri in Preferenze oppure riprovare al prossimo aggiornamento."
    });
    const now = new Date().toISOString();
    if (config.hasServiceRole) {
      await supabase("user_job_matches?on_conflict=user_id,job_id", {
        method: "POST", body: JSON.stringify(ranked.map(({ job, result }) => ({ user_id: user.id, job_id: job.id, fit_score: result.fit, matched_preferences: result.matched, why_fit: Object.values(result.matched).flat(), gaps: [], angle: [], status: "NEW", first_proposed_at: now, last_proposed_at: now, updated_at: now }))),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
      });
    } else {
      await userSupabase("user_opportunity_history?on_conflict=user_id,opportunity_key", token, {
        method: "POST",
        body: JSON.stringify(ranked.map(({ job }) => ({
          user_id: user.id,
          opportunity_key: opportunityKey(job),
          source_url: stableUrl(job.source_url),
          first_proposed_at: now,
          last_proposed_at: now
        }))),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
      });
    }
    // Proposals never add companies to Aziende target: they are only linked to an existing target.
    const targetIdFor = (name) => ownCompanies.find((row) => matching.sameCompany(row.name, name))?.id || null;
    const created = [];
    for (const item of ranked) {
      const existing = await userSupabase(`jobs?user_id=eq.${user.id}&url=eq.${encodeURIComponent(item.job.source_url)}&select=id&limit=1`, token);
      if (existing?.length) continue;
      const companyId = targetIdFor(item.job.company_name);
      const rows = await userSupabase("jobs", token, { method: "POST", body: JSON.stringify(legacyJob(user.id, item.job, item.result, companyId)), headers: { Prefer: "return=representation" } });
      if (rows?.[0]) created.push(rows[0]);
    }
    diag.stats.importati = created.length;
    return res.status(200).json({ jobs: created, count: created.length, catalogMatches: ranked.length, ...jsearchInfo, diagnostics: diag });
  } catch (error) {
    console.error("[opportunities] refresh failed", { message: error.message, stack: error.stack });
    return res.status(error.status || 500).json({ error: error.message });
  }
};
