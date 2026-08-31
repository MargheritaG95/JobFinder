const cfg = window.JOBFINDER_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

let currentUser = null;
let jobs = [];
let applications = [];
let feedback = [];
let followups = [];
let companies = [];

const demoJobs = [
  {
    id: "demo-lutech",
    company_name: "Lutech",
    role_title: "AI Strategy & Adoption Consultant",
    location: "Milano",
    source: "Career site",
    fit_score: 9.2,
    priority: "APPLY",
    status: "NEW",
    application_type: "CAREER_SITE",
    application_effort_minutes: 15,
    description: "AI transformation, stakeholder workshops e adoption di use case enterprise."
  },
  {
    id: "demo-harvey",
    company_name: "Harvey",
    role_title: "Enterprise Account Executive",
    location: "Milano",
    source: "Career site",
    fit_score: 9.0,
    priority: "APPLY",
    status: "REVIEW",
    application_type: "CAREER_SITE",
    application_effort_minutes: 20,
    description: "Frontier AI, enterprise sales e stakeholder complessi."
  },
  {
    id: "demo-motork",
    company_name: "MotorK",
    role_title: "Customer Success Manager",
    location: "Milano",
    source: "Career site",
    fit_score: 8.8,
    priority: "REVIEW",
    status: "REVIEW",
    application_type: "CAREER_SITE",
    application_effort_minutes: 12,
    description: "Customer Success nel settore automotive, con forte componente digitale."
  },
  {
    id: "demo-bending",
    company_name: "Bending Spoons",
    role_title: "Product Manager",
    location: "Milano / Remote",
    source: "Career site",
    fit_score: 8.4,
    priority: "APPLY",
    status: "NEW",
    application_type: "CAREER_SITE",
    application_effort_minutes: 30,
    description: "Product strategy, execution e analytics in ambiente tech ad alta crescita."
  }
];

const demoCompanies = [
  { id: "c1", name: "Anthropic", sector: "AI", tier: "A", website: "https://www.anthropic.com" },
  { id: "c2", name: "Bending Spoons", sector: "Tech", tier: "A", website: "https://bendingspoons.com" },
  { id: "c3", name: "MotorK", sector: "Automotive Tech", tier: "A", website: "https://www.motork.io" },
  { id: "c4", name: "Salesforce", sector: "Enterprise Tech", tier: "B", website: "https://www.salesforce.com" }
];

const pipelineStatuses = ["NEW","REVIEW","APPLY","APPLIED","CONTACTED","INTERVIEW","OFFER","CLOSED"];

function el(id) {
  return document.getElementById(id);
}

function notify(message) {
  const box = el("notice");
  box.textContent = message;
  box.classList.remove("hidden");
  clearTimeout(window.__noticeTimer);
  window.__noticeTimer = setTimeout(() => box.classList.add("hidden"), 4500);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(value));
  } catch {
    return value;
  }
}

function setView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const view = el(`view-${name}`);
  const nav = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (view) view.classList.add("active-view");
  if (nav) nav.classList.add("active");

  const meta = {
    dashboard: ["Dashboard", "Trova il tuo prossimo ruolo. Più velocemente."],
    opportunities: ["Opportunità", "Ruoli ad alto fit, senza rumore."],
    pipeline: ["Pipeline", "Dalla scoperta all'offerta."],
    applications: ["Applications", "Prepara e traccia ogni candidatura."],
    companies: ["Aziende target", "Monitora le aziende che contano davvero."],
    followups: ["Follow-up", "Le prossime azioni, sempre visibili."],
    feedback: ["AI Feedback", "JobFinder impara dalle tue decisioni."]
  };

  el("page-title").textContent = meta[name][0];
  el("page-subtitle").textContent = meta[name][1];
}

function renderJob(job, compact=false) {
  const canWrite = !!currentUser && !String(job.id).startsWith("demo-");
  return `
    <article class="job-card">
      <div class="row">
        <div>
          <div class="job-title">${esc(job.company_name)} — ${esc(job.role_title)}</div>
          <div class="job-meta">
            ${esc(job.location || "—")} · ${esc(job.status || "NEW")} · ${esc((job.application_type || "OTHER").replaceAll("_"," "))}
            ${job.application_effort_minutes ? ` · ${job.application_effort_minutes} min` : ""}
          </div>
        </div>
        <div class="fit">${job.fit_score ?? "—"}/10</div>
      </div>
      ${compact ? "" : `<div class="muted" style="margin-top:8px">${esc(job.description || "")}</div>`}
      <div class="tags">
        ${job.priority ? `<span class="tag">${esc(job.priority)}</span>` : ""}
        ${job.source ? `<span class="tag">${esc(job.source)}</span>` : ""}
      </div>
      ${compact ? "" : `
      <div class="actions">
        <button class="feedback-btn like" onclick="saveSignal('${job.id}','LIKE')" ${canWrite ? "" : "disabled"}>👍 Mi piace</button>
        <button class="feedback-btn pass" onclick="saveSignal('${job.id}','PASS')" ${canWrite ? "" : "disabled"}>👎 Pass</button>
        <button class="feedback-btn save" onclick="saveSignal('${job.id}','SAVE')" ${canWrite ? "" : "disabled"}>★ Salva</button>
        <button class="btn btn-secondary small" onclick="prepareApplication('${job.id}')" ${canWrite ? "" : "disabled"}>✨ Prepara candidatura</button>
      </div>`}
    </article>
  `;
}

function renderDashboard() {
  el("metric-active").textContent = jobs.filter(j => j.status !== "CLOSED").length;
  el("metric-high-fit").textContent = jobs.filter(j => Number(j.fit_score) >= 8 && j.status !== "CLOSED").length;
  el("metric-applications").textContent = applications.filter(a => ["SUBMITTED","INTERVIEW","OFFER"].includes(a.status)).length;
  el("metric-followups").textContent = followups.filter(f => !f.completed_at).length;

  const top = [...jobs]
    .filter(j => j.status !== "CLOSED")
    .sort((a,b) => Number(b.fit_score || 0) - Number(a.fit_score || 0))
    .slice(0,4);

  el("dashboard-jobs").innerHTML = top.length
    ? top.map(j => renderJob(j, true)).join("")
    : `<div class="empty">Nessuna opportunità ancora.</div>`;

  el("dashboard-pipeline").innerHTML = pipelineStatuses
    .filter(s => s !== "CLOSED")
    .map(s => `<div class="pipeline-chip"><b>${s}</b> · ${jobs.filter(j => j.status === s).length}</div>`)
    .join("");

  const avgProgress = applications.length
    ? Math.round(applications.reduce((sum, a) => sum + Number(a.package_progress || 0), 0) / applications.length)
    : 0;

  el("copilot-readiness").innerHTML = `
    <div class="metric-value" style="font-size:28px">${avgProgress}%</div>
    <div class="muted">readiness medio dei pacchetti candidatura</div>
    <div class="progress"><div class="progress-bar" style="width:${avgProgress}%"></div></div>
  `;

  const pendingFollowups = followups
    .filter(f => !f.completed_at)
    .sort((a,b) => new Date(a.due_at || 0) - new Date(b.due_at || 0))
    .slice(0,4);

  const actions = [];
  applications.filter(a => ["PREPARING","READY"].includes(a.status)).slice(0,2).forEach(a => {
    const job = jobs.find(j => j.id === a.job_id);
    actions.push(`Completa application ${job ? esc(job.company_name) : ""}`);
  });
  pendingFollowups.forEach(f => actions.push(esc(f.action || "Follow-up candidatura")));

  el("next-actions").innerHTML = actions.length
    ? actions.slice(0,5).map(a => `<div class="list-card">${a}</div>`).join("")
    : `<div class="empty">Nessuna azione urgente.</div>`;

  const likes = feedback.filter(f => f.signal === "LIKE").length;
  const passes = feedback.filter(f => f.signal === "PASS").length;
  const saves = feedback.filter(f => f.signal === "SAVE").length;

  el("feedback-summary").innerHTML = `
    <div class="stat-line"><span>LIKE</span><b>${likes}</b></div>
    <div class="stat-line"><span>PASS</span><b>${passes}</b></div>
    <div class="stat-line"><span>SAVE</span><b>${saves}</b></div>
    <div class="muted" style="margin-top:8px">${feedback.length} segnali totali</div>
  `;
}

function renderOpportunities() {
  const minFit = Number(el("fit-filter").value || 0);
  const status = el("status-filter").value;

  const filtered = [...jobs]
    .filter(j => Number(j.fit_score || 0) >= minFit)
    .filter(j => !status || j.status === status)
    .sort((a,b) => Number(b.fit_score || 0) - Number(a.fit_score || 0));

  el("opportunities-list").innerHTML = filtered.length
    ? filtered.map(j => renderJob(j, false)).join("")
    : `<div class="empty">Nessuna opportunità con questi filtri.</div>`;
}

function renderPipeline() {
  el("pipeline-board").innerHTML = pipelineStatuses.map(status => {
    const items = jobs.filter(j => j.status === status);
    return `
      <div class="pipeline-column">
        <h3>${status} · ${items.length}</h3>
        ${items.length ? items.map(j => `
          <div class="pipeline-item">
            <b>${esc(j.company_name)}</b>
            <div class="muted">${esc(j.role_title)}</div>
            <div class="fit" style="margin-top:5px">${j.fit_score ?? "—"}/10</div>
          </div>
        `).join("") : `<div class="muted">Vuoto</div>`}
      </div>
    `;
  }).join("");
}

function renderApplications() {
  if (!applications.length) {
    el("applications-list").innerHTML = `<div class="empty">Nessun pacchetto candidatura ancora.</div>`;
    return;
  }

  el("applications-list").innerHTML = applications.map(a => {
    const job = jobs.find(j => j.id === a.job_id);
    return `
      <div class="list-card">
        <div class="row">
          <div>
            <div class="job-title">${job ? `${esc(job.company_name)} — ${esc(job.role_title)}` : "Application"}</div>
            <div class="job-meta">${esc(a.status)} · CV: ${esc(a.cv_variant || "da scegliere")}</div>
          </div>
          <b>${Number(a.package_progress || 0)}%</b>
        </div>
        <div class="progress"><div class="progress-bar" style="width:${Number(a.package_progress || 0)}%"></div></div>
        <div class="muted">Answer bank: ${Number(a.answer_bank_progress || 0)}%</div>
      </div>
    `;
  }).join("");
}

function renderCompanies() {
  el("companies-list").innerHTML = companies.length
    ? companies
      .sort((a,b) => String(a.tier || "Z").localeCompare(String(b.tier || "Z")))
      .map(c => `
        <div class="list-card">
          <div class="row">
            <div>
              <div class="job-title">${esc(c.name)}</div>
              <div class="job-meta">${esc(c.sector || "—")} · Tier ${esc(c.tier || "—")}</div>
            </div>
            ${c.website ? `<a class="btn btn-secondary small" href="${esc(c.website)}" target="_blank" rel="noopener">Sito</a>` : ""}
          </div>
          ${c.notes ? `<div class="muted" style="margin-top:8px">${esc(c.notes)}</div>` : ""}
        </div>
      `).join("")
    : `<div class="empty">Nessuna azienda target ancora.</div>`;
}

function renderFollowups() {
  const items = [...followups].sort((a,b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));
  el("followups-list").innerHTML = items.length
    ? items.map(f => `
      <div class="list-card">
        <div class="row">
          <div>
            <div class="job-title">${esc(f.action || "Follow-up")}</div>
            <div class="job-meta">Scadenza: ${formatDate(f.due_at)}</div>
          </div>
          <span class="tag">${f.completed_at ? "COMPLETATO" : "DA FARE"}</span>
        </div>
      </div>
    `).join("")
    : `<div class="empty">Nessun follow-up programmato.</div>`;
}

function renderFeedback() {
  el("feedback-list").innerHTML = feedback.length
    ? [...feedback].reverse().map(f => {
      const job = jobs.find(j => j.id === f.job_id);
      return `
        <div class="list-card">
          <div class="row">
            <div>
              <div class="job-title">${esc(f.signal)} ${job ? `· ${esc(job.company_name)} — ${esc(job.role_title)}` : ""}</div>
              <div class="job-meta">${formatDate(f.created_at)}</div>
            </div>
            <span class="tag">${esc((f.reasons || []).join(", ") || "nessun motivo")}</span>
          </div>
        </div>
      `;
    }).join("")
    : `<div class="empty">Nessun feedback salvato.</div>`;
}

function renderAll() {
  renderDashboard();
  renderOpportunities();
  renderPipeline();
  renderApplications();
  renderCompanies();
  renderFollowups();
  renderFeedback();
}

async function loadData() {
  if (!currentUser) {
    jobs = demoJobs;
    applications = [];
    feedback = [];
    followups = [];
    companies = demoCompanies;
    renderAll();
    return;
  }

  const [jobsRes, appsRes, feedbackRes, followupsRes, companiesRes] = await Promise.all([
    sb.from("jobs").select("*").order("fit_score", { ascending: false }),
    sb.from("applications").select("*").order("created_at", { ascending: false }),
    sb.from("feedback").select("*").order("created_at", { ascending: false }),
    sb.from("followups").select("*").order("due_at", { ascending: true }),
    sb.from("companies").select("*").order("tier", { ascending: true })
  ]);

  if (jobsRes.error) console.error(jobsRes.error);
  if (appsRes.error) console.error(appsRes.error);
  if (feedbackRes.error) console.error(feedbackRes.error);
  if (followupsRes.error) console.error(followupsRes.error);
  if (companiesRes.error) console.error(companiesRes.error);

  jobs = jobsRes.data || [];
  applications = appsRes.data || [];
  feedback = feedbackRes.data || [];
  followups = followupsRes.data || [];
  companies = companiesRes.data || [];

  renderAll();
}

async function saveSignal(jobId, signal) {
  if (!currentUser) {
    notify("Accedi per salvare il feedback.");
    return;
  }

  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  let reasons = [];
  if (signal === "PASS") {
    const reason = prompt("Perché passi? Es. troppo sales, RAL bassa, seniority errata");
    if (reason) reasons = [reason];
  }

  const { error } = await sb.from("feedback").insert({
    user_id: currentUser.id,
    job_id: jobId,
    signal,
    reasons
  });

  if (error) {
    notify(error.message);
    return;
  }

  notify("Feedback salvato.");
  await loadData();
}

async function prepareApplication(jobId) {
  if (!currentUser) {
    notify("Accedi per preparare una candidatura.");
    return;
  }

  const already = applications.find(a => a.job_id === jobId);
  if (already) {
    notify("Esiste già un pacchetto candidatura per questo ruolo.");
    setView("applications");
    return;
  }

  const { error: appError } = await sb.from("applications").insert({
    user_id: currentUser.id,
    job_id: jobId,
    status: "PREPARING",
    package_progress: 20,
    answer_bank_progress: 0
  });

  if (appError) {
    notify(appError.message);
    return;
  }

  await sb.from("jobs").update({ status: "APPLY" }).eq("id", jobId);

  notify("Application package creato.");
  await loadData();
  setView("applications");
}

async function sendMagicLink() {
  const email = el("email-input").value.trim();
  if (!email) {
    notify("Inserisci la tua email.");
    return;
  }

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });

  if (error) notify(error.message);
  else notify("Magic link inviato. Controlla la tua email.");
}

async function logout() {
  await sb.auth.signOut();
}

function syncAuthUI() {
  const logged = !!currentUser;
  el("email-input").classList.toggle("hidden", logged);
  el("login-btn").classList.toggle("hidden", logged);
  el("logout-btn").classList.toggle("hidden", !logged);
  el("auth-status").textContent = logged
    ? `Connesso · ${currentUser.email || "utente"}`
    : "Demo mode";
}

async function init() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  document.querySelectorAll("[data-jump]").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.jump));
  });

  el("fit-filter").addEventListener("change", renderOpportunities);
  el("status-filter").addEventListener("change", renderOpportunities);
  el("login-btn").addEventListener("click", sendMagicLink);
  el("logout-btn").addEventListener("click", logout);

  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user || null;
  syncAuthUI();
  await loadData();

  sb.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    syncAuthUI();
    await loadData();
  });
}

window.saveSignal = saveSignal;
window.prepareApplication = prepareApplication;

init();
