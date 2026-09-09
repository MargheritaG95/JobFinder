const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?limit=100";
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "JobFinder/1.0" }
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function normalizeArbeitnow(job) {
  return {
    id: `arbeitnow-${job.slug || job.url}`,
    url: job.url,
    title: job.title,
    company_name: job.company_name,
    company_logo: "",
    category: Array.isArray(job.tags) ? job.tags.join(" · ") : "",
    job_type: Array.isArray(job.job_types) ? job.job_types.join(" · ") : "",
    publication_date: job.created_at ? new Date(Number(job.created_at) * 1000).toISOString() : "",
    candidate_required_location: `${job.location || ""}${job.remote ? " · Remote" : ""}`.trim(),
    salary: "",
    description: stripHtml(job.description)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  const errors = [];
  let jobs = [];

  try {
    const remotive = await getJson(REMOTIVE_URL);
    jobs.push(...(Array.isArray(remotive.jobs) ? remotive.jobs : []));
  } catch (error) {
    errors.push(error.message);
  }

  if (!jobs.length) {
    try {
      const arbeitnow = await getJson(ARBEITNOW_URL);
      jobs.push(...(Array.isArray(arbeitnow.data) ? arbeitnow.data.map(normalizeArbeitnow) : []));
    } catch (error) {
      errors.push(error.message);
    }
  }

  jobs = jobs.filter((job) => job.url && job.title && job.company_name && stripHtml(job.description).length >= 180);
  if (!jobs.length) return res.status(502).json({ error: "No job source returned usable records", details: errors });
  return res.status(200).json({ jobs, count: jobs.length });
};
