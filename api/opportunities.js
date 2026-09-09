const { refreshCatalog, supabase } = require("./_lib/catalog");

function tokens(value) {
  return [...new Set(String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9+#.]{3,}/g) || [])];
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function scoreJob(job, preferences) {
  const haystack = new Set(tokens(`${job.title} ${job.company_name} ${job.industry || ""} ${job.location || ""} ${job.remote_type || ""} ${job.description}`));
  const groups = [["roles", list(preferences.target_roles)], ["sectors", list(preferences.target_sectors)], ["locations", list(preferences.locations)], ["work_modes", list(preferences.work_modes)]];
  const matched = {};
  let score = 5;
  for (const [name, values] of groups) {
    const hits = values.filter((value) => tokens(value).some((token) => haystack.has(token)));
    if (hits.length) { matched[name] = hits; score += name === "roles" ? 2 : 0.75; }
  }
  const published = job.published_at ? new Date(job.published_at).getTime() : 0;
  if (published > Date.now() - 7 * 86400000) score += 0.5;
  if (job.salary_text || job.salary_min || job.salary_max) score += 0.25;
  return { fit: Math.max(0, Math.min(10, Number(score.toFixed(1)))), matched };
}

async function authenticatedUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Missing user session"), { status: 401 });
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw Object.assign(new Error("Invalid or expired user session"), { status: 401 });
  return response.json();
}

async function catalogRows() {
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  return supabase(`job_catalog?select=*&is_active=eq.true&or=(published_at.is.null,published_at.gte.${encodeURIComponent(since)})&order=published_at.desc.nullslast&limit=1000`);
}

function legacyJob(userId, job, result) {
  const why = Object.entries(result.matched).map(([group, values]) => `${group}: ${values.join(", ")}`);
  return {
    user_id: userId, catalog_job_id: job.id, title: job.title, role_title: job.title,
    company_name: job.company_name, location: job.location || job.remote_type || "N/A",
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server catalog configuration is incomplete");
    const user = await authenticatedUser(req);
    const requested = Math.max(1, Math.min(20, Number(req.body?.limit) || 6));
    const preferences = (await supabase(`search_preferences?user_id=eq.${user.id}&select=*&limit=1`))?.[0] || {};
    const existingMatches = await supabase(`user_job_matches?user_id=eq.${user.id}&select=job_id`);
    const excluded = new Set((existingMatches || []).map((row) => row.job_id));
    let catalog = await catalogRows();
    if (!catalog?.length || catalog.filter((job) => !excluded.has(job.id)).length < requested) { await refreshCatalog(); catalog = await catalogRows(); }
    const minFit = Number(preferences.min_fit_score) || 0;
    let ranked = (catalog || []).map((job) => ({ job, result: scoreJob(job, preferences) }))
      .filter(({ job, result }) => !excluded.has(job.id) && result.fit >= minFit)
      .sort((a, b) => b.result.fit - a.result.fit || new Date(b.job.published_at || 0) - new Date(a.job.published_at || 0));
    if (ranked.length < requested) {
      const already = new Set(ranked.map(({ job }) => job.id));
      ranked.push(...(catalog || []).map((job) => ({ job, result: scoreJob(job, preferences) }))
        .filter(({ job }) => !excluded.has(job.id) && !already.has(job.id)).sort((a, b) => b.result.fit - a.result.fit).slice(0, requested - ranked.length));
    }
    ranked = ranked.slice(0, requested);
    if (!ranked.length) return res.status(200).json({ jobs: [], count: 0, reason: "catalog_exhausted" });
    const now = new Date().toISOString();
    await supabase("user_job_matches?on_conflict=user_id,job_id", {
      method: "POST", body: JSON.stringify(ranked.map(({ job, result }) => ({ user_id: user.id, job_id: job.id, fit_score: result.fit, matched_preferences: result.matched, why_fit: Object.values(result.matched).flat(), gaps: [], angle: [], status: "NEW", first_proposed_at: now, last_proposed_at: now, updated_at: now }))),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
    });
    const created = [];
    for (const item of ranked) {
      const existing = await supabase(`jobs?user_id=eq.${user.id}&catalog_job_id=eq.${item.job.id}&select=id&limit=1`);
      if (existing?.length) continue;
      const rows = await supabase("jobs", { method: "POST", body: JSON.stringify(legacyJob(user.id, item.job, item.result)), headers: { Prefer: "return=representation" } });
      if (rows?.[0]) created.push(rows[0]);
    }
    return res.status(200).json({ jobs: created, count: created.length, catalogMatches: ranked.length });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};
