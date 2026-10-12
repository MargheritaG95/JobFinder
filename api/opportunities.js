const { fetchSources, fetchBoards, boardFromUrl, fetchTargeted, queriesFromPreferences, upsertCatalog, refreshCatalog, supabase, usable, isRecent } = require("./_lib/catalog");
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
  const why = Object.entries(result.matched).map(([group, values]) => `${matching.GROUP_LABELS[group] || group}: ${values.join(", ")}`);
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
    const preferences = (await userSupabase(`search_preferences?user_id=eq.${user.id}&select=*&limit=1`, token))?.[0] || {};
    const config = supabaseConfig();
    // Searches built from this user's roles and places run alongside the shared catalog.
    const targetedPromise = matching.hasCriteria(preferences)
      ? fetchTargeted(queriesFromPreferences([preferences]), {
        timeoutMs: 7000, jsearchLimit: 3,
        userIp: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1",
        userAgent: String(req.headers["user-agent"] || "JobFinder/2.0").slice(0, 200)
      }).catch((error) => ({ jobs: [], errors: [error.message] }))
      : Promise.resolve({ jobs: [], errors: [] });
    // Career boards of the companies this user follows: any saved/imported job or target company
    // whose link is a public Greenhouse / Lever / Ashby board gets all its openings scanned.
    const boardsPromise = Promise.all([
      userSupabase(`jobs?user_id=eq.${user.id}&select=url&limit=500`, token).catch(() => []),
      userSupabase(`companies?user_id=eq.${user.id}&select=website&limit=500`, token).catch(() => [])
    ]).then(([jobRows, companyRows]) => fetchBoards(
      [...(jobRows || []).map((row) => boardFromUrl(row.url)), ...(companyRows || []).map((row) => boardFromUrl(row.website))],
      { timeoutMs: 7000, max: 15 }
    )).catch((error) => ({ jobs: [], errors: [error.message] }));
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
      if (!catalog?.length || compatibleLeft() < requested) { await refreshCatalog({ queries: queriesFromPreferences([preferences]) }); catalog = (await catalogRows()).filter(isRecent); }
    } else {
      const sourceResult = await fetchSources();
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
    const minFit = Number(preferences.min_fit_score) || 0;
    if (!matching.hasCriteria(preferences)) return res.status(200).json({
      jobs: [], count: 0, reason: "missing_preferences",
      message: "Imposta almeno un ruolo, una location o una modalità di lavoro in Preferenze e salva: le proposte vengono scelte su quei criteri."
    });
    let ranked = (catalog || []).map((job) => ({ job, result: scoreJob(job, preferences) }))
      .filter(({ job, result }) => {
        const wasAlreadyProposed = config.hasServiceRole
          ? excluded.has(job.id)
          : excluded.has(stableUrl(job.source_url)) || excludedKeys.has(opportunityKey(job));
        return !wasAlreadyProposed && result.matchesPreferences && result.fit >= minFit;
      })
      .sort((a, b) => b.result.fit - a.result.fit || new Date(b.job.published_at || 0) - new Date(a.job.published_at || 0));
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
    if (!ranked.length) return res.status(200).json({
      jobs: [],
      count: 0,
      reason: "no_matching_opportunities",
      message: "Al momento non ci sono altre opportunità che soddisfano tutte le tue preferenze e il Fit Score minimo. Puoi modificare i criteri in Preferenze oppure riprovare al prossimo aggiornamento."
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
    const existingCompanies = await userSupabase(`companies?user_id=eq.${user.id}&select=id,name`, token);
    const companiesByName = new Map((existingCompanies || []).map((row) => [String(row.name || "").trim().toLowerCase(), row.id]));
    const created = [];
    for (const item of ranked) {
      const existing = await userSupabase(`jobs?user_id=eq.${user.id}&url=eq.${encodeURIComponent(item.job.source_url)}&select=id&limit=1`, token);
      if (existing?.length) continue;
      const companyId = await ensureCompanyId(user.id, token, companiesByName, item.job);
      const rows = await userSupabase("jobs", token, { method: "POST", body: JSON.stringify(legacyJob(user.id, item.job, item.result, companyId)), headers: { Prefer: "return=representation" } });
      if (rows?.[0]) created.push(rows[0]);
    }
    return res.status(200).json({ jobs: created, count: created.length, catalogMatches: ranked.length });
  } catch (error) {
    console.error("[opportunities] refresh failed", { message: error.message, stack: error.stack });
    return res.status(error.status || 500).json({ error: error.message });
  }
};
