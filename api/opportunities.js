const { fetchSources, refreshCatalog, supabase, usable } = require("./_lib/catalog");

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

function tokens(value) {
  return [...new Set(String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9+#.]{3,}/g) || [])];
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
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

function isFullyRemote(job) {
  const location = normalized(job.location);
  const remoteType = normalized(job.remote_type);
  const combined = `${location} ${remoteType}`;
  return /\b(remote|remoto|remota|worldwide|anywhere|from anywhere)\b/.test(combined)
    && !/\b(hybrid|ibrid[oa]|on site|onsite|in office|office based)\b/.test(combined);
}

function fieldMatches(values, field) {
  const normalizedField = normalized(field);
  if (!normalizedField) return [];
  return values.filter((value) => {
    const preference = normalized(value);
    return preference && (normalizedField.includes(preference) || preference.includes(normalizedField));
  });
}

function phraseMatches(value, haystackSet, haystackText) {
  const words = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9+#.]+/g) || [];
  if (!words.length) return false;
  return words.every((word) => (word.length >= 3 ? haystackSet.has(word) : new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystackText)));
}

function scoreJob(job, preferences) {
  const haystackText = normalized(`${job.title} ${job.company_name} ${job.industry || ""}`);
  const haystack = new Set(tokens(`${job.title} ${job.company_name} ${job.industry || ""}`));
  const groups = [["roles", list(preferences.target_roles)], ["sectors", list(preferences.target_sectors)]];
  const preferredLocations = list(preferences.locations);
  const preferredWorkModes = list(preferences.work_modes);
  const matched = {};
  let score = 5;
  for (const [name, values] of groups) {
    const hits = values.filter((value) => phraseMatches(value, haystack, haystackText));
    if (hits.length) { matched[name] = hits; score += name === "roles" ? 2 : 0.75; }
  }
  const remote = isFullyRemote(job);
  const combinedLocation = normalized(`${job.location || ""} ${job.remote_type || ""}`);
  const hybrid = /\b(hybrid|ibrid[oa])\b/.test(combinedLocation);
  const locationHits = fieldMatches(preferredLocations, job.location);
  const workModeHits = fieldMatches(preferredWorkModes, `${job.location || ""} ${job.remote_type || ""}`);
  const remoteAllowed = remote && preferredWorkModes.some((value) => /\b(remote|remoto|remota)\b/.test(normalized(value)));
  const hybridAllowed = hybrid && preferredWorkModes.some((value) => /\bhybrid\b/.test(normalized(value)));
  const onsiteAllowed = !remote && !hybrid && preferredWorkModes.some((value) => /\bon[\s-]?site\b/.test(normalized(value)));
  if (locationHits.length) matched.locations = locationHits;
  if (workModeHits.length) matched.work_modes = workModeHits;
  else if (remoteAllowed) matched.work_modes = ["Remote"];
  else if (hybridAllowed) matched.work_modes = ["Hybrid"];
  else if (onsiteAllowed) matched.work_modes = ["On-site"];
  if (matched.locations?.length) score += 0.75;
  if (matched.work_modes?.length) score += 0.75;
  const published = job.published_at ? new Date(job.published_at).getTime() : 0;
  if (published > Date.now() - 7 * 86400000) score += 0.5;
  if (job.salary_text || job.salary_min || job.salary_max) score += 0.25;
  const rolesConfigured = list(preferences.target_roles).length > 0;
  const sectorsConfigured = list(preferences.target_sectors).length > 0;
  const roleOrSectorOk = rolesConfigured ? Boolean(matched.roles?.length) : (sectorsConfigured ? Boolean(matched.sectors?.length) : false);
  const matchesPreferences = roleOrSectorOk
    && (!preferredLocations.length || Boolean(matched.locations?.length))
    && (!preferredWorkModes.length || Boolean(matched.work_modes?.length));
  return { fit: Math.max(0, Math.min(10, Number(score.toFixed(1)))), matched, matchesPreferences };
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
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  return supabase(`job_catalog?select=*&is_active=eq.true&or=(published_at.is.null,published_at.gte.${encodeURIComponent(since)})&order=published_at.desc.nullslast&limit=1000`);
}

function legacyJob(userId, job, result, companyId) {
  const why = Object.entries(result.matched).map(([group, values]) => `${group}: ${values.join(", ")}`);
  return {
    user_id: userId, ...(job.id && /^[0-9a-f-]{36}$/i.test(job.id) ? { catalog_job_id: job.id } : {}), title: job.title, role_title: job.title,
    company_name: job.company_name, company_id: companyId || null, location: job.location || job.remote_type || "N/A",
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
    let catalog;
    let excluded = new Set();
    let excludedKeys = new Set();
    if (config.hasServiceRole) {
      const existingMatches = await supabase(`user_job_matches?user_id=eq.${user.id}&select=job_id`);
      excluded = new Set((existingMatches || []).map((row) => row.job_id));
      catalog = await catalogRows();
      if (!catalog?.length || catalog.filter((job) => !excluded.has(job.id)).length < requested) { await refreshCatalog(); catalog = await catalogRows(); }
    } else {
      const sourceResult = await fetchSources();
      console.log("[opportunities] direct source refresh", {
        sources: sourceResult.results.map((result) => `${result.source}:${result.jobs.length}`),
        errors: sourceResult.errors
      });
      catalog = sourceResult.results.flatMap((result) => result.jobs).filter(usable);
      const existingJobs = await userSupabase(`jobs?user_id=eq.${user.id}&select=url,title,role_title,company_name`, token);
      const proposalHistory = await userSupabase(`user_opportunity_history?user_id=eq.${user.id}&select=opportunity_key,source_url`, token);
      excluded = new Set((existingJobs || []).map((row) => stableUrl(row.url)));
      (proposalHistory || []).forEach((row) => excluded.add(stableUrl(row.source_url)));
      excludedKeys = new Set((existingJobs || []).map(opportunityKey));
      (proposalHistory || []).forEach((row) => excludedKeys.add(row.opportunity_key));
    }
    const minFit = Number(preferences.min_fit_score) || 0;
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
    ranked = ranked.slice(0, requested);
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
