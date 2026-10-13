const crypto = require("crypto");
const matching = require("../../shared/matching");

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?limit=100";
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";
const JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs?count=200";
const HIMALAYAS_URL = "https://himalayas.app/jobs/api?limit=200";
const REMOTEOK_URL = "https://remoteok.com/api";
const MUSE_URL = "https://www.themuse.com/api/public/jobs";
const WORKING_NOMADS_URL = "https://www.workingnomads.com/api/exposed_jobs/";
const WWR_URL = "https://weworkremotely.com/remote-jobs.rss";

// Public career boards (no key) of employers hiring across Europe. Verified to return listings.
// Override or extend with GREENHOUSE_BOARDS / LEVER_SITES / ASHBY_BOARDS (comma-separated slugs).
const DEFAULT_BOARDS = {
  greenhouse: ["airbnb", "datadog", "mongodb", "stripe", "elastic"],
  lever: ["spotify"],
  ashby: ["notion"]
};

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
  // Hybrid is checked before remote: "hybrid, 2 days remote" is not a remote role.
  const mode = matching.jobWorkMode({ ...job, description });
  const remote = mode === "unknown" ? null : matching.MODE_LABELS[mode];
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

function defaultSignal() {
  // A slow source must never make the whole request time out.
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined;
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    signal: defaultSignal(),
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

function normalizeRemoteOk(job) {
  return enrich({
    source: "RemoteOK", source_job_id: String(job.id), source_url: job.url || job.apply_url,
    title: compact(job.position), company_name: compact(job.company), company_logo_url: job.company_logo || job.logo || null,
    industry: Array.isArray(job.tags) ? job.tags.slice(0, 4).join(" · ") : null,
    location: compact(job.location) || "Remote", remote_type: "Remote", description: job.description,
    salary_min: job.salary_min || null, salary_max: job.salary_max || null,
    published_at: job.date ? asIso(job.date) : (job.epoch ? asIso(job.epoch * 1000) : null), raw_data: job
  });
}

function normalizeMuse(job) {
  const location = Array.isArray(job.locations) && job.locations.length ? job.locations.map((l) => l.name).join(" · ") : null;
  return enrich({
    source: "TheMuse", source_job_id: String(job.id), source_url: job.refs && job.refs.landing_page,
    title: compact(job.name), company_name: compact(job.company && job.company.name),
    industry: Array.isArray(job.categories) && job.categories.length ? job.categories.map((c) => c.name).join(" · ") : null,
    location, remote_type: null, description: job.contents,
    seniority: Array.isArray(job.levels) && job.levels.length ? job.levels.map((l) => l.name).join(" · ") : null,
    published_at: asIso(job.publication_date), raw_data: job
  });
}

function withCountry(location, countryName) {
  const value = compact(location);
  if (!countryName) return value || null;
  if (!value) return countryName;
  return matching.normalized(value).includes(matching.normalized(countryName)) ? value : `${value}, ${countryName}`;
}

function countryLabel(code) {
  try { return new Intl.DisplayNames(["it"], { type: "region" }).of(String(code || "").toUpperCase()) || null; }
  catch (_) { return null; }
}

function normalizeAdzuna(job, country) {
  const area = Array.isArray(job.location?.area) ? job.location.area : [];
  return enrich({
    source: "Adzuna", source_job_id: String(job.id), source_url: job.redirect_url,
    title: compact(job.title), company_name: compact(job.company?.display_name), company_logo_url: null,
    industry: compact(job.category?.label) || null, location: withCountry(job.location?.display_name, area[0] || countryLabel(country)),
    description: job.description, salary_text: job.salary_min || job.salary_max ? `${job.salary_min || ""}${job.salary_max ? ` – ${job.salary_max}` : ""}` : null,
    salary_min: job.salary_min || null, salary_max: job.salary_max || null, salary_currency: "EUR",
    employment_type: compact(job.contract_type || job.contract_time) || null, published_at: asIso(job.created), raw_data: job
  });
}

function normalizeJooble(job, region) {
  return enrich({
    source: "Jooble", source_job_id: region + ":" + String(job.id || job.link),
    source_url: job.link, title: compact(job.title),
    company_name: compact(job.company), location: withCountry(job.location, region === "us" ? null : countryLabel(region)),
    description: compact(job.snippet), salary_text: compact(job.salary) || null,
    employment_type: compact(job.type) || null, published_at: asIso(job.updated),
    raw_data: job
  });
}

function countryLabelEn(code) {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(String(code || "").toUpperCase()) || null; }
  catch (_) { return null; }
}

// JSearch reads Google for Jobs, so listings come from LinkedIn, Glassdoor, Indeed, company sites…
// The publisher is kept as the visible source (e.g. "LinkedIn").
function normalizeJSearch(job, country) {
  const posted = job.job_posted_at_datetime_utc || (job.job_posted_at_timestamp ? job.job_posted_at_timestamp * 1000 : null);
  const place = [job.job_city, job.job_state].filter(Boolean).join(", ");
  const salary = job.job_min_salary || job.job_max_salary
    ? `${job.job_salary_currency || ""} ${job.job_min_salary || ""}${job.job_max_salary ? ` – ${job.job_max_salary}` : ""}${job.job_salary_period ? ` / ${String(job.job_salary_period).toLowerCase()}` : ""}`.trim()
    : null;
  return enrich({
    source: compact(job.job_publisher) || "Google Jobs", source_job_id: `jsearch:${job.job_id}`,
    source_url: job.job_apply_link || job.job_google_link,
    title: compact(job.job_title || job.title), company_name: compact(job.employer_name || job.company_name || job.company),
    company_logo_url: job.employer_logo || null, company_website: job.employer_website || null,
    location: withCountry(place, countryLabel(job.job_country || country)),
    remote_type: job.job_is_remote ? "Remote" : null, description: job.job_description || job.description,
    salary_text: salary, salary_min: job.job_min_salary || null, salary_max: job.job_max_salary || null, salary_currency: job.job_salary_currency || null,
    employment_type: compact(job.job_employment_type) || null, published_at: asIso(posted), raw_data: { job_id: job.job_id, job_publisher: job.job_publisher }
  });
}

function normalizeCareerjet(job, country) {
  return enrich({
    source: "Careerjet", source_job_id: `${country}:${job.url}`, source_url: job.url,
    title: compact(job.title), company_name: compact(job.company), company_logo_url: null,
    location: withCountry(job.locations, countryLabel(country)), description: job.description,
    salary_text: compact(job.salary) || null, published_at: asIso(job.date), raw_data: job
  });
}

function normalizeWorkingNomads(job) {
  return enrich({
    source: "Working Nomads", source_job_id: String(job.url), source_url: job.url,
    title: compact(job.title), company_name: compact(job.company_name), company_logo_url: null,
    industry: compact(job.category_name) || null, location: compact(job.location) || "Remote", remote_type: "Remote",
    description: job.description, published_at: asIso(job.pub_date), raw_data: job
  });
}

const CAREERJET_LOCALES = { it: "it_IT", gb: "en_GB", ie: "en_IE", us: "en_US", de: "de_DE", at: "de_AT", ch: "de_CH", fr: "fr_FR", be: "fr_BE", lu: "fr_LU", es: "es_ES", pt: "pt_PT", nl: "nl_NL", pl: "pl_PL", se: "sv_SE", dk: "da_DK", no: "no_NO", fi: "fi_FI", cz: "cs_CZ", gr: "el_GR", hu: "hu_HU", ro: "ro_RO" };

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

function normalizeAshby(job, board) {
  const locations = [job.location, ...(Array.isArray(job.secondaryLocations) ? job.secondaryLocations.map((item) => item.location || item) : [])].filter((item) => typeof item === "string" && item);
  return enrich({
    source: "Ashby", source_job_id: `${board}:${job.id}`, source_url: job.jobUrl || job.applyUrl,
    title: compact(job.title), company_name: displaySlug(board), location: compact(locations.join(" · ")) || null,
    remote_type: job.isRemote ? "Remote" : (/hybrid/i.test(job.workplaceType || "") ? "Hybrid" : (/onsite|on-site/i.test(job.workplaceType || "") ? "On-site" : null)),
    industry: compact(job.department || job.team) || null, description: job.descriptionPlain || job.descriptionHtml,
    employment_type: compact(job.employmentType) || null, published_at: asIso(job.publishedAt), raw_data: { id: job.id }
  });
}

function xmlField(item, name) {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

// We Work Remotely RSS: "Company: Role" titles, region/country per item.
function parseWwr(xml) {
  return (String(xml).match(/<item>[\s\S]*?<\/item>/gi) || []).map((item) => {
    const rawTitle = stripHtml(xmlField(item, "title"));
    const split = rawTitle.indexOf(":");
    const company = split > 0 ? rawTitle.slice(0, split) : "";
    const title = split > 0 ? rawTitle.slice(split + 1) : rawTitle;
    const region = [xmlField(item, "region"), xmlField(item, "country")].map(stripHtml).filter(Boolean).join(" · ");
    const link = stripHtml(xmlField(item, "link"));
    return enrich({
      source: "We Work Remotely", source_job_id: link, source_url: link,
      title: compact(title), company_name: compact(company), company_logo_url: null,
      industry: compact(stripHtml(xmlField(item, "category"))) || null, location: region ? `Remote · ${region}` : "Remote", remote_type: "Remote",
      description: xmlField(item, "description"), employment_type: compact(stripHtml(xmlField(item, "type"))) || null,
      published_at: asIso(stripHtml(xmlField(item, "pubDate"))), raw_data: {}
    });
  });
}

async function getText(url, options = {}) {
  const response = await fetch(url, { signal: defaultSignal(), ...options, headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "JobFinder/2.0", ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.text();
}

/** Recognises a public ATS career board from a job or careers URL. */
function boardFromUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (_) { return null; }
  const host = url.hostname.toLowerCase();
  const slug = (url.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9._-]{1,60}$/.test(slug)) return null;
  if (/(^|\.)greenhouse\.io$/.test(host) && (host.startsWith("boards.") || host.startsWith("job-boards."))) return { type: "greenhouse", slug };
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return { type: host.includes(".eu.") ? "lever-eu" : "lever", slug };
  if (host === "jobs.ashbyhq.com") return { type: "ashby", slug };
  return null;
}

function boardTask(board, signal) {
  const slug = encodeURIComponent(board.slug);
  if (board.type === "greenhouse") return getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, { signal })
    .then((data) => ({ source: `Greenhouse:${board.slug}`, jobs: (data.jobs || []).map((job) => normalizeGreenhouse(job, board.slug)) }));
  if (board.type === "lever" || board.type === "lever-eu") return getJson(`https://api${board.type === "lever-eu" ? ".eu" : ""}.lever.co/v0/postings/${slug}?mode=json`, { signal })
    .then((data) => ({ source: `Lever:${board.slug}`, jobs: (Array.isArray(data) ? data : []).map((job) => normalizeLever(job, board.slug)) }));
  if (board.type === "ashby") return getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { signal })
    .then((data) => ({ source: `Ashby:${board.slug}`, jobs: (data.jobs || []).filter((job) => job.isListed !== false).map((job) => normalizeAshby(job, board.slug)) }));
  return Promise.reject(new Error(`Unsupported board ${board.type}`));
}

function configuredBoards() {
  const fromEnv = (name, type, defaults) => {
    const raw = process.env[name];
    const slugs = raw === undefined ? defaults : String(raw).split(",").map((v) => v.trim()).filter(Boolean);
    return slugs.map((slug) => ({ type, slug }));
  };
  return [
    ...fromEnv("GREENHOUSE_BOARDS", "greenhouse", DEFAULT_BOARDS.greenhouse),
    ...fromEnv("LEVER_SITES", "lever", DEFAULT_BOARDS.lever),
    ...fromEnv("ASHBY_BOARDS", "ashby", DEFAULT_BOARDS.ashby)
  ];
}

/** Fetches specific career boards (e.g. the companies a user follows). */
async function fetchBoards(boards, { timeoutMs = 7000, max = 15 } = {}) {
  const unique = [...new Map(boards.filter(Boolean).map((board) => [`${board.type}:${board.slug}`, board])).values()].slice(0, max);
  const signal = () => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined);
  const settled = await Promise.allSettled(unique.map((board) => boardTask(board, signal())));
  const results = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").map((item) => item.reason?.message || String(item.reason));
  return { results, errors, jobs: results.flatMap((result) => result.jobs).filter(usable) };
}

function normalizeLever(job, site) {
  return enrich({
    source: "Lever", source_job_id: `${site}:${job.id}`, source_url: job.hostedUrl || job.applyUrl,
    title: compact(job.text), company_name: displaySlug(site), location: compact(job.categories?.location) || null,
    industry: compact(job.categories?.team) || null, description: `${job.descriptionPlain || ""} ${job.additionalPlain || ""}`,
    employment_type: compact(job.categories?.commitment) || null, published_at: job.createdAt ? asIso(job.createdAt) : null, raw_data: job
  });
}

const ADZUNA_COUNTRIES = new Set("gb us at au be br ca ch de es fr in it mx nl nz pl sg za".split(" "));

function joobleKey(region) {
  // A country-specific key wins; otherwise the main key is used on that country's Jooble domain.
  return process.env[`JOOBLE_API_KEY_${region.toUpperCase()}`] || process.env.JOOBLE_API_KEY || "";
}

/**
 * Searches driven by a user's preferences (roles × preferred countries/cities) on the
 * keyword-search APIs. Generic remote boards rarely carry local roles in Italy or
 * elsewhere in Europe, so this is what fills the catalog with relevant listings.
 * queries: [{ what: "Product Manager", country: "it", where: "Milano" }]
 */
async function fetchTargeted(queries, { timeoutMs = 8000, jsearchQueries = [], userIp = "127.0.0.1", userAgent = "JobFinder/2.0" } = {}) {
  const tasks = [];
  const seen = new Set();
  const signal = () => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined);
  // JSearch (Google for Jobs → LinkedIn, Glassdoor, Indeed…) is paid per call: it only runs the
  // few queries chosen by the caller, which rotates them so every role and place gets its turn.
  // Two ways to reach JSearch: directly from OpenWeb Ninja (OPENWEBNINJA_API_KEY, x-api-key header)
  // or through RapidAPI (JSEARCH_API_KEY). The direct key wins when both are set.
  const direct = process.env.OPENWEBNINJA_API_KEY;
  if (direct || process.env.JSEARCH_API_KEY) {
    const host = process.env.JSEARCH_API_HOST || "jsearch.p.rapidapi.com";
    const endpoint = direct ? (process.env.OPENWEBNINJA_JSEARCH_URL || "https://api.openwebninja.com/jsearch/search-v2") : `https://${host}/search`;
    const headers = direct ? { "x-api-key": direct } : { "X-RapidAPI-Key": process.env.JSEARCH_API_KEY, "X-RapidAPI-Host": host };
    for (const query of jsearchQueries) {
      const country = String(query.country || "").toLowerCase();
      const what = compact(query.what);
      const where = compact(query.where);
      if (!what || !/^[a-z]{2}$/.test(country)) continue;
      const params = new URLSearchParams({ query: `${what} in ${where || countryLabelEn(country) || country}`, page: "1", num_pages: "1", country, date_posted: "month" });
      tasks.push(getJson(`${endpoint}?${params}`, { signal: signal(), headers })
        .then((data) => {
          // v1 returns { data: [...] }; accept the nested shapes newer versions may use as well.
          const list = Array.isArray(data?.data) ? data.data : (data?.data?.jobs || data?.jobs || data?.results || []);
          if (!list.length) console.log("[jsearch] empty response", { query: params.get("query"), keys: Object.keys(data || {}), status: data?.status });
          return { source: `JSearch:${country}:${what}:${where}`, jobs: list.map((job) => normalizeJSearch(job, country)) };
        }));
    }
  }
  for (const query of queries) {
    const country = String(query.country || "").toLowerCase();
    const what = compact(query.what);
    const where = compact(query.where);
    if (!what || !/^[a-z]{2}$/.test(country)) continue;
    const key = `${country}|${what.toLowerCase()}|${where.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY && ADZUNA_COUNTRIES.has(country)) {
      const params = new URLSearchParams({
        app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
        results_per_page: "50", sort_by: "date", max_days_old: String(MAX_JOB_AGE_DAYS),
        what_phrase: what, "content-type": "application/json"
      });
      if (where) params.set("where", where);
      tasks.push(getJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`, { signal: signal() })
        .then((data) => ({ source: `Adzuna:${country}:${what}`, jobs: (data.results || []).map((job) => normalizeAdzuna(job, country)) })));
    }
    const jooble = process.env.JOOBLE_API_KEY ? joobleKey(country) : "";
    if (jooble) {
      const domain = country === "us" ? "jooble.org" : `${country}.jooble.org`;
      tasks.push(getJson(`https://${domain}/api/${encodeURIComponent(jooble)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: signal(),
        body: JSON.stringify({ keywords: what, location: where || countryLabel(country) || "", page: "1", ResultOnPage: "50" })
      }).then((data) => ({ source: `Jooble:${country}:${what}`, jobs: (data.jobs || []).map((job) => normalizeJooble(job, country)) })));
    }
    if (process.env.CAREERJET_AFFID && CAREERJET_LOCALES[country]) {
      const params = new URLSearchParams({
        locale_code: CAREERJET_LOCALES[country], keywords: what, location: where || countryLabelEn(country) || "",
        affid: process.env.CAREERJET_AFFID, user_ip: userIp, user_agent: userAgent,
        url: process.env.CAREERJET_REFERER || "https://margheritag95.github.io/JobFinder/", sort: "date", pagesize: "50"
      });
      tasks.push(getJson(`https://public.api.careerjet.net/search?${params}`, { signal: signal() })
        .then((data) => ({ source: `Careerjet:${country}:${what}`, jobs: (data.jobs || []).map((job) => normalizeCareerjet(job, country)) })));
    }
  }
  const settled = await Promise.allSettled(tasks);
  const results = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").map((item) => item.reason?.message || String(item.reason));
  const jobs = [...new Map(results.flatMap((result) => result.jobs).filter(usable).map((job) => [job.source_url, job])).values()];
  return { results, errors, jobs };
}

/**
 * Builds targeted queries from one or more users' search_preferences rows.
 * Coverage is fair whatever the user chose: first every role in every chosen country,
 * then every role in every chosen city (cities matched to their own country),
 * interleaved so no role, country or city is starved by the cap.
 */
function queriesFromPreferences(rows, { maxRoles = 5, maxQueries = 20, maxPerUser = maxQueries } = {}) {
  const perUser = rows.map((row) => {
    const roles = matching.list(row.target_roles).slice(0, maxRoles);
    const cities = matching.preferredCities(row);
    const countries = matching.preferredCountryCodes(row).map((code) => code.toLowerCase());
    // A city of unknown country belongs to the only chosen country, if there is just one.
    const cityQueries = cities
      .map((city) => ({ name: city.name, country: city.country ? city.country.toLowerCase() : (countries.length === 1 ? countries[0] : "") }))
      .filter((city) => city.country);
    const countryList = countries.length ? countries : [...new Set(cityQueries.map((city) => city.country))];
    const national = [];
    const local = [];
    for (const what of roles) {
      for (const country of countryList) national.push({ what, country, where: "" });
      for (const city of cityQueries) local.push({ what, country: city.country, where: city.name });
    }
    // Interleave: role1/country1, role2/country1 … so each slice covers all roles and places.
    const order = (items) => {
      const byPlace = new Map();
      items.forEach((item) => {
        const key = `${item.country}|${item.where}`;
        if (!byPlace.has(key)) byPlace.set(key, []);
        byPlace.get(key).push(item);
      });
      const lanes = [...byPlace.values()];
      const result = [];
      for (let index = 0; lanes.some((lane) => index < lane.length); index += 1) lanes.forEach((lane) => { if (lane[index]) result.push(lane[index]); });
      return result;
    };
    return order(national).concat(order(local)).slice(0, maxPerUser);
  });
  // Several users (nightly refresh): take one query from each in turn.
  const queries = [];
  for (let index = 0; perUser.some((list) => index < list.length) && queries.length < maxQueries; index += 1) {
    perUser.forEach((list) => { if (list[index] && queries.length < maxQueries) queries.push(list[index]); });
  }
  return queries;
}

function museOffset() {
  const start = new Date(new Date().getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  // The Muse rejects pages >= 100 with HTTP 400. Rotate ten-page windows within 0–99.
  return (dayOfYear % 10) * 10;
}

async function fetchSources() {
  const tasks = [
    getJson(REMOTIVE_URL).then((data) => ({ source: "Remotive", jobs: (data.jobs || []).map(normalizeRemotive) })),
    ...[1, 2, 3, 4, 5, 6].map((page) => getJson(`${ARBEITNOW_URL}?page=${page}`).then((data) => ({ source: `Arbeitnow:${page}`, jobs: (data.data || []).map(normalizeArbeitnow) }))),
    getJson(JOBICY_URL).then((data) => ({ source: "Jobicy", jobs: (data.jobs || []).map(normalizeJobicy) })),
    getJson(HIMALAYAS_URL).then((data) => ({ source: "Himalayas", jobs: (data.jobs || []).map(normalizeHimalayas) })),
    getJson(REMOTEOK_URL).then((data) => ({ source: "RemoteOK", jobs: (Array.isArray(data) ? data : []).filter((job) => job.id).map(normalizeRemoteOk) })),
    getJson(WORKING_NOMADS_URL).then((data) => ({ source: "WorkingNomads", jobs: (Array.isArray(data) ? data : []).map(normalizeWorkingNomads) })),
    ...Array.from({ length: 5 }, (_, i) => i).map((page) => getJson(`${MUSE_URL}?page=${page}`).then((data) => ({ source: `TheMuse:${page}`, jobs: (data.results || []).map(normalizeMuse) })))
  ];
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    const countries = String(process.env.ADZUNA_COUNTRIES || "it,gb,de,fr,be,nl,es,ch,at,us,ca").split(",").map((v) => v.trim().toLowerCase()).filter((v) => /^[a-z]{2}$/.test(v)).slice(0, 25);
    for (const country of countries) for (const page of [1, 2]) {
      const params = new URLSearchParams({
        app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
        results_per_page: "50", sort_by: "date", max_days_old: "40",
        "content-type": "application/json"
      });
      tasks.push(getJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`)
        .then((data) => ({ source: `Adzuna:${country}:${page}`, jobs: (data.results || []).map((job) => normalizeAdzuna(job, country)) })));
    }
  }
  if (process.env.JOOBLE_API_KEY) {
    const regions = String(process.env.JOOBLE_REGIONS || "it").split(",").map((v) => v.trim().toLowerCase()).filter((v) => /^[a-z]{2}$/.test(v)).slice(0, 10);
    const keywords = String(process.env.JOOBLE_KEYWORDS || "business analyst,customer success,product manager,strategy").split(",").map((v) => v.trim()).filter(Boolean).slice(0, 8);
    for (const region of regions) for (const keywordsValue of keywords) {
      const key = region === "us" ? process.env.JOOBLE_API_KEY : (process.env[`JOOBLE_API_KEY_${region.toUpperCase()}`] || (region === "it" ? process.env.JOOBLE_API_KEY : ""));
      if (!key) continue;
      const domain = region === "us" ? "jooble.org" : `${region}.jooble.org`;
      tasks.push(getJson(`https://${domain}/api/${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keywordsValue, location: "", page: "1", ResultOnPage: "50" })
      }).then((data) => ({ source: `Jooble:${region}`, jobs: (data.jobs || []).map((job) => normalizeJooble(job, region)) })));
    }
  }
  tasks.push(getText(WWR_URL).then((xml) => ({ source: "WeWorkRemotely", jobs: parseWwr(xml) })));
  for (const board of configuredBoards()) tasks.push(boardTask(board));
  const settled = await Promise.allSettled(tasks);
  const results = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").map((item) => item.reason?.message || String(item.reason));
  return { results, errors };
}

const MAX_JOB_AGE_DAYS = 40;

function isRecent(job) {
  const timestamp = Date.parse(job.published_at || "");
  return Number.isFinite(timestamp) && timestamp <= Date.now() + 86400000 && timestamp >= Date.now() - MAX_JOB_AGE_DAYS * 86400000;
}

function usable(job) {
  return Boolean(job.source && job.source_job_id && /^https?:\/\//i.test(job.source_url || "") && job.title && job.company_name && job.description?.length >= 80 && isRecent(job));
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

async function upsertCatalog(jobs) {
  const deduped = [...new Map(jobs.map((job) => [job.source_url, job])).values()];
  const stored = [];
  const row = (job) => ({ ...job, company_logo_url: job.company_logo_url || null, company_website: job.company_website || null, industry: job.industry || null, location: job.location || null, remote_type: job.remote_type || null, salary_text: job.salary_text || null, salary_min: job.salary_min || null, salary_max: job.salary_max || null, salary_currency: job.salary_currency || null, employment_type: job.employment_type || null, seniority: job.seniority || null, experience_required: job.experience_required || null, company_description: job.company_description || null, source_updated_at: job.source_updated_at || null });
  const write = (batch) => supabase("job_catalog?on_conflict=source,source_job_id", {
    method: "POST", body: JSON.stringify(batch.map(row)),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" }
  });
  let failed = 0;
  for (let offset = 0; offset < deduped.length; offset += 75) {
    const batch = deduped.slice(offset, offset + 75);
    try {
      stored.push(...((await write(batch)) || []));
    } catch (error) {
      // One bad row (e.g. the same link already stored under another source) must not
      // throw away the whole batch: retry row by row and skip only the offending ones.
      console.warn("[catalog] batch upsert failed, retrying row by row", error.message);
      for (const job of batch) {
        try { stored.push(...((await write([job])) || [])); }
        catch (_) { failed += 1; }
      }
    }
  }
  return { stored, accepted: deduped.length, failed };
}

async function refreshCatalog({ queries = [] } = {}) {
  const [{ results, errors }, targeted] = await Promise.all([fetchSources(), fetchTargeted(queries)]);
  const jobs = results.flatMap((result) => result.jobs).filter(usable).concat(targeted.jobs);
  if (!jobs.length) throw new Error(`No source returned usable jobs. ${errors.concat(targeted.errors).join("; ")}`);
  const { stored, accepted } = await upsertCatalog(jobs);
  // Deactivate outdated catalog records; preserve saved jobs and user history.
  const cutoff = new Date(Date.now() - MAX_JOB_AGE_DAYS * 86400000).toISOString();
  await supabase(`job_catalog?is_active=eq.true&or=(published_at.is.null,published_at.lt.${encodeURIComponent(cutoff)})`, {
    method: "PATCH", body: JSON.stringify({ is_active: false }),
    headers: { Prefer: "return=minimal" }
  });
  return { jobs: stored, fetched: jobs.length, accepted, sources: results.concat(targeted.results).map((r) => r.source), errors: errors.concat(targeted.errors) };
}

/**
 * Picks the next `count` queries for this user, starting at `offset` and wrapping around.
 * Returns the queries and the offset to send next time.
 */
function rotateQueries(queries, offset, count = 3) {
  if (!queries.length) return { picked: [], nextOffset: 0 };
  const start = ((Number(offset) || 0) % queries.length + queries.length) % queries.length;
  const picked = Array.from({ length: Math.min(count, queries.length) }, (_, index) => queries[(start + index) % queries.length]);
  return { picked, nextOffset: (start + picked.length) % queries.length };
}

module.exports = { stripHtml, rotateQueries, fetchSources, fetchBoards, boardFromUrl, parseWwr, fetchTargeted, queriesFromPreferences, upsertCatalog, refreshCatalog, supabase, usable, isRecent };
