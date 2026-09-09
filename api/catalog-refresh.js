const { refreshCatalog, supabase } = require("./_lib/catalog");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const startedAt = new Date().toISOString();
  try {
    const result = await refreshCatalog();
    await supabase("source_import_runs", { method: "POST", body: JSON.stringify({
      source: result.sources.join(","), started_at: startedAt, finished_at: new Date().toISOString(),
      status: result.errors.length ? "partial" : "success", fetched_count: result.fetched,
      accepted_count: result.accepted, error_message: result.errors.join("; ") || null
    }) });
    return res.status(200).json({ ok: true, ...result, jobs: undefined });
  } catch (error) {
    try { await supabase("source_import_runs", { method: "POST", body: JSON.stringify({ source: "catalog", started_at: startedAt, finished_at: new Date().toISOString(), status: "failed", error_message: error.message }) }); } catch (_) {}
    return res.status(500).json({ error: error.message });
  }
};
