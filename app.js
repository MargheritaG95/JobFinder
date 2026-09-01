const cfg = window.JOBFINDER_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
const APP_URL = "https://jobfinder-blush.vercel.app";

let currentUser = null;
let jobs = [];
let applications = [];
let feedback = [];
let followups = [];
let companies = [];
let searchPreferences = null;

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
    feedback: ["AI Feedback", "JobFinder impara dalle tue decisioni."],
    preferences: ["Preferenze ricerca", "Controlla filtri, tag e apprendimento AI."]
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

function tagsFromInput(id) {
  return el(id).value.split(",").map(v => v.trim()).filter(Boolean);
}

function renderPreferences() {
  const defaults = {
    role_tags: [], industry_tags: [], location_tags: [], work_mode_tags: [],
    min_fit: 7, ai_learning_enabled: true, learned_preferences: {}
  };
  const p = searchPreferences || defaults;
  el("pref-roles").value = (p.role_tags || []).join(", ");
  el("pref-industries").value = (p.industry_tags || []).join(", ");
  el("pref-locations").value = (p.location_tags || []).join(", ");
  el("pref-work-modes").value = (p.work_mode_tags || []).join(", ");
  el("pref-min-fit").value = p.min_fit ?? 7;
  el("pref-ai-learning").checked = p.ai_learning_enabled !== false;
  el("save-preferences-btn").disabled = !currentUser;
  el("preferences-login-note").classList.toggle("hidden", !!currentUser);

  const learned = p.learned_preferences || {};
  const entries = Object.entries(learned);
  el("learned-tags").innerHTML = entries.length
    ? entries.sort((a,b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1]))).map(([tag, score]) => {
        const n = Number(score) || 0;
        const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "•";
        return `<span class="learned-tag ${n < 0 ? "negative" : "positive"}">${arrow} ${esc(tag)}</span>`;
      }).join("")
    : `<div class="empty">Ancora nessun pattern appreso. I segnali AI resteranno separati dai tuoi filtri manuali.</div>`;
}

async function savePreferences() {
  if (!currentUser) { notify("Accedi per salvare le preferenze."); return; }
  const minFit = Math.max(0, Math.min(10, Number(el("pref-min-fit").value || 7)));
  const payload = {
    user_id: currentUser.id,
    role_tags: tagsFromInput("pref-roles"),
    industry_tags: tagsFromInput("pref-industries"),
    location_tags: tagsFromInput("pref-locations"),
    work_mode_tags: tagsFromInput("pref-work-modes"),
    min_fit: minFit,
    ai_learning_enabled: el("pref-ai-learning").checked,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await sb.from("search_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error) { notify(error.message); return; }
  searchPreferences = data;
  renderPreferences();
  notify("Preferenze salvate.");
}

function renderAll() {
  renderDashboard();
  renderOpportunities();
  renderPipeline();
  renderApplications();
  renderCompanies();
  renderFollowups();
  renderFeedback();
  renderPreferences();
}

async function loadData() {
  if (!currentUser) {
    jobs = demoJobs;
    applications = [];
    feedback = [];
    followups = [];
    companies = demoCompanies;
    searchPreferences = null;
    renderAll();
    return;
  }

  const [jobsRes, appsRes, feedbackRes, followupsRes, companiesRes, prefsRes] = await Promise.all([
    sb.from("jobs").select("*").order("fit_score", { ascending: false }),
    sb.from("applications").select("*").order("created_at", { ascending: false }),
    sb.from("feedback").select("*").order("created_at", { ascending: false }),
    sb.from("followups").select("*").order("due_at", { ascending: true }),
    sb.from("companies").select("*").order("tier", { ascending: true }),
    sb.from("search_preferences").select("*").maybeSingle()
  ]);

  if (jobsRes.error) console.error(jobsRes.error);
  if (appsRes.error) console.error(appsRes.error);
  if (feedbackRes.error) console.error(feedbackRes.error);
  if (followupsRes.error) console.error(followupsRes.error);
  if (companiesRes.error) console.error(companiesRes.error);
  if (prefsRes.error) console.error(prefsRes.error);

  jobs = jobsRes.data || [];
  applications = appsRes.data || [];
  feedback = feedbackRes.data || [];
  followups = followupsRes.data || [];
  companies = companiesRes.data || [];
  searchPreferences = prefsRes.data || null;

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

async function signInWithPassword() {
  const email = el("email-input").value.trim();
  const password = el("password-input").value;

  if (!email || !password) {
    notify("Inserisci email e password.");
    return;
  }

  const button = el("login-btn");
  button.disabled = true;
  button.textContent = "Accesso…";

  const { error } = await sb.auth.signInWithPassword({ email, password });

  button.disabled = false;
  button.textContent = "Accedi";

  if (error) {
    const msg = /invalid login credentials/i.test(error.message || "")
      ? "Email o password non corretti. Se usavi il vecchio Magic Link, clicca “Imposta / reimposta password” una sola volta."
      : error.message;
    notify(msg);
    return;
  }

  el("password-input").value = "";
  notify("Accesso effettuato ✓");
}

async function signUpWithPassword() {
  const email = el("email-input").value.trim();
  const password = el("password-input").value;

  if (!email || !password) {
    notify("Inserisci email e una password.");
    return;
  }
  if (password.length < 8) {
    notify("La password deve avere almeno 8 caratteri.");
    return;
  }

  const button = el("signup-btn");
  button.disabled = true;
  button.textContent = "Creazione…";

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: APP_URL }
  });

  button.disabled = false;
  button.textContent = "Crea account";

  if (error) {
    const msg = /already registered|already been registered|user already exists/i.test(error.message || "")
      ? "Questa email esiste già. Usa “Imposta / reimposta password” per aggiungere una password al tuo account esistente."
      : error.message;
    notify(msg);
    return;
  }

  el("password-input").value = "";
  if (data?.session) {
    notify("Account creato e accesso effettuato ✓");
  } else {
    notify("Account creato. Controlla l’email di conferma una sola volta; poi accederai sempre con email e password.");
  }
}

async function resetPassword() {
  const email = el("email-input").value.trim();
  if (!email) {
    notify("Inserisci prima la tua email.");
    return;
  }

  const button = el("reset-password-btn");
  button.disabled = true;
  button.textContent = "Invio…";

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: APP_URL
  });

  button.disabled = false;
  button.textContent = "Imposta / reimposta password";

  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message || "")) {
      notify("Supabase sta ancora limitando le email. Attendi il reset del limite e riprova una sola volta.");
    } else {
      notify(error.message);
    }
    return;
  }

  notify("Email per impostare la password inviata. È necessaria solo questa volta.");
}

async function completeRecoveryFromSession() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const type = params.get("type");
  if (type !== "recovery") return;

  const password = window.prompt("Scegli la nuova password per JobFinder (minimo 8 caratteri):");
  if (!password) return;
  if (password.length < 8) {
    notify("Password non aggiornata: servono almeno 8 caratteri.");
    return;
  }

  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    notify(error.message);
    return;
  }

  history.replaceState(null, "", window.location.pathname);
  notify("Password impostata ✓ Da ora puoi accedere con email e password.");
}


async function logout() {
  await sb.auth.signOut();
}

function syncAuthUI() {
  const logged = !!currentUser;
  el("auth-box").querySelector(".magic-login").classList.toggle("hidden", logged);
  el("logged-user").classList.toggle("hidden", !logged);
  el("sidebar-logout-btn").classList.toggle("hidden", !logged);
  el("auth-dot").classList.toggle("hidden", logged);
  el("auth-label").classList.toggle("hidden", logged);
  el("auth-label").textContent = "Modalità demo";
  el("auth-email").textContent = logged
    ? (currentUser.email || "Sessione attiva")
    : "Accedi per usare i tuoi dati reali";
  el("logged-email").textContent = currentUser?.email || "Sessione attiva";
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
  el("login-btn").addEventListener("click", signInWithPassword);
  el("signup-btn").addEventListener("click", signUpWithPassword);
  el("reset-password-btn").addEventListener("click", resetPassword);
  el("logout-btn").addEventListener("click", logout);
  el("sidebar-logout-btn").addEventListener("click", logout);
  el("save-preferences-btn").addEventListener("click", savePreferences);
  el("email-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") signInWithPassword();
  });
  el("password-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") signInWithPassword();
  });

  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user || null;
  await completeRecoveryFromSession();
  syncAuthUI();
  await loadData();

  sb.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;

    if (event === "PASSWORD_RECOVERY") {
      const password = window.prompt("Scegli la nuova password per JobFinder (minimo 8 caratteri):");
      if (password && password.length >= 8) {
        const { error } = await sb.auth.updateUser({ password });
        notify(error ? error.message : "Password impostata ✓ Da ora puoi accedere con email e password.");
      } else if (password) {
        notify("Password non aggiornata: servono almeno 8 caratteri.");
      }
    }

    syncAuthUI();
    await loadData();
  });
}

window.saveSignal = saveSignal;
window.prepareApplication = prepareApplication;

init();
