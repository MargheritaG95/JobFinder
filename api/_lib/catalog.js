const crypto = require("crypto");

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?limit=100";
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";
const JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs?count=200&geo=europe";
const HIMALAYAS_URL = "https://himalayas.app/jobs/api?limit=200";

function decodeHtmlEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hexadecimal, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hexadecimal) return String.fromCodePoint(parseInt(hexadecimal, 16));
    return Object.prototype.hasOwnProperty.call(named, name.toLowerCase()) ? named[name.toLowerCase()] : entity;
  });
}

function stripHtml(value) {
  let text = String(value || "");
  for (let pass = 0; pass < 4; pass += 1) {
    const decoded = decodeHtmlEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function responsibilities(description) {
  const text = stripHtml(description);
  return text.split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(responsib|manage|lead|develop|build|coordinate|deliver|support|drive|own|create|analy[sz]e|collaborat|implement|define|monitor)\w*/i.test(sentence))
    .map((sentence) => sentence.replace(/^[-•]\s*/, "").trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 280)
    .slice(0, 6);
}

function extract(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match) return compact(match[1] || match[0]);
  }
  return null;
}

function enrich(job) {
  const description = stripHtml(job.description);
  const combined = `${job.title} ${description}`;
  const experience = extract(combined, [/(\d{1,2}\+?\s*(?:years?|anni)\s+(?:of\s+)?experience)/i, /(minimum\s+of\s+\d{1,2}\s+years?)/i]);
  const employment = job.employment_type || extract(combined, [/\b(full[- ]time|part[- ]time|contract|internship|temporary|permanent|tempo indeterminato|tempo determinato)\b/i]);
  const seniority = job.seniority || extract(job.title, [/\b(intern|junior|mid[- ]?level|senior|lead|head|director|vp|vice president|manager)\b/i]);
  const languages = [...new Set((combined.match(/\b(Italian|English|French|Spanish|German|Italiano|Inglese|Francese|Spagnolo|Tedesco)\b/gi) || []).map((v) => v.toLowerCase()))];
  const remote = /\b(remote|remoto)\b/i.test(combined) ? "Remote" : /\bhybrid|ibrid[oa]\b/i.test(combined) ? "Hybrid" : null;
  const salary = job.salary_text || extract(description, [
    /((?:€|EUR|£|GBP|\$|USD)\s?\d{2,3}(?:[.,]\d{3})?(?:\s?[-–]\s?(?:€|EUR|£|GBP|\$|USD)?\s?\d{2,3}(?:[.,]\d{3})?)?(?:\s*(?:per year|annui|RAL|p\.a\.))?)/i,
    /(\d{2,3}(?:[.,]\d{3})?\s?[-–]\s?\d{2,3}(?:[.,]\d{3})?\s?(?:EUR|euro|GBP|USD))/i
  ]);
  const companyDescription = job.company_description || extract(description, [
    /(?:about (?:us|the company)|chi siamo|the company)\s*[:\-]?\s*([^]{80,700}?)(?=\b(?:the role|your role|responsibilities|what you|il ruolo|responsabilit|requirements|requisiti)\b)/i
  ]);
  return {
    ...job,
    description,
    responsibilities: responsibilities(job.description),
    experience_required: experience,
    employment_type: employment,
    seniority,
    languages,
    remote_type: job.remote_type || remote,
    salary_text: salary,
    company_description: companyDescription,
    description_hash: crypto.createHash("sha256").update(description).digest("hex"),
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true
  };
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", "User-Agent": "JobFinder/2.0", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.json();
}

function normalizeRemotive(job) {
  return enrich({
    source: "Remotive", source_job_id: String(job.id), source_url: job.url,
    title: compact(job.title), company_name: compact(job.company_name), company_logo_url: job.company_logo || null,
    industry: compact(job.category) || null, location: compact(job.candidate_required_location) || "Remote",
    remote_type: "Remote", description: job.description, salary_text: compact(job.salary) || null,
    employment_type: compact(job.job_type) || null, published_at: asIso(job.publication_date), raw_data: job
  });
}

function normalizeArbeitnow(job) {
  return enrich({
    source: "Arbeitnow", source_job_id: String(job.slug || job.url), source_url: job.url,
    title: compact(job.title), company_name: compact(job.company_name), company_logo_url: null,
    industry: Array.isArray(job.tags) ? job.tags.join(" · ") : null, location: compact(job.location) || null,
    remote_type: job.remote ? "Remote" : null, description: job.description, salary_text: null,
    employment_type: Array.isArray(job.job_types) ? job.job_types.join(" · ") : null,
    published_at: job.created_at ? asIso(Number(job.created_at) * 1000) : null, raw_data: job
  });
}

function normalizeJobicy(job) {
  return enrich({
    source: "Jobicy", source_job_id: String(job.id || job.jobSlug), source_url: job.url,
    title: compact(job.jobTitle), company_name: compact(job.companyName), company_logo_url: job.companyLogo || null,
    industry: Array.isArray(job.jobIndustry) ? job.jobIndustry.join(" · ") : compact(job.jobIndustry) || null,
    location: compact(job.jobGeo) || "Remote", remote_type: "Remote", description: job.jobDescription || job.jobExcerpt,
    employment_type: Array.isArray(job.jobType) ? job.jobType.join(" · ") : compact(job.jobType) || null,
    seniority: compact(job.jobLevel) || null, published_at: asIso(job.pubDate), raw_data: job
  });
}

function normalizeHimalayas(job) {
  const salary = job.minSalary || job.maxSalary
    ? `${job.currency || ""} ${job.minSalary || ""}${job.maxSalary ? ` – ${job.maxSalary}` : ""} ${job.salaryPeriod || ""}`.trim()
    : null;
  return enrich({
    source: "Himalayas", source_job_id: String(job.guid || job.applicationLink), source_url: job.applicationLink || job.guid,
    title: compact(job.title), company_name: compact(job.companyName), company_logo_url: job.companyLogo || null,
    industry: Array.isArray(job.categories) ? job.categories.slice(0, 4).join(" · ") : null,
    location: Array.isArray(job.locationRestrictions) && job.locationRestrictions.length ? job.locationRestrictions.join(" · ") : "Remote",
    remote_type: "Remote", description: job.description || job.excerpt, salary_text: salary,
    salary_min: job.minSalary || null, salary_max: job.maxSalary || null, salary_currency: job.currency || null,
    employment_type: compact(job.employmentType) || null,
    seniority: Array.isArray(job.seniority) ? job.seniority.join(" · ") : compact(job.seniority) || null,
    published_at: typeof job.pubDate === "number" ? asIso(job.pubDate * 1000) : asIso(job.pubDate), raw_data: job
  });
}

function normalizeAdzuna(job) {
  return enrich({
    source: "Adzuna", source_job_id: String(job.id), source_url: job.redirect_url,
    title: compact(job.title), company_name: compact(job.company?.display_name), company_logo_url: null,
    industry: compact(job.category?.label) || null, location: compact(job.location?.display_name) || null,
    description: job.description, salary_text: job.salary_min || job.salary_max ? `${job.salary_min || ""}${job.salary_max ? ` – ${job.salary_max}` : ""}` : null,
    salary_min: job.salary_min || null, salary_max: job.salary_max || null, salary_currency: "EUR",
    employment_type: compact(job.contract_type || job.contract_time) || null, published_at: asIso(job.created), raw_data: job
  });
}

function displaySlug(slug) {
  return String(slug || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeGreenhouse(job, board) {
  return enrich({
    source: "Greenhouse", source_job_id: `${board}:${job.id}`, source_url: job.absolute_url,
    title: compact(job.title), company_name: displaySlug(board), location: compact(job.location?.name) || null,
    industry: null, description: job.content, published_at: asIso(job.updated_at), source_updated_at: asIso(job.updated_at), raw_data: job
  });
}

function normalizeLever(job, site) {
  return enrich({
    source: "Lever", source_job_id: `${site}:${job.id}`, source_url: job.hostedUrl || job.applyUrl,
    title: compact(job.text), company_name: displaySlug(site), location: compact(job.categories?.location) || null,
    industry: compact(job.categories?.team) || null, description: `${job.descriptionPlain || ""} ${job.additionalPlain || ""}`,
    employment_type: compact(job.categories?.commitment) || null, published_at: job.createdAt ? asIso(job.createdAt) : null, raw_data: job
  });
}

async function fetchSources() {
  const tasks = [
    getJson(REMOTIVE_URL).then((data) => ({ source: "Remotive", jobs: (data.jobs || []).map(normalizeRemotive) })),
    ...[1, 2, 3].map((page) => getJson(`${ARBEITNOW_URL}?page=${page}`).then((data) => ({ source: `Arbeitnow:${page}`, jobs: (data.data || []).map(normalizeArbeitnow) }))),
    getJson(JOBICY_URL).then((data) => ({ source: "Jobicy", jobs: (data.jobs || []).map(normalizeJobicy) })),
    getJson(HIMALAYAS_URL).then((data) => ({ source: "Himalayas", jobs: (data.jobs || []).map(normalizeHimalayas) }))
  ];
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    const params = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY, results_per_page: "50", "content-type": "application/json" });
    tasks.push(getJson(`https://api.adzuna.com/v1/api/jobs/it/search/1?${params}`).then((data) => ({ source: "Adzuna", jobs: (data.results || []).map(normalizeAdzuna) })));
  }
  for (const board of String(process.env.GREENHOUSE_BOARDS || "").split(",").map((v) => v.trim()).filter(Boolean)) {
    tasks.push(getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`).then((data) => ({ source: `Greenhouse:${board}`, jobs: (data.jobs || []).map((job) => normalizeGreenhouse(job, board)) })));
  }
  for (const site of String(process.env.LEVER_SITES || "").split(",").map((v) => v.trim()).filter(Boolean)) {
    tasks.push(getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`).then((data) => ({ source: `Lever:${site}`, jobs: (data || []).map((job) => normalizeLever(job, site)) })));
  }
  const settled = await Promise.allSettled(tasks);
  const results = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").map((item) => item.reason?.message || String(item.reason));
  return { results, errors };
}

function usable(job) {
  return Boolean(job.source && job.source_job_id && /^https?:\/\//i.test(job.source_url || "") && job.title && job.company_name && job.description?.length >= 80);
}

async function supabase(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function refreshCatalog() {
  const { results, errors } = await fetchSources();
  const jobs = results.flatMap((result) => result.jobs).filter(usable);
  if (!jobs.length) throw new Error(`No source returned usable jobs. ${errors.join("; ")}`);
  const deduped = [...new Map(jobs.map((job) => [job.source_url, job])).values()];
  const stored = [];
  for (let offset = 0; offset < deduped.length; offset += 75) {
    const rows = await supabase("job_catalog?on_conflict=source,source_job_id", {
      method: "POST", body: JSON.stringify(deduped.slice(offset, offset + 75)),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" }
    });
    stored.push(...(rows || []));
  }
  return { jobs: stored, fetched: jobs.length, accepted: deduped.length, sources: results.map((r) => r.source), errors };
}

module.exports = { stripHtml, fetchSources, refreshCatalog, supabase };
