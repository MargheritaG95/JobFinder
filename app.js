(() => {
  "use strict";

  const CONFIG = window.JOBFINDER_CONFIG || {};
  const PIPELINE_STATES = ["NEW", "REVIEW", "APPLY", "APPLIED", "CONTACTED", "INTERVIEW", "OFFER", "CLOSED"];
  const PIPELINE_COLORS = {
    NEW: "#7f8da3",
    REVIEW: "#4e83d9",
    APPLY: "#735fd6",
    APPLIED: "#9962cf",
    CONTACTED: "#d28a31",
    INTERVIEW: "#e16e61",
    OFFER: "#28a977",
    CLOSED: "#9aa3b1"
  };
  const PAGE_LABELS = {
    dashboard: "DASHBOARD",
    opportunities: "OPPORTUNITÀ",
    pipeline: "PIPELINE",
    applications: "LE MIE APPLICATION",
    companies: "AZIENDE TARGET",
    followups: "FOLLOW-UP",
    feedback: "FEEDBACK",
    preferences: "PREFERENZE",
    templates: "TEMPLATES",
    resources: "RISORSE",
    analytics: "ANALYTICS",
    copilot: "APPLICATION COPILOT"
  };
  const DEFAULT_PREFERENCES = {
    roles: [
      "Customer Experience",
      "Business Strategy",
      "Sales Ops / RevOps",
      "Customer Insights",
      "Business Analytics",
      "AI Strategy",
      "AI Product",
      "AI Project",
      "Customer Success"
    ],
    sectors: ["Tech", "AI", "Automotive", "Motorsport", "Motorcycle", "Classic Cars", "Gaming"],
    locations: ["Milano", "Remote Italy", "EU"],
    workModes: ["Remote", "Hybrid"],
    minFit: 7,
    aiLearning: false,
    motivations: "Automotive: L’automotive è da sempre una mia grande passione e oggi sto cercando concretamente di trasformarla in una direzione del mio percorso professionale.\nAI: Ho completato un master in intelligenza artificiale e desidero applicare questa preparazione a progetti concreti e di valore per il business.",
    profileSkills: "",
    profileCvText: "",
    companyValues: "TeamViewer: collaborazione, spirito di squadra, attenzione al cliente e innovazione | Mi riconosco in questi valori perché nel mio modo di lavorare metto al centro il cliente, la collaborazione tra stakeholder e il miglioramento continuo."
  };
  const DATA_ENTITIES = [
    "profiles",
    "companies",
    "jobs",
    "feedback",
    "applications",
    "contacts",
    "followups",
    "answerBank",
    "preferences"
  ];
  const OPTIONAL_ENTITIES = new Set(["preferences"]);

  const state = {
    client: null,
    user: null,
    profile: null,
    route: "dashboard",
    selectedJobId: null,
    selectedApplicationId: null,
    pendingJobActions: new Set(),
    demo: false,
    loadingData: false,
    sessionInitializing: false,
    sessionUserId: null,
    sessionExpiredHandled: false,
    errors: {},
    optionalErrors: {},
    lastSync: null,
    data: {
      profiles: [],
      companies: [],
      jobs: [],
      feedback: [],
      applications: [],
      contacts: [],
      followups: [],
      answerBank: [],
      preferences: []
    }
  };

  const $ = (id) => document.getElementById(id);
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function asText(value, fallback = "—") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeStatus(value, fallback = "NEW") {
    const normalized = String(value || fallback)
      .trim()
      .toUpperCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");
    const aliases = {
      TO_REVIEW: "REVIEW",
      READY_TO_APPLY: "APPLY",
      IN_PROGRESS: "APPLY",
      SUBMITTED: "APPLIED",
      SCREENING: "CONTACTED",
      INTERVIEWING: "INTERVIEW",
      OFFERED: "OFFER",
      REJECTED: "CLOSED",
      ARCHIVED: "CLOSED"
    };
    return aliases[normalized] || normalized;
  }

  function titleCase(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  function initials(value, fallback = "JF") {
    const parts = String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return fallback;
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function formatDate(value, options = {}) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return asText(value);
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: options.short ? "short" : "2-digit",
      year: options.withYear === false ? undefined : "numeric"
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function todayIso() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function toList(value) {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (value === null || value === undefined || value === "") return [];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
        } catch (_error) {
          // Continue with delimiter parsing.
        }
      }
      return trimmed.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
    }
    return [String(value)];
  }

  function normalizedTokens(value) {
    const stopWords = new Set(["and", "con", "della", "delle", "for", "per", "the", "una", "uno", "with"]);
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => token.length > 2 && !stopWords.has(token));
  }

  function analyzeOpportunity({ title, company, location, description }) {
    const preferences = currentPreferences();
    const searchable = normalizedTokens(`${title} ${company} ${location} ${description}`);
    const tokenSet = new Set(searchable);
    const matchesFor = (values) => values.filter((value) => normalizedTokens(value).some((token) => tokenSet.has(token)));
    const roleMatches = matchesFor(preferences.roles);
    const sectorMatches = matchesFor(preferences.sectors);
    const locationMatches = matchesFor([...preferences.locations, ...preferences.workModes]);
    const requirementSignals = ["experience", "esperienza", "skills", "competenze", "responsibilities", "responsabilita"]
      .filter((token) => searchable.includes(token)).length;
    const score = Math.min(10, Math.max(1,
      3.5 + Math.min(3.5, roleMatches.length * 1.25) + Math.min(1.5, sectorMatches.length * 0.75) +
      Math.min(1, locationMatches.length * 0.5) + Math.min(0.5, requirementSignals * 0.15)
    ));
    const strongest = [...roleMatches, ...sectorMatches].slice(0, 4);
    const why = strongest.length
      ? `Compatibilità rilevata con ${strongest.join(", ")}. Collega questi elementi a risultati misurabili del tuo CV e alle priorità descritte nell’annuncio.`
      : "Compatibilità da validare: collega le responsabilità principali dell’annuncio a risultati misurabili e competenze realmente presenti nel tuo CV.";
    const gaps = description
      ? "Verifica i requisiti obbligatori dell’annuncio non coperti dal CV. Non dichiarare competenze mancanti: valorizza esperienze trasferibili e un piano di apprendimento concreto."
      : "Descrizione non importata: incollala per ottenere un’analisi più affidabile di requisiti e gap.";
    const angle = `Presenta il profilo come soluzione alle priorità di ${company || "questa azienda"}, con esempi concreti di impatto, collaborazione ed execution.`;
    return { score: Math.round(score * 10) / 10, why, gaps, angle, matches: strongest };
  }

  function suggestedCoverLetter(job) {
    const suggestions = suggestedCopilotContent(job);
    const name = valueOf(state.profile, "profiles", "name", "").trim() || "[Nome e cognome]";
    return `Gentile team di selezione di ${companyNameForJob(job)},\n\nvorrei candidarmi per la posizione di ${jobTitle(job)}. ${suggestions.why}\n\n${suggestions.angle}\n\nSarei felice di approfondire come la mia esperienza possa contribuire agli obiettivi del ruolo.\n\nCordiali saluti,\n${name}`;
  }

  function fieldName(entity, key) {
    return CONFIG.schema?.columns?.[entity]?.[key] || key;
  }

  function tableConfig(entity) {
    const configured = CONFIG.schema?.tables?.[entity];
    if (typeof configured === "string") return { name: configured, ownerColumn: "user_id" };
    return configured || { name: entity, ownerColumn: "user_id" };
  }

  function tableName(entity) {
    return tableConfig(entity).name;
  }

  function ownerColumn(entity) {
    return tableConfig(entity).ownerColumn || "user_id";
  }

  function valueOf(record, entity, key, fallback = "") {
    if (!record) return fallback;
    const value = record[fieldName(entity, key)];
    return value === null || value === undefined ? fallback : value;
  }

  function setMapped(target, entity, key, value, options = {}) {
    if (options.skipEmpty && (value === "" || value === null || value === undefined)) return target;
    target[fieldName(entity, key)] = value;
    return target;
  }

  function isSupabaseConfigured() {
    const url = String(CONFIG.supabaseUrl || "");
    const key = String(CONFIG.supabasePublishableKey || "");
    const unsafeKey = /^sb_secret_/i.test(key) || /service[_-]?role/i.test(key) || jwtRole(key) === "service_role";
    return (
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) &&
      key.length > 20 &&
      !key.includes("YOUR_") &&
      !unsafeKey
    );
  }

  function jwtRole(key) {
    if (!String(key).startsWith("eyJ")) return "";
    try {
      const payload = String(key).split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
      return JSON.parse(window.atob(payload)).role || "";
    } catch (_error) {
      return "";
    }
  }

  function authRedirectUrl() {
    if (CONFIG.siteUrl) return String(CONFIG.siteUrl).split("#")[0];
    return `${window.location.origin}${window.location.pathname}`;
  }

  function safeExternalUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), window.location.href);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function setBusy(button, busy, busyLabel = "Attendi…") {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner spinner--button"></span>${escapeHtml(busyLabel)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }

  function showToast(message, type = "info", title = "JobFinder") {
    const region = $("toastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.innerHTML = `
      <span>${type === "success" ? icon("check") : type === "error" ? icon("alert") : icon("message")}</span>
      <span><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</span>
      <button type="button" aria-label="Chiudi notifica">${icon("close")}</button>
    `;
    const remove = () => toast.remove();
    toast.querySelector("button")?.addEventListener("click", remove);
    region.appendChild(toast);
    window.setTimeout(remove, type === "error" ? 7000 : 4300);
  }

  function setFormStatus(element, message = "", type = "") {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }

  function humanizeError(error, context = "operazione") {
    const raw = String(error?.message || error?.error_description || error || "Errore sconosciuto");
    const lower = raw.toLowerCase();
    if (lower.includes("invalid login credentials")) return "Email o password non corretti.";
    if (lower.includes("email not confirmed")) return "Conferma prima l’indirizzo email dal messaggio ricevuto.";
    if (lower.includes("rate limit")) return "Troppe richieste. Attendi qualche minuto e riprova.";
    if (lower.includes("jwt") || lower.includes("token") && lower.includes("expired")) return "La sessione è scaduta. Accedi di nuovo.";
    if (lower.includes("row-level security") || lower.includes("violates row-level security")) return `Supabase ha bloccato ${context}: verifica le policy RLS per l’utente autenticato.`;
    if (error?.code === "42501" || lower.includes("permission denied for table")) return `Supabase non consente ${context}: abilita SELECT, INSERT e UPDATE per il ruolo authenticated sulla tabella indicata, oltre alle policy RLS.`;
    if (error?.code === "PGRST116" || lower.includes("0 rows")) return `Supabase non ha restituito la riga modificata: controlla che la policy SELECT consenta all’utente di rileggere il proprio record.`;
    if (lower.includes("column") && (lower.includes("not found") || lower.includes("schema cache") || lower.includes("does not exist"))) {
      return `Lo schema Supabase non coincide con config.js (${raw}). Aggiorna la mappatura della colonna indicata.`;
    }
    if (lower.includes("relation") && lower.includes("does not exist")) return `La tabella richiesta non esiste o non è esposta: ${raw}`;
    if (lower.includes("failed to fetch") || lower.includes("network")) return "Connessione a Supabase non riuscita. Controlla rete, URL e configurazione CORS.";
    return raw;
  }

  function isSessionError(error) {
    const message = String(error?.message || "").toLowerCase();
    return error?.status === 401 || message.includes("jwt expired") || message.includes("invalid jwt") || message.includes("refresh token");
  }

  async function handleSessionError(error) {
    if (!isSessionError(error) || state.sessionExpiredHandled) return false;
    state.sessionExpiredHandled = true;
    showToast("La sessione è scaduta. Accedi di nuovo.", "warning", "Sessione terminata");
    try {
      await state.client?.auth?.signOut({ scope: "local" });
    } catch (_signOutError) {
      showAuth();
    }
    return true;
  }

  function emptyState(title, message, action = null) {
    const actionMarkup = action
      ? `<button class="button button--secondary" type="button" ${action.route ? `data-route="${escapeAttribute(action.route)}"` : `data-action="${escapeAttribute(action.name)}"`}>${action.icon ? icon(action.icon) : ""}${escapeHtml(action.label)}</button>`
      : "";
    return `
      <div class="empty-state">
        <span class="empty-icon">${icon("search")}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        ${actionMarkup}
      </div>
    `;
  }

  function demoData() {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000).toISOString();
    return {
      profiles: [{ id: "demo-user", full_name: "Demo User", email: "demo@jobfinder.local" }],
      companies: [
        { id: "c1", user_id: "demo-user", name: "Banca Generali", sector: "Financial Services", tier: "A", website: "https://www.bancagenerali.com", notes: "Focus trasformazione AI e customer experience." },
        { id: "c2", user_id: "demo-user", name: "Motor Valley Labs", sector: "Automotive", tier: "A", website: "https://example.com", notes: "Innovazione, motorsport e analytics." },
        { id: "c3", user_id: "demo-user", name: "Cloud North", sector: "Tech", tier: "B", website: "https://example.com", notes: "Scale-up europea remote-first." }
      ],
      jobs: [
        { id: "j1", user_id: "demo-user", company_id: "c1", company_name: "Banca Generali", title: "AI Product Manager", location: "Milano · Hybrid", fit_score: 9.6, status: "NEW", priority: "HIGH", source: "LinkedIn", url: "https://example.com", is_saved: true, why_fit: "Esperienza trasversale tra strategia, customer experience e adozione AI.", gaps: "Approfondire i requisiti regolamentari del settore wealth management.", angle: "Portare l’AI dalla strategia all’adozione misurabile, con forte attenzione al cliente.", recommended_cv: "AI / Strategy" },
        { id: "j2", user_id: "demo-user", company_id: "c2", company_name: "Motor Valley Labs", title: "Business Transformation Lead", location: "Modena · Hybrid", fit_score: 8.8, status: "REVIEW", priority: "HIGH", source: "Company site", url: "https://example.com", is_saved: false },
        { id: "j3", user_id: "demo-user", company_id: "c3", company_name: "Cloud North", title: "Customer Success Strategy Manager", location: "Remote EU", fit_score: 8.2, status: "APPLIED", priority: "MEDIUM", source: "Referral", url: "https://example.com", is_saved: true },
        { id: "j4", user_id: "demo-user", company_name: "PlayForge", title: "Customer Insights Lead", location: "Milano", fit_score: 7.5, status: "INTERVIEW", priority: "MEDIUM", source: "LinkedIn", url: "", is_saved: false }
      ],
      feedback: [{ id: "f1", user_id: "demo-user", job_id: "j2", feedback_type: "LIKE" }],
      applications: [{ id: "a1", user_id: "demo-user", job_id: "j3", company_id: "c3", status: "APPLIED", cv_used: "CX / Customer Success", progress: 100, applied_at: now.toISOString(), notes: "Candidatura inviata tramite referral.", preparation_status: "submitted" }],
      contacts: [{ id: "ct1", user_id: "demo-user", name: "Recruiter Demo", email: "recruiter@example.com", company_id: "c3", role: "Talent Partner" }],
      followups: [{ id: "fu1", user_id: "demo-user", action: "Follow-up candidatura", job_id: "j3", application_id: "a1", contact_id: "ct1", due_date: tomorrow, completed: false, notes: "Inviare un messaggio breve con un insight sul ruolo." }],
      answerBank: [{ id: "r1", user_id: "demo-user", title: "Perché vuoi questo ruolo?", category: "Motivazione", canonical_answer: "Struttura: contesto, impatto desiderato, prova concreta, collegamento all’azienda." }],
      preferences: []
    };
  }

  async function initialize() {
    bindStaticEvents();
    state.selectedJobId = window.sessionStorage.getItem("jobfinder:selected-job") || null;

    if (!isSupabaseConfigured()) {
      if (CONFIG.demoMode) {
        state.demo = true;
        state.user = { id: "demo-user", email: "demo@jobfinder.local", user_metadata: { full_name: "Demo User" } };
        state.data = demoData();
        state.profile = state.data.profiles[0];
        state.lastSync = new Date();
        showApp();
        renderAll();
      } else {
        showAuth({ configMissing: true });
      }
      hideInitialLoader();
      return;
    }

    if (!window.supabase?.createClient) {
      showAuth();
      setFormStatus($("authStatus"), "La libreria Supabase non è stata caricata. Controlla la connessione e ricarica.", "error");
      hideInitialLoader();
      return;
    }

    state.client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });

    state.client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") {
          showPasswordUpdate();
          hideInitialLoader();
          return;
        }
        if (event === "SIGNED_OUT") {
          resetAuthenticatedState();
          showAuth();
          hideInitialLoader();
          return;
        }
        if (session?.user && ["SIGNED_IN", "TOKEN_REFRESHED", "INITIAL_SESSION", "USER_UPDATED"].includes(event)) {
          void initializeSession(session);
        }
      }, 0);
    });

    try {
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      if (data.session?.user) {
        await initializeSession(data.session);
      } else {
        showAuth();
      }
    } catch (error) {
      showAuth();
      setFormStatus($("authStatus"), humanizeError(error, "l’accesso"), "error");
    } finally {
      hideInitialLoader();
    }
  }

  async function initializeSession(session) {
    if (!session?.user || state.sessionInitializing) return;
    const sameUserAlreadyLoaded = state.sessionUserId === session.user.id && state.lastSync;
    state.user = session.user;
    state.sessionExpiredHandled = false;
    showApp();
    updateUserIdentity();
    if (sameUserAlreadyLoaded) return;

    state.sessionInitializing = true;
    state.sessionUserId = session.user.id;
    try {
      await loadAllData();
    } finally {
      state.sessionInitializing = false;
      hideInitialLoader();
    }
  }

  function hideInitialLoader() {
    $("appLoading")?.classList.add("is-hidden");
  }

  function showAuth(options = {}) {
    $("authView")?.classList.remove("is-hidden");
    $("appView")?.classList.add("is-hidden");
    $("configWarning")?.classList.toggle("is-hidden", !options.configMissing);
    $("loginPanel")?.classList.remove("is-hidden");
    $("recoveryPanel")?.classList.add("is-hidden");
    $("updatePasswordPanel")?.classList.add("is-hidden");
    if (options.configMissing) {
      $("loginButton").disabled = true;
      $("googleLoginButton").disabled = true;
    }
  }

  function showApp() {
    $("authView")?.classList.add("is-hidden");
    $("appView")?.classList.remove("is-hidden");
    $("demoModeBanner")?.classList.toggle("is-hidden", !state.demo);
    const hashRoute = window.location.hash.slice(1);
    const initialRoute = PAGE_LABELS[hashRoute] ? hashRoute : "dashboard";
    navigate(initialRoute, { updateHash: false });
  }

  function showPasswordUpdate() {
    $("authView")?.classList.remove("is-hidden");
    $("appView")?.classList.add("is-hidden");
    $("loginPanel")?.classList.add("is-hidden");
    $("recoveryPanel")?.classList.add("is-hidden");
    $("updatePasswordPanel")?.classList.remove("is-hidden");
    $("newPassword")?.focus();
  }

  function resetAuthenticatedState() {
    state.user = null;
    state.profile = null;
    state.sessionUserId = null;
    state.lastSync = null;
    state.errors = {};
    state.optionalErrors = {};
    DATA_ENTITIES.forEach((entity) => { state.data[entity] = []; });
  }

  async function loadAllData(options = {}) {
    if (state.demo) {
      renderAll();
      return;
    }
    if (!state.client || !state.user || state.loadingData) return;
    state.loadingData = true;
    setRefreshState(true);
    state.errors = {};
    state.optionalErrors = {};

    const results = await Promise.all(DATA_ENTITIES.map(async (entity) => {
      try {
        const rows = await fetchEntity(entity);
        return [entity, rows];
      } catch (error) {
        if (OPTIONAL_ENTITIES.has(entity)) state.optionalErrors[entity] = error;
        else state.errors[entity] = error;
        await handleSessionError(error);
        return [entity, []];
      }
    }));

    results.forEach(([entity, rows]) => { state.data[entity] = rows; });
    state.profile = state.data.profiles[0] || null;
    state.lastSync = new Date();
    state.loadingData = false;
    setRefreshState(false);
    updateUserIdentity();
    renderAll();
    updateDataHealth();

    if (!options.quiet && Object.keys(state.errors).length === 0) {
      showToast("Dati aggiornati da Supabase.", "success", "Sincronizzazione completata");
    }
  }

  async function fetchEntity(entity) {
    const config = tableConfig(entity);
    let query = state.client.from(config.name).select("*");
    if (config.ownerColumn) query = query.eq(config.ownerColumn, state.user.id);
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function insertRecord(entity, payload) {
    if (!ensureWritable()) return null;
    const owner = ownerColumn(entity);
    const insertPayload = { ...payload };
    if (owner && insertPayload[owner] === undefined) insertPayload[owner] = state.user.id;
    const { data, error } = await state.client
      .from(tableName(entity))
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) {
      await handleSessionError(error);
      throw error;
    }
    state.data[entity].push(data);
    return data;
  }

  async function updateRecord(entity, id, patch) {
    if (!ensureWritable()) return null;
    let query = state.client.from(tableName(entity)).update(patch).eq("id", id);
    const owner = ownerColumn(entity);
    if (owner) query = query.eq(owner, state.user.id);
    const { data, error } = await query.select("*").single();
    if (error) {
      await handleSessionError(error);
      throw error;
    }
    const index = state.data[entity].findIndex((item) => String(item.id) === String(id));
    if (index >= 0) state.data[entity][index] = data;
    return data;
  }

  async function deleteRecord(entity, id) {
    if (!ensureWritable()) return false;
    let query = state.client.from(tableName(entity)).delete().eq("id", id);
    const owner = ownerColumn(entity);
    if (owner) query = query.eq(owner, state.user.id);
    const { error } = await query;
    if (error) {
      await handleSessionError(error);
      throw error;
    }
    state.data[entity] = state.data[entity].filter((item) => String(item.id) !== String(id));
    return true;
  }

  function ensureWritable() {
    if (state.demo) {
      showToast("Questa azione è disattivata nella modalità demo. Collega Supabase per salvare.", "warning", "Modalità demo");
      return false;
    }
    if (!state.client || !state.user) {
      showToast("Accedi di nuovo prima di modificare i dati.", "error", "Sessione non disponibile");
      return false;
    }
    return true;
  }

  function setRefreshState(isLoading) {
    [$("globalRefreshButton"), $("dashboardRefreshButton"), $("pipelineRefreshButton")].forEach((button) => {
      if (!button) return;
      button.disabled = isLoading;
      button.classList.toggle("is-spinning", isLoading);
    });
  }

  function updateDataHealth() {
    const failed = Object.keys(state.errors);
    const badge = $("dataHealthBadge");
    const alert = $("dataAlert");
    if (!badge || !alert) return;
    badge.classList.toggle("status-pill--error", failed.length > 0);
    badge.querySelector("span").textContent = failed.length ? `${failed.length} sorgenti non disponibili` : "Dati sincronizzati";
    if (failed.length) {
      alert.classList.remove("is-hidden");
      alert.innerHTML = `<strong>Alcuni dati non sono disponibili.</strong> Verifica tabelle, colonne e policy RLS per: ${failed.map((entity) => `<code>${escapeHtml(tableName(entity))}</code>`).join(", ")}. Le altre sezioni restano utilizzabili.`;
    } else {
      alert.classList.add("is-hidden");
      alert.textContent = "";
    }
  }

  function updateUserIdentity() {
    if (!state.user) return;
    const profileName = valueOf(state.profile, "profiles", "name", "");
    const metadataName = state.user.user_metadata?.full_name || state.user.user_metadata?.name || "";
    const displayName = profileName || metadataName || state.user.email?.split("@")[0] || "Il tuo account";
    const email = valueOf(state.profile, "profiles", "email", state.user.email || "—");
    const avatarText = initials(displayName, "U");
    $("sidebarUserName").textContent = displayName;
    $("sidebarUserEmail").textContent = email;
    $("sidebarAvatar").textContent = avatarText;
    $("topbarAvatar").textContent = avatarText;
    $("greetingName").textContent = displayName.split(" ")[0];
  }

  function navigate(route, options = {}) {
    const validRoute = PAGE_LABELS[route] ? route : "dashboard";
    state.route = validRoute;
    document.querySelectorAll(".page").forEach((page) => page.classList.toggle("is-active", page.dataset.page === validRoute));
    document.querySelectorAll(".nav-item[data-route]").forEach((item) => {
      const activeRoute = validRoute === "copilot" ? "applications" : validRoute;
      item.classList.toggle("is-active", item.dataset.route === activeRoute);
    });
    $("currentPageLabel").textContent = PAGE_LABELS[validRoute];
    closeSidebar();
    if (options.updateHash !== false && window.location.hash !== `#${validRoute}`) {
      window.history.pushState(null, "", `#${validRoute}`);
    }
    if (validRoute === "copilot") renderCopilot();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSidebar() {
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  function getCompanyById(id) {
    if (id === null || id === undefined || id === "") return null;
    return state.data.companies.find((company) => String(company.id) === String(id)) || null;
  }

  function getJobById(id) {
    if (id === null || id === undefined || id === "") return null;
    return state.data.jobs.find((job) => String(job.id) === String(id)) || null;
  }

  function getApplicationById(id) {
    if (id === null || id === undefined || id === "") return null;
    return state.data.applications.find((application) => String(application.id) === String(id)) || null;
  }

  function getApplicationForJob(jobId) {
    const jobColumn = fieldName("applications", "jobId");
    return state.data.applications.find((application) => String(application[jobColumn]) === String(jobId)) || null;
  }

  function getContactById(id) {
    if (id === null || id === undefined || id === "") return null;
    return state.data.contacts.find((contact) => String(contact.id) === String(id)) || null;
  }

  function companyNameForJob(job) {
    const linked = getCompanyById(valueOf(job, "jobs", "companyId", ""));
    return valueOf(linked, "companies", "name", "") || valueOf(job, "jobs", "companyName", "") || "Azienda non indicata";
  }

  function companyForApplication(application) {
    const direct = getCompanyById(valueOf(application, "applications", "companyId", ""));
    if (direct) return direct;
    const job = getJobById(valueOf(application, "applications", "jobId", ""));
    return getCompanyById(valueOf(job, "jobs", "companyId", ""));
  }

  function companyNameForApplication(application) {
    const company = companyForApplication(application);
    if (company) return valueOf(company, "companies", "name", "Azienda non indicata");
    const job = getJobById(valueOf(application, "applications", "jobId", ""));
    return job ? companyNameForJob(job) : "Azienda non indicata";
  }

  function jobTitle(job) {
    return valueOf(job, "jobs", "title", "Ruolo non indicato");
  }

  function jobFit(job) {
    return Math.max(0, Math.min(10, asNumber(valueOf(job, "jobs", "fitScore", 0), 0)));
  }

  function jobStatus(job) {
    const status = normalizeStatus(valueOf(job, "jobs", "status", "NEW"));
    return PIPELINE_STATES.includes(status) ? status : "NEW";
  }

  function jobPriority(job) {
    return normalizeStatus(valueOf(job, "jobs", "priority", "NORMAL"), "NORMAL");
  }

  function feedbackForJob(jobId) {
    const jobColumn = fieldName("feedback", "jobId");
    return state.data.feedback.find((feedback) => String(feedback[jobColumn]) === String(jobId)) || null;
  }

  function feedbackValueForJob(jobId) {
    const feedback = feedbackForJob(jobId);
    return feedback ? normalizeStatus(valueOf(feedback, "feedback", "value", ""), "") : "";
  }

  function currentPreferences() {
    const record = state.data.preferences[0] || null;
    const local = localPersonalization();
    if (!record) return { ...DEFAULT_PREFERENCES, ...local, isDefault: true, record: null };
    return {
      roles: toList(valueOf(record, "preferences", "roles", [])),
      sectors: toList(valueOf(record, "preferences", "sectors", [])),
      locations: toList(valueOf(record, "preferences", "locations", [])),
      workModes: toList(valueOf(record, "preferences", "workModes", [])),
      minFit: asNumber(valueOf(record, "preferences", "minFit", DEFAULT_PREFERENCES.minFit), DEFAULT_PREFERENCES.minFit),
      aiLearning: Boolean(valueOf(record, "preferences", "aiLearning", false)),
      motivations: local.motivations || DEFAULT_PREFERENCES.motivations,
      profileSkills: local.profileSkills || DEFAULT_PREFERENCES.profileSkills,
      profileCvText: local.profileCvText || DEFAULT_PREFERENCES.profileCvText,
      companyValues: local.companyValues || DEFAULT_PREFERENCES.companyValues,
      isDefault: false,
      record
    };
  }

  function personalizationKey() {
    return `jobfinder:personalization:${state.user?.id || "anonymous"}`;
  }

  function localPersonalization() {
    try {
      const value = JSON.parse(window.localStorage.getItem(personalizationKey()) || "null");
      return value && typeof value === "object" ? value : {};
    } catch (_error) {
      return {};
    }
  }

  function saveLocalPersonalization(value) {
    window.localStorage.setItem(personalizationKey(), JSON.stringify(value));
  }

  function statusBadge(status) {
    const normalized = normalizeStatus(status);
    const className = normalized === "OFFER" ? "badge--fit" : normalized === "INTERVIEW" ? "badge--warning" : normalized === "CLOSED" ? "badge--danger" : normalized === "APPLY" || normalized === "APPLIED" ? "badge--violet" : "badge--blue";
    const labels = { APPLIED: "APPLICATO", APPLY: "DA CANDIDARSI", DRAFT: "BOZZA", CONTACTED: "CONTATTATO", INTERVIEW: "COLLOQUIO", OFFER: "OFFERTA", CLOSED: "CHIUSO" };
    return `<span class="badge ${className}">${escapeHtml(labels[normalized] || normalized)}</span>`;
  }

  function isEasyApply(job) {
    return /easy\s*apply/i.test(String(valueOf(job, "jobs", "source", "")));
  }

  function easyApplyBadge(job) {
    return isEasyApply(job) ? `<span class="badge badge--linkedin">in Easy Apply</span>` : "";
  }

  function hasAppliedToJob(job) {
    const application = getApplicationForJob(job.id);
    const applicationStatus = normalizeStatus(valueOf(application, "applications", "status", ""), "");
    return ["APPLIED", "CONTACTED", "INTERVIEW", "OFFER"].includes(jobStatus(job))
      || ["APPLIED", "CONTACTED", "INTERVIEW", "OFFER", "CLOSED"].includes(applicationStatus)
      || Boolean(valueOf(application, "applications", "appliedAt", ""));
  }

  function companyLogoContent(job) {
    const companyName = companyNameForJob(job);
    const company = getCompanyById(valueOf(job, "jobs", "companyId", ""));
    const candidateUrl = safeExternalUrl(valueOf(company, "companies", "website", ""));
    let logo = "";
    if (candidateUrl) {
      try {
        const domain = new URL(candidateUrl).hostname;
        const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
        logo = `<img src="${escapeAttribute(logoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`;
      } catch (_error) {
        // Keep initials-only fallback.
      }
    }
    return `${logo}<span>${escapeHtml(initials(companyName))}</span>`;
  }

  function appliedStateMarkup() {
    return `<span class="applied-state">${icon("check")}Applicato</span>`;
  }

  function opportunityChoiceMarkup(job, laterLabel = "Applica più tardi") {
    if (hasAppliedToJob(job)) return appliedStateMarkup();
    if (Boolean(valueOf(job, "jobs", "saved", false)) || jobStatus(job) === "APPLY") {
      return `<span class="opportunity-choice">${icon("clock")}${escapeHtml(laterLabel)}</span>`;
    }
    return "";
  }

  function removeOpportunityButton(job) {
    return `<button class="button button--danger-ghost" type="button" data-action="remove-opportunity" data-id="${escapeAttribute(job.id)}">${icon("trash")}Cancella</button>`;
  }

  function jobDescriptionText(job) {
    let importedDescription = "";
    try {
      importedDescription = window.localStorage.getItem(`jobfinder:job-description:${state.user?.id || "anonymous"}:${job.id}`) || "";
    } catch (_error) {
      // Continue with database fields or a factual fallback.
    }
    return String(valueOf(job, "jobs", "description", "") || importedDescription).replace(/\s+/g, " ").trim();
  }

  function responsibilitySummary(job, limit = 260) {
    const description = jobDescriptionText(job);
    if (!description) return inferredRoleSummary(job);
    const sentences = description.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 25);
    const responsibilityPattern = /responsabil|attivit|cosa farai|what you.ll do|duties|manage|lead|develop|deliver|support|coordinate|gestir|guidar|svilupp|coordin|realizz|implement/i;
    const relevant = sentences.filter((sentence) => responsibilityPattern.test(sentence));
    const selected = (relevant.length ? relevant : sentences).slice(0, limit > 300 ? 4 : 2).join(" ") || description;
    return selected.length > limit ? `${selected.slice(0, limit - 1).trimEnd()}…` : selected;
  }

  function inferredRoleSummary(job) {
    const title = jobTitle(job);
    const normalized = title.toLowerCase();
    const company = companyNameForJob(job);
    const summaries = [
      [/transformation|program(?:me)? manager/, "Guidare programmi di trasformazione end-to-end, definendo governance, priorità e roadmap; coordinare stakeholder e team trasversali; monitorare avanzamento, rischi, dipendenze, budget e risultati."],
      [/product manager|product owner/, "Definire visione, priorità e roadmap di prodotto; tradurre bisogni di clienti e business in requisiti; coordinare design, tecnologia e stakeholder e misurare adozione e risultati."],
      [/project manager|project lead/, "Pianificare e coordinare progetti, responsabilità e scadenze; gestire stakeholder, rischi e dipendenze; monitorare l’esecuzione e assicurare la consegna dei risultati attesi."],
      [/customer success|client success/, "Gestire la relazione con i clienti lungo il ciclo di vita, favorire adozione e valore, anticipare criticità, coordinare le risposte interne e sostenere retention ed espansione."],
      [/customer experience|cx/, "Analizzare e migliorare il customer journey, trasformare insight e feedback in iniziative concrete, coordinare i team coinvolti e misurare l’impatto sull’esperienza cliente."],
      [/business analy|data analy|insight/, "Analizzare dati, processi e requisiti di business; produrre insight e raccomandazioni; definire indicatori e supportare stakeholder e decisioni con evidenze misurabili."],
      [/strategy|strategic/, "Supportare la definizione della strategia, analizzare mercato e opportunità, tradurre le priorità in iniziative operative e comunicare raccomandazioni chiare agli stakeholder."],
      [/sales operations|revops|revenue operations/, "Ottimizzare processi commerciali, pipeline e strumenti; definire metriche e reporting; coordinare sales, marketing e customer success per migliorare prevedibilità ed efficacia."],
      [/artificial intelligence|\bai\b|machine learning/, "Individuare e prioritizzare casi d’uso AI, tradurre obiettivi di business in requisiti, coordinare stakeholder tecnici e funzionali e misurare adozione, rischio e valore generato."],
      [/marketing/, "Pianificare e realizzare iniziative di marketing, coordinare contenuti e canali, analizzare pubblico e performance e ottimizzare le attività rispetto agli obiettivi di business."]
    ];
    const matched = summaries.find(([pattern]) => pattern.test(normalized));
    const summary = matched?.[1] || "Coordinare le attività chiave del ruolo, collaborare con gli stakeholder, gestire priorità e deliverable e contribuire con risultati misurabili agli obiettivi del team.";
    return `Sintesi dedotta dal titolo “${title}” in ${company}: ${summary}`;
  }

  function roleSummary(job) {
    return responsibilitySummary(job, 260);
  }

  function priorityBadge(priority) {
    const normalized = normalizeStatus(priority, "NORMAL");
    const className = ["HIGH", "URGENT", "ALTA"].includes(normalized) ? "badge--danger" : ["MEDIUM", "MEDIA"].includes(normalized) ? "badge--warning" : "";
    return `<span class="badge ${className}">${escapeHtml(titleCase(normalized))}</span>`;
  }

  function highFitBadge(fit) {
    if (fit >= 8) return `<span class="badge badge--fit">ALTO FIT</span>`;
    if (fit >= 7) return `<span class="badge badge--blue">BUON FIT</span>`;
    return `<span class="badge">FIT ${fit.toFixed(1)}</span>`;
  }

  function feedbackButtons(jobId, compact = false, exclusiveSelection = false) {
    const current = feedbackValueForJob(jobId);
    const items = [
      ["LIKE", "thumbs-up", "LIKE"],
      ["DISLIKE", "thumbs-down", "DISLIKE"]
    ].filter(([value]) => !exclusiveSelection || !current || current === value);
    return `<div class="feedback-actions ${exclusiveSelection ? "feedback-actions--exclusive" : ""}">${items.map(([value, iconName, label]) => `
      <button class="feedback-button ${current === value ? "is-active" : ""}" type="button" data-action="feedback" data-id="${escapeAttribute(jobId)}" data-feedback="${value}" aria-pressed="${current === value}">
        ${icon(iconName)}${compact ? "" : `<span>${label}</span>`}
      </button>
    `).join("")}</div>`;
  }

  function saveButton(job) {
    const saved = Boolean(valueOf(job, "jobs", "saved", false));
    return `<button class="icon-button save-button ${saved ? "is-saved" : ""}" type="button" data-action="toggle-save" data-id="${escapeAttribute(job.id)}" aria-label="${saved ? "Rimuovi dai salvati" : "Salva opportunità"}" aria-pressed="${saved}">${icon("heart")}</button>`;
  }

  function applicationActionButtons(job, options = {}) {
    const saved = Boolean(valueOf(job, "jobs", "saved", false));
    const compact = Boolean(options.compact);
    return `
      <button class="button button--secondary" type="button" data-action="save-for-later" data-id="${escapeAttribute(job.id)}">
        ${compact ? "" : icon("clock")}<span>${saved ? "Salvata per dopo" : "Applica più tardi"}</span>
      </button>
      <button class="button button--success" type="button" data-action="mark-applied" data-id="${escapeAttribute(job.id)}">
        ${compact ? "" : icon("check")}<span>Ho applicato</span>
      </button>
    `;
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
    renderTemplates();
    renderResources();
    renderAnalytics();
    renderCopilot();
    updateNavigationCounts();
    updateLastSync();
  }

  function updateNavigationCounts() {
    const visibleJobs = state.data.jobs.filter((job) => jobStatus(job) !== "CLOSED");
    const openFollowups = state.data.followups.filter((followup) => !Boolean(valueOf(followup, "followups", "completed", false)));
    $("navOpportunityCount").textContent = String(visibleJobs.length);
    $("navFollowupCount").textContent = String(openFollowups.length);
    $("navTemplateCount").textContent = String(state.data.answerBank.length);
  }

  function updateLastSync() {
    $("lastSyncLabel").textContent = state.lastSync ? `Aggiornato ${formatDateTime(state.lastSync)}` : "Non ancora sincronizzato";
  }

  function renderDashboard() {
    const jobs = [...state.data.jobs];
    const applications = [...state.data.applications];
    const highFit = jobs.filter((job) => jobFit(job) >= 8 && jobStatus(job) !== "CLOSED");
    const activeApplications = applicationRegisterEntries().filter((entry) => !["CLOSED", "REJECTED", "WITHDRAWN"].includes(entry.status));
    const interviewIds = new Set();
    const offerIds = new Set();
    jobs.forEach((job) => {
      if (jobStatus(job) === "INTERVIEW") interviewIds.add(`job:${job.id}`);
      if (jobStatus(job) === "OFFER") offerIds.add(`job:${job.id}`);
    });
    applications.forEach((application) => {
      const linkedJob = valueOf(application, "applications", "jobId", "");
      const status = normalizeStatus(valueOf(application, "applications", "status", ""), "");
      if (status === "INTERVIEW") interviewIds.add(linkedJob ? `job:${linkedJob}` : `app:${application.id}`);
      if (status === "OFFER") offerIds.add(linkedJob ? `job:${linkedJob}` : `app:${application.id}`);
    });

    $("kpiHighFit").textContent = String(highFit.length);
    $("kpiApplications").textContent = String(activeApplications.length);
    $("kpiInterviews").textContent = String(interviewIds.size);
    $("kpiOffers").textContent = String(offerIds.size);
    $("kpiCompanies").textContent = String(state.data.companies.length);
    $("kpiHighFitMeta").textContent = highFit.length ? `${highFit.filter((job) => jobFit(job) >= 9).length} con fit ≥ 9` : "Fit ≥ 8/10";
    $("kpiApplicationsMeta").textContent = activeApplications.length === 1 ? "1 candidatura attiva" : `${activeApplications.length} candidature attive`;
    $("kpiInterviewsMeta").textContent = interviewIds.size ? "Da preparare e seguire" : "Nessun colloquio aperto";
    $("kpiOffersMeta").textContent = offerIds.size ? "Congratulazioni!" : "Nessuna offerta aperta";
    $("kpiCompaniesMeta").textContent = `${state.data.companies.filter((company) => normalizeStatus(valueOf(company, "companies", "tier", ""), "") === "A").length} Tier A`;

    const visibleJobs = jobs.filter((job) => jobStatus(job) !== "CLOSED");
    const isEvaluated = (job) => hasAppliedToJob(job)
      || Boolean(valueOf(job, "jobs", "saved", false))
      || !["NEW", "REVIEW"].includes(jobStatus(job))
      || Boolean(feedbackValueForJob(job.id));
    const byNewest = (a, b) => new Date(valueOf(b, "jobs", "createdAt", 0)) - new Date(valueOf(a, "jobs", "createdAt", 0));
    const newJobs = visibleJobs.filter((job) => !isEvaluated(job)).sort(byNewest).slice(0, 6);
    const evaluatedJobs = visibleJobs.filter(isEvaluated).sort(byNewest).slice(0, 6);
    $("newOpportunityCount").textContent = String(newJobs.length);
    $("evaluatedOpportunityCount").textContent = String(evaluatedJobs.length);
    $("newOpportunities").innerHTML = newJobs.length
      ? newJobs.map(renderTopOpportunity).join("")
      : emptyState("Nessuna nuova opportunità", "Le nuove posizioni importate compariranno qui prima della valutazione.", { route: "opportunities", label: "Apri opportunità", icon: "search" });
    $("evaluatedOpportunities").innerHTML = evaluatedJobs.length
      ? evaluatedJobs.map(renderTopOpportunity).join("")
      : emptyState("Nessuna opportunità valutata", "Quando scegli di applicare ora, più tardi o registri una candidatura, la posizione passerà qui.");

    renderAttentionList();
  }

  function renderTopOpportunity(job) {
    const company = companyNameForJob(job);
    const fit = jobFit(job);
    const location = valueOf(job, "jobs", "location", "Location non indicata");
    const choice = opportunityChoiceMarkup(job, "Applica dopo");
    const dashboardStatus = jobStatus(job) === "APPLY" ? "" : statusBadge(jobStatus(job));
    return `
      <article class="top-opportunity top-opportunity--clickable" data-action="open-copilot" data-id="${escapeAttribute(job.id)}" role="link" tabindex="0" aria-label="Apri ${escapeAttribute(jobTitle(job))}">
        <div class="company-logo">${companyLogoContent(job)}</div>
        <div class="opportunity-copy">
          <h3>${escapeHtml(jobTitle(job))}</h3>
          <p>${escapeHtml(company)} · ${escapeHtml(location)}</p>
          <div class="opportunity-copy__badges">${highFitBadge(fit)}${dashboardStatus}${easyApplyBadge(job)}${feedbackButtons(job.id, true, true)}</div>
        </div>
        ${choice ? `<div class="top-opportunity__decision">${choice}</div>` : ""}
        <div class="fit-score"><strong>${fit.toFixed(1)}/10</strong><small>Fit score</small></div>
      </article>
    `;
  }

  function renderAttentionList() {
    const followups = state.data.followups
      .filter((followup) => !Boolean(valueOf(followup, "followups", "completed", false)))
      .sort((a, b) => new Date(valueOf(a, "followups", "dueDate", "9999-12-31")) - new Date(valueOf(b, "followups", "dueDate", "9999-12-31")))
      .slice(0, 4);
    if (!followups.length) {
      $("attentionList").innerHTML = emptyState("Tutto sotto controllo", "Non ci sono follow-up aperti. Puoi crearne uno dalla pagina dedicata.", { name: "new-followup", label: "Nuovo follow-up", icon: "plus" });
      return;
    }
    $("attentionList").innerHTML = followups.map((followup) => {
      const job = getJobById(valueOf(followup, "followups", "jobId", ""));
      const dueDate = valueOf(followup, "followups", "dueDate", "");
      return `
        <article class="attention-item">
          <span class="attention-icon">${icon("clock")}</span>
          <div><strong>${escapeHtml(valueOf(followup, "followups", "action", "Follow-up"))}</strong><p>${escapeHtml(job ? `${companyNameForJob(job)} · ${jobTitle(job)}` : "Azione generale")}</p></div>
          <span class="attention-date">${escapeHtml(formatDate(dueDate, { short: true, withYear: false }))}</span>
        </article>
      `;
    }).join("");
  }

  function setSelectOptions(select, values, allLabel) {
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(new Option(allLabel, ""));
    values.forEach((value) => select.add(new Option(value, value)));
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function renderOpportunityFilters() {
    const statuses = [...new Set(state.data.jobs.map(jobStatus))].sort();
    const priorities = [...new Set(state.data.jobs.map(jobPriority))].sort();
    const companies = [...new Set(state.data.jobs.map(companyNameForJob))].sort((a, b) => a.localeCompare(b, "it"));
    const locations = [...new Set(state.data.jobs.map((job) => asText(valueOf(job, "jobs", "location", ""), "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
    setSelectOptions($("opportunityStatusFilter"), statuses, "Tutti");
    setSelectOptions($("opportunityPriorityFilter"), priorities, "Tutte");
    setSelectOptions($("opportunityCompanyFilter"), companies, "Tutte");
    setSelectOptions($("opportunityLocationFilter"), locations, "Tutte");
  }

  function filteredJobs() {
    const minFit = asNumber($("opportunityFitFilter")?.value, 7);
    const status = $("opportunityStatusFilter")?.value || "";
    const priority = $("opportunityPriorityFilter")?.value || "";
    const company = $("opportunityCompanyFilter")?.value || "";
    const location = $("opportunityLocationFilter")?.value || "";
    return state.data.jobs
      .filter((job) => jobStatus(job) !== "CLOSED")
      .filter((job) => jobFit(job) >= minFit)
      .filter((job) => !status || jobStatus(job) === status)
      .filter((job) => !priority || jobPriority(job) === priority)
      .filter((job) => !company || companyNameForJob(job) === company)
      .filter((job) => !location || valueOf(job, "jobs", "location", "") === location)
      .sort((a, b) => jobFit(b) - jobFit(a));
  }

  function renderOpportunities(options = {}) {
    if (!options.preserveFilters) renderOpportunityFilters();
    const jobs = filteredJobs();
    $("opportunityHeroCount").textContent = String(state.data.jobs.length);
    $("opportunityResultCount").textContent = `${jobs.length} ${jobs.length === 1 ? "risultato" : "risultati"}`;
    $("opportunitiesList").innerHTML = jobs.length
      ? jobs.map(renderOpportunityCard).join("")
      : emptyState("Nessuna opportunità trovata", state.data.jobs.length ? "Prova ad abbassare il Fit minimo o ad azzerare i filtri." : "La tabella jobs è vuota. Le nuove opportunità compariranno qui automaticamente.", state.data.jobs.length ? { name: "clear-filters", label: "Azzera filtri", icon: "refresh" } : null);
  }

  function renderOpportunityCard(job) {
    const company = companyNameForJob(job);
    const fit = jobFit(job);
    const location = valueOf(job, "jobs", "location", "Location non indicata");
    const source = valueOf(job, "jobs", "source", "Source non indicata");
    const decision = opportunityChoiceMarkup(job);
    return `
      <article class="opportunity-card opportunity-card--clickable" data-action="open-copilot" data-id="${escapeAttribute(job.id)}" role="link" tabindex="0" aria-label="Apri ${escapeAttribute(jobTitle(job))}">
        <div class="opportunity-card__top ${decision ? "opportunity-card__top--decided" : ""}">
          <div class="company-logo">${companyLogoContent(job)}</div>
          <div class="opportunity-copy">
            <h3>${escapeHtml(jobTitle(job))}</h3>
            <p>${escapeHtml(company)}</p>
            <div class="opportunity-copy__badges">${highFitBadge(fit)}${statusBadge(jobStatus(job))}${priorityBadge(jobPriority(job))}${easyApplyBadge(job)}</div>
          </div>
          ${decision ? `<div class="opportunity-card__primary-action">${decision}</div>` : ""}
          <div class="fit-score"><strong>${fit.toFixed(1)}/10</strong><small>Fit score</small></div>
        </div>
        <div class="opportunity-card__meta">
          <span>${icon("building")}${escapeHtml(location)}</span>
          <span>${icon("link")}${escapeHtml(source)}</span>
        </div>
        <div class="opportunity-card__role-summary"><strong>Responsabilità principali</strong><p class="opportunity-card__description">${escapeHtml(roleSummary(job))}</p></div>
        <div class="opportunity-card__footer">
          <div class="opportunity-card__action-row">
            <button class="button button--secondary" type="button" data-action="open-job" data-id="${escapeAttribute(job.id)}">${icon("external")}Apri annuncio</button>
            <div class="opportunity-card__action-row-right">
              ${["APPLIED", "CONTACTED", "INTERVIEW"].includes(jobStatus(job)) ? `<button class="button button--secondary" type="button" data-action="find-contacts" data-id="${escapeAttribute(job.id)}">Trova contatti</button>` : ""}
              ${hasAppliedToJob(job) ? "" : `<button class="button button--success" type="button" data-action="mark-applied" data-id="${escapeAttribute(job.id)}">${icon("check")}<span>Ho applicato</span></button>`}
              ${removeOpportunityButton(job)}
            </div>
          </div>
          <div class="opportunity-card__feedback"><span>Questa opportunità è utile?</span>${feedbackButtons(job.id)}</div>
        </div>
      </article>
    `;
  }

  function renderPipeline() {
    $("pipelineBoard").innerHTML = PIPELINE_STATES.map((status, index) => {
      const jobs = state.data.jobs.filter((job) => jobStatus(job) === status).sort((a, b) => jobFit(b) - jobFit(a));
      return `
        <section class="kanban-column" style="--column-color:${PIPELINE_COLORS[status]}">
          <header class="kanban-column__heading"><strong>${status}</strong><span class="kanban-count">${jobs.length}</span></header>
          <div class="kanban-cards">
            ${jobs.length ? jobs.map((job) => renderKanbanCard(job, index)).join("") : `<div class="kanban-empty">Nessuna opportunità</div>`}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderKanbanCard(job, statusIndex) {
    const status = PIPELINE_STATES[statusIndex];
    const application = getApplicationForJob(job.id);
    const nextAction = ["APPLIED", "CONTACTED", "INTERVIEW"].includes(status)
      ? `<button class="button button--secondary" type="button" data-action="find-contacts" data-id="${escapeAttribute(job.id)}">Trova contatti</button>`
      : `<button class="button button--secondary" type="button" data-action="open-copilot" data-id="${escapeAttribute(job.id)}">Prepara candidatura</button>`;
    return `
      <article class="kanban-card">
        <div class="kanban-card__top"><span class="company-logo">${escapeHtml(initials(companyNameForJob(job)))}</span><span class="badge badge--fit">${jobFit(job).toFixed(1)}</span></div>
        <h3>${escapeHtml(jobTitle(job))}</h3>
        <p>${escapeHtml(companyNameForJob(job))} · ${escapeHtml(valueOf(job, "jobs", "location", "—"))}</p>
        <div class="kanban-card__footer">
          ${status === "CLOSED" ? `<span class="badge">CHIUSA</span>` : nextAction}
          ${application && status === "APPLIED" ? `<button class="text-button" type="button" data-action="followup-for-application" data-id="${escapeAttribute(application.id)}">Follow-up</button>` : ""}
        </div>
      </article>
    `;
  }

  function applicationProgress(application) {
    const stored = asNumber(valueOf(application, "applications", "progress", Number.NaN), Number.NaN);
    if (Number.isFinite(stored)) return Math.max(0, Math.min(100, stored));
    const preparation = String(valueOf(application, "applications", "preparationStatus", "draft")).toLowerCase();
    return { draft: 20, in_progress: 55, ready: 85, submitted: 100 }[preparation] || 20;
  }

  function renderApplications() {
    const entries = applicationRegisterEntries().sort((a, b) => {
      const dateA = new Date(valueOf(a.application, "applications", "appliedAt", a.application?.created_at || 0)).getTime() || 0;
      const dateB = new Date(valueOf(b.application, "applications", "appliedAt", b.application?.created_at || 0)).getTime() || 0;
      return dateB - dateA;
    });
    const sent = entries.filter((entry) => ["APPLIED", "CONTACTED", "INTERVIEW", "OFFER"].includes(entry.status)).length;
    const missing = entries.filter((entry) => entry.missingRecord).length;
    const withoutFollowup = entries.filter((entry) => entry.status === "APPLIED" && !followupForEntry(entry)).length;
    const applicationsError = state.errors.applications;
    const errorNotice = applicationsError ? `<div class="notice notice--warning application-data-warning"><strong>Tabella applications non disponibile</strong><span>${escapeHtml(humanizeError(applicationsError, "la lettura delle candidature"))}</span></div>` : "";
    $("applicationHeroCount").textContent = String(entries.length);
    $("applicationSummary").innerHTML = `
      <article class="mini-kpi"><span>Inviate</span><strong>${sent}</strong><small>registrate</small></article>
      <article class="mini-kpi"><span>Da seguire</span><strong>${withoutFollowup}</strong><small>senza follow-up</small></article>
      <article class="mini-kpi ${missing ? "mini-kpi--warning" : ""}"><span>Da completare</span><strong>${missing}</strong><small>record Supabase</small></article>`;
    if (!entries.length) {
      $("applicationsList").innerHTML = `${errorNotice}${emptyState("Nessuna candidatura registrata", "Quando premi “Ho applicato”, la candidatura comparirà qui con data, materiali e prossima azione.", { route: "opportunities", label: "Apri opportunità", icon: "search" })}`;
      return;
    }
    $("applicationsList").innerHTML = `
      ${errorNotice}
      ${missing ? `<div class="notice notice--warning application-data-warning"><strong>${missing} ${missing === 1 ? "candidatura richiede" : "candidature richiedono"} attenzione</strong><span>Il job è registrato come APPLIED, ma Supabase non ha creato il record application. Usa “Registra ora”; se fallisce, controlla grant e policy RLS della tabella applications.</span></div>` : ""}
      <table class="data-table">
        <thead><tr><th>Azienda / ruolo</th><th>Status</th><th>Data invio</th><th>Materiali</th><th>Prossima azione</th><th></th></tr></thead>
        <tbody>${entries.map(renderApplicationRow).join("")}</tbody>
      </table>
    `;
  }

  function applicationRegisterEntries() {
    const entries = state.data.applications.map((application) => {
      const job = getJobById(valueOf(application, "applications", "jobId", ""));
      return { application, job, missingRecord: false, status: normalizeStatus(valueOf(application, "applications", "status", job ? jobStatus(job) : "DRAFT"), "DRAFT") };
    });
    const represented = new Set(entries.map((entry) => String(entry.job?.id || "")).filter(Boolean));
    state.data.jobs
      .filter((job) => ["APPLIED", "CONTACTED", "INTERVIEW", "OFFER"].includes(jobStatus(job)) && !represented.has(String(job.id)))
      .forEach((job) => entries.push({ application: null, job, missingRecord: true, status: jobStatus(job) }));
    return entries;
  }

  function followupForEntry(entry) {
    return state.data.followups.find((followup) => {
      const applicationId = valueOf(followup, "followups", "applicationId", "");
      const jobId = valueOf(followup, "followups", "jobId", "");
      return (entry.application && String(applicationId) === String(entry.application.id)) || (entry.job && String(jobId) === String(entry.job.id));
    }) || null;
  }

  function renderApplicationRow(entry) {
    const { application, job, missingRecord } = entry;
    const company = application ? companyNameForApplication(application) : companyNameForJob(job);
    const title = job ? jobTitle(job) : "Ruolo non disponibile";
    const status = entry.status;
    const followup = followupForEntry(entry);
    const appliedAt = valueOf(application, "applications", "appliedAt", "");
    const materialState = missingRecord ? "Record incompleto" : valueOf(application, "applications", "cvUsed", "CV non indicato");
    const nextAction = followup
      ? `${Boolean(valueOf(followup, "followups", "completed", false)) ? "Completato" : formatDate(valueOf(followup, "followups", "dueDate", ""), { short: true })}`
      : status === "APPLIED" ? "Imposta follow-up" : status === "INTERVIEW" ? "Prepara colloquio" : "Aggiorna stato";
    return `
      <tr class="${missingRecord ? "application-row--warning" : ""}">
        <td><div class="table-primary"><span class="company-logo">${job ? companyLogoContent(job) : escapeHtml(initials(company))}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(company)}</small>${job ? `<small class="application-role-description"><b>Responsabilità:</b> ${escapeHtml(responsibilitySummary(job, 520))}</small>` : ""}</span></div></td>
        <td>${statusBadge(status)}</td>
        <td>${escapeHtml(appliedAt ? formatDate(appliedAt, { short: true }) : missingRecord ? "Da recuperare" : "Non indicata")}</td>
        <td><span class="${missingRecord ? "text-warning" : ""}">${escapeHtml(materialState)}</span></td>
        <td><strong>${escapeHtml(nextAction)}</strong></td>
        <td><div class="row-actions">
          ${missingRecord ? `<button class="button button--warning" type="button" data-action="mark-applied" data-id="${escapeAttribute(job.id)}">Registra ora</button>` : ""}
          ${job ? `<button class="button button--secondary" type="button" data-action="copy-application-kit" data-id="${escapeAttribute(job.id)}">Copia kit</button><button class="button button--secondary" type="button" data-action="find-contacts" data-id="${escapeAttribute(job.id)}">Trova contatti</button>` : ""}
          ${application ? `<button class="icon-button" type="button" data-action="application-status" data-id="${escapeAttribute(application.id)}" aria-label="Aggiorna stato" title="Aggiorna stato">${icon("columns")}</button><button class="icon-button" type="button" data-action="followup-for-application" data-id="${escapeAttribute(application.id)}" aria-label="Crea follow-up" title="Crea follow-up">${icon("clock")}</button>` : ""}
        </div></td>
      </tr>
    `;
  }

  function renderCompanies() {
    const companies = [...state.data.companies].sort((a, b) => {
      const tiers = { A: 1, B: 2, C: 3 };
      const tierA = normalizeStatus(valueOf(a, "companies", "tier", "C"), "C");
      const tierB = normalizeStatus(valueOf(b, "companies", "tier", "C"), "C");
      return (tiers[tierA] || 9) - (tiers[tierB] || 9) || String(valueOf(a, "companies", "name", "")).localeCompare(String(valueOf(b, "companies", "name", "")), "it");
    });
    $("companiesList").innerHTML = companies.length
      ? companies.map(renderCompanyCard).join("")
      : emptyState("Nessuna azienda target", "Aggiungi la prima azienda da monitorare. Verrà salvata nella tabella companies.", { name: "add-company", label: "Aggiungi azienda", icon: "plus" });
  }

  function renderCompanyCard(company) {
    const name = valueOf(company, "companies", "name", "Azienda senza nome");
    const tier = normalizeStatus(valueOf(company, "companies", "tier", "C"), "C");
    const jobsCount = state.data.jobs.filter((job) => String(valueOf(job, "jobs", "companyId", "")) === String(company.id) || companyNameForJob(job) === name).length;
    const website = safeExternalUrl(valueOf(company, "companies", "website", ""));
    const notes = valueOf(company, "companies", "notes", "");
    return `
      <article class="company-card">
        <header class="company-card__header">
          <div class="company-card__identity"><span class="company-logo">${escapeHtml(initials(name))}</span><span><h3>${escapeHtml(name)}</h3><p>${escapeHtml(valueOf(company, "companies", "sector", "Settore non indicato"))}</p></span></div>
          <span class="badge ${tier === "A" ? "badge--fit" : tier === "B" ? "badge--blue" : ""}">TIER ${escapeHtml(tier)}</span>
        </header>
        <p class="company-card__notes">${escapeHtml(notes || "Nessuna nota aggiunta.")}</p>
        <footer class="company-card__footer">
          <span>${jobsCount} ${jobsCount === 1 ? "opportunità" : "opportunità"}</span>
          <div class="card-actions">
            ${website ? `<button class="icon-button" type="button" data-action="open-url" data-url="${escapeAttribute(website)}" aria-label="Apri sito" title="Apri sito">${icon("external")}</button>` : ""}
            <button class="button button--secondary" type="button" data-action="view-company" data-id="${escapeAttribute(company.id)}">Apri scheda</button>
            <button class="icon-button" type="button" data-action="edit-company" data-id="${escapeAttribute(company.id)}" aria-label="Modifica azienda" title="Modifica">${icon("edit")}</button>
          </div>
        </footer>
      </article>
    `;
  }

  function followupDueState(followup) {
    if (Boolean(valueOf(followup, "followups", "completed", false))) return "complete";
    const raw = valueOf(followup, "followups", "dueDate", "");
    if (!raw) return "none";
    const due = new Date(raw);
    if (Number.isNaN(due.getTime())) return "none";
    const end = new Date(due);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < Date.now()) return "overdue";
    const diff = end.getTime() - Date.now();
    if (diff < 48 * 60 * 60 * 1000) return "soon";
    return "future";
  }

  function renderFollowups() {
    const followups = [...state.data.followups].sort((a, b) => {
      const completeA = Boolean(valueOf(a, "followups", "completed", false));
      const completeB = Boolean(valueOf(b, "followups", "completed", false));
      if (completeA !== completeB) return Number(completeA) - Number(completeB);
      return new Date(valueOf(a, "followups", "dueDate", "9999-12-31")) - new Date(valueOf(b, "followups", "dueDate", "9999-12-31"));
    });
    const open = followups.filter((item) => !Boolean(valueOf(item, "followups", "completed", false))).length;
    const overdue = followups.filter((item) => followupDueState(item) === "overdue").length;
    const complete = followups.length - open;
    $("followupSummary").innerHTML = `
      <article class="mini-kpi"><span>Aperti</span><strong>${open}</strong><small>da completare</small></article>
      <article class="mini-kpi"><span>In ritardo</span><strong>${overdue}</strong><small>da recuperare</small></article>
      <article class="mini-kpi"><span>Completati</span><strong>${complete}</strong><small>totale</small></article>
    `;
    $("followupsList").innerHTML = followups.length
      ? followups.map(renderFollowupItem).join("")
      : emptyState("Nessun follow-up", "Crea azioni collegate a job, application e contatti per non perdere le scadenze.", { name: "new-followup", label: "Nuovo follow-up", icon: "plus" });
  }

  function renderFollowupItem(followup) {
    const completed = Boolean(valueOf(followup, "followups", "completed", false));
    const dueState = followupDueState(followup);
    const job = getJobById(valueOf(followup, "followups", "jobId", ""));
    const application = getApplicationById(valueOf(followup, "followups", "applicationId", ""));
    const contact = getContactById(valueOf(followup, "followups", "contactId", ""));
    const contactName = valueOf(contact, "contacts", "name", valueOf(followup, "followups", "contactName", ""));
    const linkedText = job ? `${companyNameForJob(job)} · ${jobTitle(job)}` : application ? companyNameForApplication(application) : "Azione generale";
    return `
      <article class="followup-item ${completed ? "is-complete" : ""}">
        <button class="followup-check ${completed ? "is-complete" : ""}" type="button" data-action="toggle-followup" data-id="${escapeAttribute(followup.id)}" aria-label="${completed ? "Riapri follow-up" : "Completa follow-up"}" aria-pressed="${completed}">${icon("check")}</button>
        <div class="followup-copy">
          <h3>${escapeHtml(valueOf(followup, "followups", "action", "Follow-up"))}</h3>
          <p>${escapeHtml(linkedText)}${contactName ? ` · ${escapeHtml(contactName)}` : ""}${valueOf(followup, "followups", "notes", "") ? ` · ${escapeHtml(valueOf(followup, "followups", "notes", ""))}` : ""}</p>
        </div>
        <div class="due-date ${dueState === "overdue" ? "is-overdue" : ""}"><span>${dueState === "overdue" ? "In ritardo" : "Scadenza"}</span><strong>${escapeHtml(formatDate(valueOf(followup, "followups", "dueDate", ""), { short: true }))}</strong></div>
        <div class="row-actions">
          <button class="icon-button" type="button" data-action="edit-followup" data-id="${escapeAttribute(followup.id)}" aria-label="Modifica follow-up" title="Modifica">${icon("edit")}</button>
          <button class="icon-button" type="button" data-action="delete-followup" data-id="${escapeAttribute(followup.id)}" aria-label="Elimina follow-up" title="Elimina">${icon("trash")}</button>
        </div>
      </article>
    `;
  }

  function renderFeedback() {
    const values = state.data.feedback.map((feedback) => normalizeStatus(valueOf(feedback, "feedback", "value", ""), ""));
    const count = (kind) => values.filter((value) => value === kind).length;
    $("feedbackSummary").innerHTML = `
      <article class="mini-kpi"><span>LIKE</span><strong>${count("LIKE")}</strong><small>preferite</small></article>
      <article class="mini-kpi"><span>DISLIKE</span><strong>${count("DISLIKE")}</strong><small>non in target</small></article>
      <article class="mini-kpi"><span>PASS</span><strong>${count("PASS")}</strong><small>saltate</small></article>
    `;
    const jobs = [...state.data.jobs].sort((a, b) => jobFit(b) - jobFit(a));
    $("feedbackList").innerHTML = jobs.length
      ? jobs.map((job) => `
        <article class="feedback-card">
          <span class="company-logo">${escapeHtml(initials(companyNameForJob(job)))}</span>
          <div><h3>${escapeHtml(jobTitle(job))}</h3><p>${escapeHtml(companyNameForJob(job))} · Fit ${jobFit(job).toFixed(1)}/10</p></div>
          ${feedbackButtons(job.id)}
        </article>
      `).join("")
      : emptyState("Nessuna opportunità da valutare", "Il feedback sarà disponibile quando la tabella jobs conterrà almeno un’opportunità.");
  }

  function renderPreferences() {
    const preferences = currentPreferences();
    $("preferenceRoles").value = preferences.roles.join("\n");
    $("preferenceSectors").value = preferences.sectors.join("\n");
    $("preferenceLocations").value = preferences.locations.join("\n");
    $("preferenceWorkModes").value = preferences.workModes.join("\n");
    $("preferenceMotivations").value = preferences.motivations;
    $("preferenceProfileSkills").value = preferences.profileSkills;
    $("preferenceCvText").value = preferences.profileCvText;
    $("preferenceCompanyValues").value = preferences.companyValues;
    $("preferenceMinFit").value = String(preferences.minFit);
    $("preferenceMinFitOutput").textContent = asNumber(preferences.minFit, 7).toFixed(1);
    $("preferenceAiLearning").checked = preferences.aiLearning;
    const notice = $("preferencesSourceNotice");
    notice.classList.toggle("is-hidden", !preferences.isDefault);
    if (preferences.isDefault) {
      notice.innerHTML = `<strong>Valori iniziali</strong><span>La tabella ${escapeHtml(tableName("preferences"))} è vuota. Questi suggerimenti diventano la tua fonte dati solo dopo “Salva preferenze”.</span>`;
    }
    const updatedAt = preferences.record ? valueOf(preferences.record, "preferences", "updatedAt", "") : "";
    $("preferencesUpdatedAt").textContent = updatedAt ? `Ultimo salvataggio: ${formatDateTime(updatedAt)}` : "Preferenze non ancora salvate";
  }

  function renderResources() {
    const resources = [...state.data.answerBank].sort((a, b) => String(valueOf(a, "answerBank", "title", "")).localeCompare(String(valueOf(b, "answerBank", "title", "")), "it"));
    $("resourcesList").innerHTML = resources.length
      ? resources.map((resource) => {
        const content = valueOf(resource, "answerBank", "content", "");
        return `
          <article class="resource-card">
            <div><span class="resource-icon">${icon("book")}</span><h3>${escapeHtml(valueOf(resource, "answerBank", "title", "Risorsa"))}</h3><p>${escapeHtml(content ? `${content.slice(0, 150)}${content.length > 150 ? "…" : ""}` : "Contenuto non disponibile.")}</p></div>
            <footer><span>${escapeHtml(valueOf(resource, "answerBank", "category", "Answer bank"))}</span><button class="text-button" type="button" data-action="view-resource" data-id="${escapeAttribute(resource.id)}">Apri ${icon("arrow-right")}</button></footer>
          </article>
        `;
      }).join("")
      : emptyState("Answer bank vuota", "Aggiungi risposte e materiali nella tabella answer_bank: saranno disponibili qui come libreria personale.");
  }

  function renderAnalytics() {
    const jobs = state.data.jobs;
    const applications = state.data.applications;
    const appliedJobs = new Set(jobs.filter((job) => ["APPLIED", "CONTACTED", "INTERVIEW", "OFFER", "CLOSED"].includes(jobStatus(job))).map((job) => String(job.id)));
    applications.forEach((application) => {
      const jobId = valueOf(application, "applications", "jobId", "");
      if (jobId) appliedJobs.add(String(jobId));
    });
    const interviews = jobs.filter((job) => jobStatus(job) === "INTERVIEW").length + applications.filter((app) => normalizeStatus(valueOf(app, "applications", "status", ""), "") === "INTERVIEW" && !getJobById(valueOf(app, "applications", "jobId", ""))).length;
    const offers = jobs.filter((job) => jobStatus(job) === "OFFER").length + applications.filter((app) => normalizeStatus(valueOf(app, "applications", "status", ""), "") === "OFFER" && !getJobById(valueOf(app, "applications", "jobId", ""))).length;
    const conversion = appliedJobs.size ? Math.round((offers / appliedJobs.size) * 100) : 0;
    const avgFit = jobs.length ? jobs.reduce((sum, job) => sum + jobFit(job), 0) / jobs.length : 0;
    $("analyticsKpis").innerHTML = `
      <article class="mini-kpi"><span>Fit medio</span><strong>${avgFit.toFixed(1)}</strong><small>/10</small></article>
      <article class="mini-kpi"><span>Application rate</span><strong>${jobs.length ? Math.round((appliedJobs.size / jobs.length) * 100) : 0}%</strong><small>${appliedJobs.size}/${jobs.length}</small></article>
      <article class="mini-kpi"><span>Offer conversion</span><strong>${conversion}%</strong><small>su application</small></article>
    `;
    const funnel = [
      ["Opportunità", jobs.length],
      ["Application", appliedJobs.size],
      ["Colloqui", interviews],
      ["Offerte", offers]
    ];
    const funnelMax = Math.max(1, ...funnel.map(([, count]) => count));
    $("funnelChart").innerHTML = funnel.map(([label, count]) => `
      <div class="funnel-row"><span>${label}</span><span class="chart-track"><i style="width:${Math.round((count / funnelMax) * 100)}%"></i></span><strong>${count}</strong></div>
    `).join("");

    const fitBuckets = [
      ["9–10", jobs.filter((job) => jobFit(job) >= 9).length],
      ["8–8.9", jobs.filter((job) => jobFit(job) >= 8 && jobFit(job) < 9).length],
      ["7–7.9", jobs.filter((job) => jobFit(job) >= 7 && jobFit(job) < 8).length],
      ["Sotto 7", jobs.filter((job) => jobFit(job) < 7).length]
    ];
    const bucketMax = Math.max(1, ...fitBuckets.map(([, count]) => count));
    $("fitChart").innerHTML = fitBuckets.map(([label, count]) => `
      <div class="bar-row"><span>${label}</span><span class="chart-track"><i style="width:${Math.round((count / bucketMax) * 100)}%"></i></span><strong>${count}</strong></div>
    `).join("");
  }

  function suggestedCopilotContent(job) {
    const preferences = currentPreferences();
    const company = companyNameForJob(job);
    const role = jobTitle(job);
    const roleMatches = preferences.roles.filter((target) => role.toLowerCase().includes(target.toLowerCase().split(" ")[0])).slice(0, 3);
    const location = valueOf(job, "jobs", "location", "");
    const source = valueOf(job, "jobs", "source", "");
    const fit = jobFit(job);
    const why = valueOf(job, "jobs", "whyFit", "") || `Fit ${fit.toFixed(1)}/10. Il ruolo ${role} è coerente con il posizionamento target${roleMatches.length ? ` (${roleMatches.join(", ")})` : ""}. Evidenzia risultati misurabili, capacità di lavorare tra strategia ed execution e impatto sul cliente.`;
    const gaps = valueOf(job, "jobs", "gaps", "") || "Verifica i requisiti tecnici e di settore non ancora coperti dal profilo. Prepara una risposta concreta su come colmare rapidamente gli eventuali gap con esperienze trasferibili e apprendimento mirato.";
    const angle = valueOf(job, "jobs", "angle", "") || `Posizionati come ponte tra obiettivi di business, bisogni del cliente e trasformazione operativa. Collega ogni affermazione a un risultato e mostra perché questo approccio è rilevante per ${company}.`;
    const motivation = motivationForJob(preferences, job);
    const evidence = relevantCvEvidence(preferences, job);
    const skills = toList(preferences.profileSkills).slice(0, 4);
    const competenceSentence = evidence
      ? `Nel mio percorso ho maturato esperienze particolarmente pertinenti: ${evidence}`
      : skills.length
        ? `Credo inoltre che il mio background in ${naturalList(skills)} sia coerente con le attività e le responsabilità previste dal ruolo.`
        : "Prima dell’invio, aggiungi qui una competenza o un risultato concreto pertinente al ruolo: [competenza o risultato dal CV].";
    const valuesAlignment = companyValuesAlignment(preferences, job);
    const note = `Buongiorno [Nome],\n\nspero non le dispiaccia se la contatto direttamente. Ho recentemente inviato la mia candidatura per la posizione di ${role} presso ${company} e desideravo presentarmi brevemente.\n\n${motivation}\n\n${competenceSentence}\n\n${valuesAlignment}\n\nSe avesse modo di valutare il mio profilo, sarei felice di approfondire il contributo che potrei portare al team.\n\nLa ringrazio per il tempo dedicato e le auguro una buona giornata.\n${valueOf(state.profile, "profiles", "name", "[Nome]") || "[Nome]"}`;
    return { why, gaps, angle, note };
  }

  function motivationForJob(preferences, job) {
    const haystack = `${jobTitle(job)} ${companyNameForJob(job)} ${valueOf(job, "jobs", "source", "")} ${jobDescriptionText(job)}`.toLowerCase();
    const entries = String(preferences.motivations || "").split(/\r?\n/).map((line) => {
      const separator = line.indexOf(":");
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
    }).filter((entry) => entry && entry[0] && entry[1]);
    const match = entries.find(([sector]) => haystack.includes(sector.toLowerCase()));
    return match?.[1] || roleBasedMotivation(job);
  }

  function roleBasedMotivation(job) {
    const role = jobTitle(job).toLowerCase();
    if (/customer success|client success/.test(role)) return "La posizione mi interessa perché unisce relazione con il cliente, comprensione dei suoi obiettivi e capacità di trasformare l’adozione del prodotto in risultati concreti.";
    if (/transformation|program(?:me)? manager/.test(role)) return "La posizione mi interessa per la possibilità di guidare iniziative di trasformazione complesse, allineando persone, priorità ed esecuzione verso risultati misurabili.";
    if (/product manager|product owner/.test(role)) return "La posizione mi interessa perché permette di collegare bisogni degli utenti, priorità di business ed esecuzione di prodotto.";
    if (/strategy|strategic/.test(role)) return "La posizione mi interessa per l’opportunità di trasformare analisi e priorità strategiche in decisioni e iniziative concrete.";
    if (/business analy|data analy|insight/.test(role)) return "La posizione mi interessa perché combina analisi, comprensione del business e capacità di tradurre i dati in decisioni operative.";
    return "La posizione ha attirato la mia attenzione per le responsabilità previste e per la possibilità di contribuire concretamente agli obiettivi del team.";
  }

  function relevantCvEvidence(preferences, job) {
    const cvText = String(preferences.profileCvText || "").trim();
    if (!cvText) return "";
    const contextWords = new Set(`${jobTitle(job)} ${jobDescriptionText(job)}`.toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []);
    const sentences = cvText.split(/(?<=[.!?])\s+|\r?\n+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 30);
    return sentences.map((sentence, index) => {
      const words = sentence.toLowerCase().match(/[a-zà-ÿ]{4,}/g) || [];
      return { sentence, index, score: words.reduce((total, word) => total + (contextWords.has(word) ? 1 : 0), 0) };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map((item) => item.sentence).join(" ");
  }

  function naturalList(items) {
    if (items.length < 2) return items[0] || "";
    return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
  }

  function companyValuesAlignment(preferences, job) {
    const company = companyNameForJob(job);
    const entries = String(preferences.companyValues || "").split(/\r?\n/).map((line) => {
      const separator = line.indexOf(":");
      if (separator < 1) return null;
      const name = line.slice(0, separator).trim();
      const [values, reason] = line.slice(separator + 1).split("|").map((part) => part?.trim());
      return name && values ? { name, values, reason } : null;
    }).filter(Boolean);
    const match = entries.find((entry) => company.toLowerCase().includes(entry.name.toLowerCase()) || entry.name.toLowerCase().includes(company.toLowerCase()));
    if (!match) return `Prima dell’invio, completa l’allineamento con i valori di ${company}: [valori aziendali verificati e perché ti rappresentano].`;
    if (!match.reason) return `Mi ritrovo nei valori di ${company}, in particolare ${match.values}. Prima dell’invio aggiungi una prova personale: [perché questi valori ti rappresentano].`;
    return `Mi ritrovo inoltre nei valori di ${company}, in particolare ${match.values}. ${match.reason}`;
  }

  function localCopilotDraftKey(jobId) {
    return `jobfinder:copilot-draft:${state.user?.id || "anonymous"}:${jobId}`;
  }

  function getLocalCopilotDraft(jobId) {
    try {
      return JSON.parse(window.localStorage.getItem(localCopilotDraftKey(jobId)) || "null") || {};
    } catch (_error) {
      return {};
    }
  }

  function saveLocalCopilotDraft(jobId, draft) {
    window.localStorage.setItem(localCopilotDraftKey(jobId), JSON.stringify(draft));
  }

  function clearLocalCopilotDraft(jobId) {
    window.localStorage.removeItem(localCopilotDraftKey(jobId));
  }

  function renderCopilot() {
    const job = getJobById(state.selectedJobId);
    const empty = $("copilotEmpty");
    const content = $("copilotContent");
    if (!job) {
      empty.classList.remove("is-hidden");
      content.classList.add("is-hidden");
      empty.innerHTML = emptyState("Seleziona un’opportunità", "Apri il Copilot da “Applica ora” o dalla pipeline per preparare una candidatura.", { route: "opportunities", label: "Vai alle opportunità", icon: "search" });
      return;
    }
    empty.classList.add("is-hidden");
    content.classList.remove("is-hidden");
    const application = getApplicationForJob(job.id);
    const localDraft = application ? {} : getLocalCopilotDraft(job.id);
    const suggestions = suggestedCopilotContent(job);
    const company = companyNameForJob(job);
    $("copilotCompanyLogo").innerHTML = companyLogoContent(job);
    $("copilotRole").textContent = jobTitle(job);
    $("copilotCompany").textContent = company;
    $("copilotFitScore").textContent = jobFit(job).toFixed(1);
    $("copilotPriority").textContent = titleCase(jobPriority(job));
    $("copilotStatus").textContent = jobStatus(job);
    $("copilotLocation").textContent = valueOf(job, "jobs", "location", "Non indicata");
    $("copilotRoleBrief").textContent = responsibilitySummary(job, 620);
    $("copilotWhyFit").value = valueOf(application, "applications", "whyFit", localDraft.whyFit || suggestions.why);
    $("copilotGaps").value = valueOf(application, "applications", "gaps", localDraft.gaps || suggestions.gaps);
    $("copilotAngle").value = valueOf(application, "applications", "angle", localDraft.angle || suggestions.angle);
    $("copilotCv").value = valueOf(application, "applications", "cvUsed", localDraft.cvUsed || valueOf(job, "jobs", "recommendedCv", ""));
    $("copilotPreparationStatus").value = valueOf(application, "applications", "preparationStatus", localDraft.preparationStatus || "draft");
    const savedRecruiterNote = valueOf(application, "applications", "recruiterNote", localDraft.recruiterNote || "");
    $("copilotRecruiterNote").value = resolvedRecruiterNote(savedRecruiterNote, suggestions.note);
    $("copilotCoverLetter").value = valueOf(application, "applications", "notes", localDraft.notes || suggestedCoverLetter(job));
    renderCopilotTemplateOptions();
    const saveState = $("copilotSaveState");
    saveState.textContent = application ? `Salvata · ${titleCase(valueOf(application, "applications", "preparationStatus", "draft"))}` : localDraft.savedAt ? "Bozza salvata su questo dispositivo" : "Nuova application";
    saveState.classList.toggle("status-pill--neutral", !application);
    $("prepareApplicationButton").innerHTML = application ? `${icon("check")}Aggiorna application` : `${icon("sparkles")}Prepara application`;
    $("copilotSaveForLaterButton").innerHTML = `${icon("clock")}${Boolean(valueOf(job, "jobs", "saved", false)) ? "Salvata per dopo" : "Applica più tardi"}`;
  }

  function isLegacyRecruiterNote(note) {
    const normalized = String(note || "").trim().toLowerCase();
    return normalized.startsWith("ciao [nome], ho visto la posizione")
      || normalized.includes("mi ha colpito l’opportunità di contribuire con un approccio che unisce strategia")
      || normalized.includes("desideravo presentarmi brevemente");
  }

  function resolvedRecruiterNote(savedNote, suggestedNote) {
    return !savedNote || isLegacyRecruiterNote(savedNote) ? suggestedNote : savedNote;
  }

  function renderCopilotTemplateOptions() {
    const select = $("copilotTemplateSelect");
    if (!select) return;
    const previous = select.value;
    const templates = [...state.data.answerBank].sort((a, b) => String(valueOf(a, "answerBank", "title", "")).localeCompare(String(valueOf(b, "answerBank", "title", "")), "it"));
    select.replaceChildren(new Option(templates.length ? "Seleziona dalla libreria" : "Nessun template disponibile", ""));
    templates.forEach((template) => {
      const category = valueOf(template, "answerBank", "category", "Template");
      select.add(new Option(`${category} · ${valueOf(template, "answerBank", "title", "Senza titolo")}`, template.id));
    });
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    select.disabled = templates.length === 0;
  }

  function filledCopilotTemplate() {
    const job = getJobById(state.selectedJobId);
    const templateId = $("copilotTemplateSelect")?.value;
    const template = state.data.answerBank.find((item) => String(item.id) === String(templateId));
    if (!job || !template) return null;
    const preferences = currentPreferences();
    const displayName = valueOf(state.profile, "profiles", "name", "").trim()
      || state.user?.user_metadata?.full_name
      || state.user?.email?.split("@")[0]
      || "[Nome]";
    const replacements = {
      nome: displayName,
      azienda: companyNameForJob(job),
      ruolo: jobTitle(job),
      location: valueOf(job, "jobs", "location", "[Location]"),
      "fit score": `${jobFit(job).toFixed(1)}/10`,
      competenze: preferences.roles.slice(0, 4).join(", ") || "[Competenze]"
    };
    const content = String(valueOf(template, "answerBank", "content", ""));
    return content.replace(/\[([^\]]+)\]/g, (match, key) => replacements[String(key).trim().toLowerCase()] || match);
  }

  function copilotTemplateTarget() {
    const targets = {
      recruiter: "copilotRecruiterNote",
      "cover-letter": "copilotCoverLetter",
      "why-fit": "copilotWhyFit",
      angle: "copilotAngle"
    };
    return $(targets[$("copilotTemplateTarget")?.value] || targets.recruiter);
  }

  function applyCopilotTemplate() {
    const filled = filledCopilotTemplate();
    const target = copilotTemplateTarget();
    if (!filled || !target) {
      showToast("Seleziona prima un template dalla libreria.", "warning", "Template non selezionato");
      return;
    }
    target.value = filled;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
    showToast("Template personalizzato e inserito. Controllalo prima di salvare.", "success", "Testo pronto");
  }

  async function copyFilledCopilotTemplate() {
    const filled = filledCopilotTemplate();
    if (!filled) {
      showToast("Seleziona prima un template dalla libreria.", "warning", "Template non selezionato");
      return;
    }
    try {
      await navigator.clipboard.writeText(filled);
      showToast("Template personalizzato copiato negli appunti.", "success", "Testo copiato");
    } catch (_error) {
      openDialog({ eyebrow: "TEMPLATE COMPILATO", title: "Copia il testo", body: `<textarea class="kit-preview" rows="16" readonly>${escapeHtml(filled)}</textarea><div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Chiudi</button></div>` });
    }
  }

  function bindStaticEvents() {
    $("loginForm")?.addEventListener("submit", handleLogin);
    $("googleLoginButton")?.addEventListener("click", handleGoogleLogin);
    $("showRecoveryButton")?.addEventListener("click", () => {
      $("loginPanel").classList.add("is-hidden");
      $("recoveryPanel").classList.remove("is-hidden");
      $("recoveryEmail").value = $("loginEmail").value;
      $("recoveryEmail").focus();
    });
    $("backToLoginButton")?.addEventListener("click", () => {
      $("recoveryPanel").classList.add("is-hidden");
      $("loginPanel").classList.remove("is-hidden");
      setFormStatus($("recoveryStatus"));
    });
    $("recoveryForm")?.addEventListener("submit", handleRecovery);
    $("updatePasswordForm")?.addEventListener("submit", handlePasswordUpdate);
    $("toggleLoginPassword")?.addEventListener("click", toggleLoginPassword);
    $("logoutButton")?.addEventListener("click", handleLogout);
    $("mobileMenuButton")?.addEventListener("click", openSidebar);
    $("closeSidebarButton")?.addEventListener("click", closeSidebar);
    $("sidebarBackdrop")?.addEventListener("click", closeSidebar);
    $("clearOpportunityFiltersButton")?.addEventListener("click", clearOpportunityFilters);
    [
      "opportunityFitFilter",
      "opportunityStatusFilter",
      "opportunityPriorityFilter",
      "opportunityCompanyFilter",
      "opportunityLocationFilter"
    ].forEach((id) => $(id)?.addEventListener("change", () => renderOpportunities({ preserveFilters: true })));
    $("preferenceMinFit")?.addEventListener("input", () => {
      $("preferenceMinFitOutput").textContent = asNumber($("preferenceMinFit").value, 7).toFixed(1);
    });
    $("preferencesForm")?.addEventListener("submit", savePreferences);
    $("copilotForm")?.addEventListener("submit", saveApplicationFromCopilot);
    $("closeDialogButton")?.addEventListener("click", closeDialog);
    $("appDialog")?.addEventListener("close", () => document.body.classList.remove("dialog-open"));
    $("appDialog")?.addEventListener("click", (event) => {
      if (event.target === $("appDialog")) closeDialog();
    });
    document.addEventListener("click", handleDelegatedClick);
    document.addEventListener("keydown", (event) => {
      const clickableOpportunity = event.target.closest?.(".top-opportunity--clickable, .opportunity-card--clickable");
      if (clickableOpportunity && event.target === clickableOpportunity && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        clickableOpportunity.click();
      }
    });
    document.addEventListener("submit", handleDelegatedSubmit);
    window.addEventListener("hashchange", () => {
      const route = window.location.hash.slice(1);
      if (PAGE_LABELS[route]) navigate(route, { updateHash: false });
    });
    window.addEventListener("error", (event) => {
      if (event.error) {
        console.error("JobFinder runtime error", event.error);
        showToast("Un componente ha riscontrato un errore, ma il resto della dashboard resta disponibile.", "error", "Errore inatteso");
      }
    });
    window.addEventListener("unhandledrejection", (event) => {
      console.error("JobFinder rejected promise", event.reason);
      showToast(humanizeError(event.reason, "l’operazione"), "error", "Operazione non completata");
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!state.client) {
      setFormStatus($("authStatus"), "Configura prima URL e publishable key in config.js.", "error");
      return;
    }
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    if (!email || !$("loginEmail").checkValidity()) {
      setFormStatus($("authStatus"), "Inserisci un indirizzo email valido.", "error");
      $("loginEmail").focus();
      return;
    }
    if (!password) {
      setFormStatus($("authStatus"), "Inserisci la password.", "error");
      $("loginPassword").focus();
      return;
    }
    setBusy($("loginButton"), true, "Accesso…");
    setFormStatus($("authStatus"), "Verifica delle credenziali…");
    try {
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error("Supabase non ha restituito una sessione valida.");
      setFormStatus($("authStatus"), "Accesso riuscito.", "success");
      await initializeSession(data.session);
    } catch (error) {
      setFormStatus($("authStatus"), humanizeError(error, "l’accesso"), "error");
    } finally {
      setBusy($("loginButton"), false);
    }
  }

  async function handleGoogleLogin() {
    if (!state.client) {
      setFormStatus($("authStatus"), "Configura prima Supabase in config.js.", "error");
      return;
    }
    setBusy($("googleLoginButton"), true, "Reindirizzamento…");
    setFormStatus($("authStatus"), "Apertura dell’accesso Google…");
    try {
      const { error } = await state.client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl() }
      });
      if (error) throw error;
    } catch (error) {
      setFormStatus($("authStatus"), humanizeError(error, "il login Google"), "error");
      setBusy($("googleLoginButton"), false);
    }
  }

  async function handleRecovery(event) {
    event.preventDefault();
    if (!state.client) {
      setFormStatus($("recoveryStatus"), "Configura prima Supabase in config.js.", "error");
      return;
    }
    const email = $("recoveryEmail").value.trim();
    if (!email || !$("recoveryEmail").checkValidity()) {
      setFormStatus($("recoveryStatus"), "Inserisci un indirizzo email valido.", "error");
      return;
    }
    setBusy($("recoveryButton"), true, "Invio…");
    try {
      const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
      if (error) throw error;
      setFormStatus($("recoveryStatus"), "Link inviato. Controlla anche spam e promozioni.", "success");
    } catch (error) {
      setFormStatus($("recoveryStatus"), humanizeError(error, "il recupero password"), "error");
    } finally {
      setBusy($("recoveryButton"), false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    if (!state.client) return;
    const password = $("newPassword").value;
    if (password.length < 8) {
      setFormStatus($("updatePasswordStatus"), "La password deve contenere almeno 8 caratteri.", "error");
      return;
    }
    setBusy($("updatePasswordButton"), true, "Salvataggio…");
    try {
      const { data, error } = await state.client.auth.updateUser({ password });
      if (error) throw error;
      setFormStatus($("updatePasswordStatus"), "Password aggiornata. Apertura della dashboard…", "success");
      const { data: sessionData } = await state.client.auth.getSession();
      if (sessionData.session) await initializeSession(sessionData.session);
      else if (data.user) {
        state.user = data.user;
        showApp();
      }
    } catch (error) {
      setFormStatus($("updatePasswordStatus"), humanizeError(error, "l’aggiornamento password"), "error");
    } finally {
      setBusy($("updatePasswordButton"), false);
    }
  }

  function toggleLoginPassword() {
    const input = $("loginPassword");
    const button = $("toggleLoginPassword");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-label", show ? "Nascondi password" : "Mostra password");
  }

  async function handleLogout() {
    if (state.demo) {
      resetAuthenticatedState();
      showAuth({ configMissing: !isSupabaseConfigured() });
      showToast("Sei uscita dalla modalità demo.", "success", "Logout completato");
      return;
    }
    if (!state.client) return;
    setBusy($("logoutButton"), true, "Uscita…");
    try {
      const { error } = await state.client.auth.signOut();
      if (error) throw error;
      resetAuthenticatedState();
      showAuth();
      showToast("Sessione chiusa in modo sicuro.", "success", "Logout completato");
    } catch (error) {
      showToast(humanizeError(error, "il logout"), "error", "Logout non riuscito");
    } finally {
      setBusy($("logoutButton"), false);
    }
  }

  function clearOpportunityFilters() {
    $("opportunityFitFilter").value = "0";
    $("opportunityStatusFilter").value = "";
    $("opportunityPriorityFilter").value = "";
    $("opportunityCompanyFilter").value = "";
    $("opportunityLocationFilter").value = "";
    renderOpportunities({ preserveFilters: true });
  }

  function handleDelegatedClick(event) {
    const routeTrigger = event.target.closest("[data-route]");
    if (routeTrigger) {
      event.preventDefault();
      navigate(routeTrigger.dataset.route);
      return;
    }
    const actionTrigger = event.target.closest("[data-action]");
    if (!actionTrigger) return;
    event.preventDefault();
    void runAction(actionTrigger);
  }

  async function runAction(trigger) {
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    try {
      switch (action) {
        case "refresh":
          await loadAllData();
          break;
        case "apply-now":
          await startApplication(id, trigger);
          break;
        case "open-copilot":
          openCopilot(id);
          break;
        case "remove-opportunity":
          openRemoveOpportunityDialog(id);
          break;
        case "toggle-save":
          await toggleSavedJob(id, trigger);
          break;
        case "save-for-later":
          await saveForLater(id || state.selectedJobId, trigger);
          break;
        case "mark-applied":
          await markAsApplied(id || state.selectedJobId, trigger);
          break;
        case "open-job":
          openJob(id || state.selectedJobId);
          break;
        case "open-url":
          openExternalUrl(trigger.dataset.url);
          break;
        case "find-contacts":
          openContactResearch(id || state.selectedJobId);
          break;
        case "copy-application-kit":
          await copyApplicationKit(id || state.selectedJobId);
          break;
        case "apply-copilot-template":
          applyCopilotTemplate();
          break;
        case "copy-filled-template":
          await copyFilledCopilotTemplate();
          break;
        case "feedback":
          await saveFeedback(id, trigger.dataset.feedback, trigger);
          break;
        case "clear-filters":
          clearOpportunityFilters();
          break;
        case "import-opportunity":
          openOpportunityImport();
          break;
        case "add-company":
          openCompanyForm();
          break;
        case "edit-company":
          openCompanyForm(getCompanyById(id));
          break;
        case "view-company":
          openCompanyDetails(getCompanyById(id));
          break;
        case "new-followup":
          openFollowupForm();
          break;
        case "followup-for-application":
          openFollowupForm(null, { applicationId: id });
          break;
        case "edit-followup":
          openFollowupForm(state.data.followups.find((item) => String(item.id) === String(id)));
          break;
        case "toggle-followup":
          await toggleFollowup(id, trigger);
          break;
        case "delete-followup":
          openDeleteFollowupConfirmation(id);
          break;
        case "application-status":
          openApplicationStatusForm(getApplicationById(id));
          break;
        case "application-note":
          openApplicationNoteForm(getApplicationById(id));
          break;
        case "view-resource":
          openResourceDetails(state.data.answerBank.find((item) => String(item.id) === String(id)));
          break;
        case "new-template":
          openTemplateForm();
          break;
        case "edit-template":
          openTemplateForm(state.data.answerBank.find((item) => String(item.id) === String(id)));
          break;
        case "copy-template":
          await copyTemplate(id);
          break;
        case "delete-template":
          openDeleteTemplateConfirmation(id);
          break;
        case "close-dialog":
          closeDialog();
          break;
        default:
          console.warn(`Azione non riconosciuta: ${action}`);
      }
    } catch (error) {
      showToast(humanizeError(error, `l’azione “${action}”`), "error", "Azione non completata");
    }
  }

  function handleDelegatedSubmit(event) {
    const form = event.target.closest("form[data-dialog-form]");
    if (!form) return;
    event.preventDefault();
    void submitDialogForm(form);
  }

  function openCopilot(jobId) {
    const job = getJobById(jobId);
    if (!job) {
      showToast("L’opportunità selezionata non è più disponibile.", "error", "Copilot non disponibile");
      return;
    }
    state.selectedJobId = String(job.id);
    window.sessionStorage.setItem("jobfinder:selected-job", state.selectedJobId);
    renderCopilot();
    navigate("copilot");
  }

  function openJob(jobId) {
    const job = getJobById(jobId);
    if (!job) {
      showToast("L’opportunità non è disponibile.", "error", "Annuncio non trovato");
      return;
    }
    const url = safeExternalUrl(valueOf(job, "jobs", "url", ""));
    if (!url) {
      showToast("Questa opportunità non contiene un URL valido. Aggiungilo nella colonna configurata come jobs.url.", "warning", "URL annuncio mancante");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openExternalUrl(rawUrl) {
    const url = safeExternalUrl(rawUrl);
    if (!url) {
      showToast("Il link non è valido o usa un protocollo non consentito.", "warning", "Link non disponibile");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function toggleSavedJob(jobId, button) {
    const job = getJobById(jobId);
    if (!job) return;
    const next = !Boolean(valueOf(job, "jobs", "saved", false));
    setBusy(button, true, "");
    try {
      await updateRecord("jobs", job.id, { [fieldName("jobs", "saved")]: next });
      renderDashboard();
      renderOpportunities({ preserveFilters: true });
      showToast(next ? "Opportunità aggiunta ai salvati." : "Opportunità rimossa dai salvati.", "success", "Salvataggio aggiornato");
    } catch (error) {
      showToast(humanizeError(error, "il salvataggio dell’opportunità"), "error", "Impossibile salvare");
    } finally {
      setBusy(button, false);
    }
  }

  function renderTemplates() {
    const templates = [...state.data.answerBank].sort((a, b) => String(valueOf(a, "answerBank", "title", "")).localeCompare(String(valueOf(b, "answerBank", "title", "")), "it"));
    $("templatesList").innerHTML = templates.length
      ? templates.map((template) => {
        const content = valueOf(template, "answerBank", "content", "");
        return `
          <article class="resource-card template-card">
            <div>
              <span class="resource-icon">${icon("copy")}</span>
              <span class="badge badge--blue">${escapeHtml(valueOf(template, "answerBank", "category", "Messaggio"))}</span>
              <h3>${escapeHtml(valueOf(template, "answerBank", "title", "Template"))}</h3>
              <p>${escapeHtml(content ? `${content.slice(0, 210)}${content.length > 210 ? "…" : ""}` : "Contenuto non disponibile.")}</p>
            </div>
            <footer class="template-actions">
              <button class="button button--primary" type="button" data-action="copy-template" data-id="${escapeAttribute(template.id)}">${icon("copy")}Copia</button>
              <button class="icon-button" type="button" data-action="edit-template" data-id="${escapeAttribute(template.id)}" aria-label="Modifica template" title="Modifica">${icon("edit")}</button>
              <button class="icon-button" type="button" data-action="delete-template" data-id="${escapeAttribute(template.id)}" aria-label="Elimina template" title="Elimina">${icon("trash")}</button>
            </footer>
          </article>`;
      }).join("")
      : emptyState("Nessun template", "Salva qui messaggi recruiter, risposte frequenti, follow-up e cover letter da riutilizzare.", { name: "new-template", label: "Crea il primo template", icon: "plus" });
  }

  function openOpportunityImport() {
    openDialog({
      eyebrow: "DISCOVER & PRIORITIZE",
      title: "Importa e valuta un annuncio",
      body: `
        <p class="dialog-copy">Incolla il link e il testo dell’annuncio. JobFinder evita duplicati, calcola il fit sulle tue preferenze e prepara subito la candidatura. Per LinkedIn usa il testo dell’annuncio o un alert email: non viene eseguito scraping automatico.</p>
        <form class="form-stack" data-dialog-form="opportunity-import" novalidate>
          <label class="field"><span>URL annuncio</span><input name="url" type="url" required placeholder="https://azienda.com/jobs/…" /></label>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Ruolo</span><input name="title" required placeholder="Customer Success Manager" /></label>
            <label class="field"><span>Azienda</span><input name="company" required placeholder="Nome azienda" /></label>
          </div>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Località / modalità</span><input name="location" placeholder="Milano · Hybrid" /></label>
            <label class="field"><span>Fonte</span><select name="source"><option>Career site</option><option>LinkedIn alert</option><option>LinkedIn Easy Apply</option><option>Lever</option><option>Greenhouse</option><option>Altro</option></select></label>
          </div>
          <label class="field"><span>Testo dell’annuncio</span><textarea name="description" rows="12" required placeholder="Incolla responsabilità, requisiti e informazioni sulla posizione…"></textarea></label>
          <div class="notice notice--info"><strong>Ranking trasparente</strong><span>Il punteggio usa ruolo, settore, località e modalità di lavoro salvati in Preferenze. Potrai correggerlo dal database senza perdere i contenuti generati.</span></div>
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--primary" type="submit">${icon("sparkles")}Analizza e importa</button></div>
        </form>`
    });
  }

  function contactResearchLinks(job) {
    const company = companyNameForJob(job);
    const role = jobTitle(job);
    const peopleQuery = encodeURIComponent(`${company} recruiter talent acquisition ${role}`);
    const linkedinQuery = encodeURIComponent(`${company} recruiter`);
    return [
      ["Cerca recruiter su LinkedIn", `https://www.linkedin.com/search/results/people/?keywords=${linkedinQuery}`],
      ["Cerca contatti pubblici", `https://www.google.com/search?q=${peopleQuery}`],
      ["Cerca profili LinkedIn indicizzati", `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in ${company} talent acquisition recruiter`)}`]
    ];
  }

  function openContactResearch(jobId) {
    const job = getJobById(jobId);
    if (!job) return;
    const companyId = valueOf(job, "jobs", "companyId", "");
    const knownContacts = companyId ? state.data.contacts.filter((contact) => String(valueOf(contact, "contacts", "companyId", "")) === String(companyId)) : [];
    openDialog({
      eyebrow: "CONTACT RESEARCH",
      title: `Chi contattare in ${companyNameForJob(job)}`,
      body: `
        <p class="dialog-copy">JobFinder prepara ricerche mirate e raccoglie i contatti già salvati. Non inventa nomi e non effettua scraping dei profili.</p>
        ${knownContacts.length ? `<div class="contact-results"><strong>Contatti già nel database</strong>${knownContacts.map((contact) => `<div class="contact-result"><span><b>${escapeHtml(valueOf(contact, "contacts", "name", "Contatto"))}</b><small>${escapeHtml(valueOf(contact, "contacts", "role", "Ruolo non indicato"))}</small></span><span>${escapeHtml(valueOf(contact, "contacts", "email", ""))}</span></div>`).join("")}</div>` : `<div class="notice notice--info"><strong>Nessun contatto salvato</strong><span>Usa una ricerca mirata e aggiungi poi il contatto alla tabella contacts.</span></div>`}
        <div class="research-actions">${contactResearchLinks(job).map(([label, url]) => `<button class="button button--secondary" type="button" data-action="open-url" data-url="${escapeAttribute(url)}">${icon("external")}${escapeHtml(label)}</button>`).join("")}</div>
        <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Chiudi</button><button class="button button--primary" type="button" data-action="open-copilot" data-id="${escapeAttribute(job.id)}">Prepara messaggio recruiter</button></div>`
    });
  }

  function applicationKitText(job) {
    const application = getApplicationForJob(job.id);
    const suggestions = suggestedCopilotContent(job);
    return [
      `RUOLO: ${jobTitle(job)}`,
      `AZIENDA: ${companyNameForJob(job)}`,
      `ANNUNCIO: ${valueOf(job, "jobs", "url", "") || "Non disponibile"}`,
      "",
      `WHY YOU FIT\n${valueOf(application, "applications", "whyFit", suggestions.why)}`,
      "",
      `GAP DA GESTIRE\n${valueOf(application, "applications", "gaps", suggestions.gaps)}`,
      "",
      `ANGLE\n${valueOf(application, "applications", "angle", suggestions.angle)}`,
      "",
      `MESSAGGIO RECRUITER\n${resolvedRecruiterNote(valueOf(application, "applications", "recruiterNote", ""), suggestions.note)}`,
      "",
      `COVER LETTER\n${valueOf(application, "applications", "notes", suggestedCoverLetter(job))}`,
      "",
      `CV: ${valueOf(application, "applications", "cvUsed", valueOf(job, "jobs", "recommendedCv", "Da scegliere"))}`
    ].join("\n");
  }

  async function copyApplicationKit(jobId) {
    const job = getJobById(jobId);
    if (!job) return;
    try {
      await navigator.clipboard.writeText(applicationKitText(job));
      showToast("Kit candidatura copiato: puoi incollarlo nel form dell’azienda o nei tuoi appunti.", "success", "Application kit pronto");
    } catch (_error) {
      openDialog({ eyebrow: "APPLICATION KIT", title: `${jobTitle(job)} · ${companyNameForJob(job)}`, body: `<textarea class="kit-preview" rows="18" readonly>${escapeHtml(applicationKitText(job))}</textarea><div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Chiudi</button></div>` });
    }
  }

  function recordPatch(entity, record, keys) {
    return Object.fromEntries(keys.map((key) => [fieldName(entity, key), valueOf(record, entity, key, null)]));
  }

  async function saveForLater(jobId, button) {
    const job = getJobById(jobId);
    if (!job || !ensureWritable()) return;
    const actionKey = String(job.id);
    if (state.pendingJobActions.has(actionKey)) return;
    state.pendingJobActions.add(actionKey);
    const previousJob = recordPatch("jobs", job, ["saved", "status"]);
    const jobPatch = { [fieldName("jobs", "saved")]: true };
    if (["NEW", "REVIEW"].includes(jobStatus(job))) jobPatch[fieldName("jobs", "status")] = "APPLY";
    setBusy(button, true, "Salvataggio…");
    let jobUpdated = false;
    try {
      await updateRecord("jobs", job.id, jobPatch);
      jobUpdated = true;
      renderAll();
      showToast("Salvata per applicare più tardi", "success", "Opportunità salvata");
    } catch (error) {
      if (jobUpdated) {
        try { await updateRecord("jobs", job.id, previousJob); } catch (_rollbackError) { await loadAllData({ quiet: true }); }
      }
      throw error;
    } finally {
      state.pendingJobActions.delete(actionKey);
      setBusy(button, false);
    }
  }

  async function startApplication(jobId, button) {
    const job = getJobById(jobId);
    if (!job || !ensureWritable()) return;
    const actionKey = String(job.id);
    if (state.pendingJobActions.has(actionKey)) return;
    state.pendingJobActions.add(actionKey);
    setBusy(button, true, "Apertura…");
    try {
      await updateRecord("jobs", job.id, {
        [fieldName("jobs", "status")]: "APPLY",
        [fieldName("jobs", "saved")]: false
      });
      renderAll();
      openCopilot(job.id);
      showToast("Scelta salvata: le altre opzioni sono state nascoste.", "success", "Candidatura in preparazione");
    } finally {
      state.pendingJobActions.delete(actionKey);
      setBusy(button, false);
    }
  }

  function openRemoveOpportunityDialog(jobId) {
    const job = getJobById(jobId);
    if (!job) return;
    openDialog({
      eyebrow: "RIMUOVI OPPORTUNITÀ",
      title: `Rimuovere ${jobTitle(job)}?`,
      body: `<p class="dialog-copy">L’opportunità sparirà dalla dashboard e dalla lista. Lo storico rimarrà nel database.</p>
        <form data-dialog-form="remove-opportunity" data-record-id="${escapeAttribute(job.id)}"><div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--danger" type="submit">${icon("trash")}Cancella</button></div></form>`
    });
  }

  async function submitRemoveOpportunity(form) {
    const jobId = form.dataset.recordId;
    await updateRecord("jobs", jobId, {
      [fieldName("jobs", "status")]: "CLOSED",
      [fieldName("jobs", "saved")]: false
    });
    closeDialog();
    renderAll();
    showToast("L’opportunità è stata rimossa dalla dashboard.", "success", "Opportunità cancellata");
  }

  function appliedApplicationPayload(job, application) {
    const payload = {};
    const localDraft = application ? {} : getLocalCopilotDraft(job.id);
    setMapped(payload, "applications", "jobId", job.id);
    setMapped(payload, "applications", "companyId", valueOf(job, "jobs", "companyId", null));
    setMapped(payload, "applications", "status", "APPLIED");
    setMapped(payload, "applications", "progress", 100);
    setMapped(payload, "applications", "preparationStatus", "submitted");
    if (!application && Object.keys(localDraft).length) {
      setMapped(payload, "applications", "cvUsed", localDraft.cvUsed || null);
      setMapped(payload, "applications", "whyFit", localDraft.whyFit || null);
      setMapped(payload, "applications", "gaps", localDraft.gaps || null);
      setMapped(payload, "applications", "angle", localDraft.angle || null);
      setMapped(payload, "applications", "recruiterNote", localDraft.recruiterNote || null);
      setMapped(payload, "applications", "notes", localDraft.notes || null);
    }
    if (!valueOf(application, "applications", "appliedAt", "")) setMapped(payload, "applications", "appliedAt", new Date().toISOString());
    return payload;
  }

  async function markAsApplied(jobId, button) {
    const job = getJobById(jobId);
    if (!job || !ensureWritable()) return;
    const actionKey = String(job.id);
    if (state.pendingJobActions.has(actionKey)) return;
    state.pendingJobActions.add(actionKey);
    const existingApplication = getApplicationForJob(job.id);
    const previousApplication = existingApplication ? recordPatch("applications", existingApplication, ["status", "progress", "appliedAt", "preparationStatus"]) : null;
    setBusy(button, true, "Registrazione…");
    let savedApplication = null;
    try {
      try {
        savedApplication = existingApplication
          ? await updateRecord("applications", existingApplication.id, appliedApplicationPayload(job, existingApplication))
          : await insertRecord("applications", appliedApplicationPayload(job, null));
      } catch (applicationError) {
        if (existingApplication) throw applicationError;
        await updateRecord("jobs", job.id, { [fieldName("jobs", "status")]: "APPLIED" });
        renderAll();
        showToast(`Il job è registrato come APPLIED, ma il record application non è stato creato: ${humanizeError(applicationError, "la creazione dell’application")}`, "warning", "Candidatura da completare");
        return;
      }
      try {
        await updateRecord("jobs", job.id, { [fieldName("jobs", "status")]: "APPLIED" });
      } catch (jobError) {
        try {
          if (existingApplication) await updateRecord("applications", existingApplication.id, previousApplication);
          else if (savedApplication) await deleteRecord("applications", savedApplication.id);
        } catch (_rollbackError) {
          await loadAllData({ quiet: true });
        }
        throw jobError;
      }
      renderAll();
      clearLocalCopilotDraft(job.id);
      showToast("Candidatura registrata come inviata", "success", "Application aggiornata");
      openFollowupPrompt(savedApplication);
    } finally {
      state.pendingJobActions.delete(actionKey);
      setBusy(button, false);
    }
  }

  function openFollowupPrompt(application) {
    openDialog({
      eyebrow: "PROSSIMO PASSO",
      title: "Vuoi impostare un follow-up?",
      body: `<p class="dialog-copy">Puoi pianificare un promemoria senza creare nulla automaticamente.</p>
        <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Non ora</button><button class="button button--primary" type="button" data-action="followup-for-application" data-id="${escapeAttribute(application.id)}">${icon("clock")}Crea follow-up</button></div>`
    });
  }

  async function saveFeedback(jobId, feedbackValue, button) {
    const job = getJobById(jobId);
    const normalized = normalizeStatus(feedbackValue, "");
    if (!job || !["LIKE", "DISLIKE", "PASS"].includes(normalized)) return;
    if (!ensureWritable()) return;
    setBusy(button, true, "");
    const existing = feedbackForJob(job.id);
    const payload = {};
    setMapped(payload, "feedback", "jobId", job.id);
    setMapped(payload, "feedback", "value", normalized);
    try {
      if (existing) await updateRecord("feedback", existing.id, payload);
      else await insertRecord("feedback", payload);
      renderDashboard();
      renderOpportunities({ preserveFilters: true });
      renderFeedback();
      showToast(`${normalized} registrato. Le preferenze manuali non sono state modificate.`, "success", "Feedback salvato");
    } catch (error) {
      showToast(humanizeError(error, "il feedback"), "error", "Feedback non salvato");
    } finally {
      setBusy(button, false);
    }
  }

  async function saveApplicationFromCopilot(event) {
    event.preventDefault();
    const job = getJobById(state.selectedJobId);
    if (!job) {
      showToast("Seleziona prima un’opportunità.", "warning", "Application Copilot");
      return;
    }
    if (!ensureWritable()) return;
    const application = getApplicationForJob(job.id);
    const preparationStatus = $("copilotPreparationStatus").value;
    const progress = { draft: 20, in_progress: 55, ready: 85, submitted: 100 }[preparationStatus] || 20;
    const payload = {};
    setMapped(payload, "applications", "jobId", job.id);
    setMapped(payload, "applications", "companyId", valueOf(job, "jobs", "companyId", null));
    const currentApplicationStatus = normalizeStatus(valueOf(application, "applications", "status", "DRAFT"), "DRAFT");
    const preservedStatus = ["APPLIED", "CONTACTED", "INTERVIEW", "OFFER", "CLOSED"].includes(currentApplicationStatus)
      ? currentApplicationStatus
      : "DRAFT";
    setMapped(payload, "applications", "status", preparationStatus === "submitted" ? "APPLIED" : preservedStatus);
    setMapped(payload, "applications", "cvUsed", $("copilotCv").value || null);
    setMapped(payload, "applications", "progress", progress);
    setMapped(payload, "applications", "whyFit", $("copilotWhyFit").value.trim());
    setMapped(payload, "applications", "gaps", $("copilotGaps").value.trim());
    setMapped(payload, "applications", "angle", $("copilotAngle").value.trim());
    setMapped(payload, "applications", "recruiterNote", $("copilotRecruiterNote").value.trim());
    setMapped(payload, "applications", "notes", $("copilotCoverLetter").value.trim());
    setMapped(payload, "applications", "preparationStatus", preparationStatus);
    if (preparationStatus === "submitted" && !valueOf(application, "applications", "appliedAt", "")) {
      setMapped(payload, "applications", "appliedAt", new Date().toISOString());
    }

    setBusy($("prepareApplicationButton"), true, application ? "Aggiornamento…" : "Preparazione…");
    try {
      if (!application && preparationStatus !== "submitted") {
        saveLocalCopilotDraft(job.id, {
          cvUsed: $("copilotCv").value || "",
          whyFit: $("copilotWhyFit").value.trim(),
          gaps: $("copilotGaps").value.trim(),
          angle: $("copilotAngle").value.trim(),
          recruiterNote: $("copilotRecruiterNote").value.trim(),
          notes: $("copilotCoverLetter").value.trim(),
          preparationStatus,
          savedAt: new Date().toISOString()
        });
      } else if (application) {
        await updateRecord("applications", application.id, payload);
      } else {
        await insertRecord("applications", payload);
        clearLocalCopilotDraft(job.id);
      }

      const currentJobStatus = jobStatus(job);
      const desiredJobStatus = preparationStatus === "submitted" ? "APPLIED" : ["NEW", "REVIEW"].includes(currentJobStatus) ? "APPLY" : currentJobStatus;
      if (desiredJobStatus !== currentJobStatus) {
        try {
          await updateRecord("jobs", job.id, { [fieldName("jobs", "status")]: desiredJobStatus });
        } catch (jobError) {
          showToast(`Application salvata, ma lo stato del job non è stato aggiornato: ${humanizeError(jobError)}`, "warning", "Salvataggio parziale");
        }
      }
      renderAll();
      const locallySaved = !application && preparationStatus !== "submitted";
      showToast(locallySaved ? "Bozza salvata su questo dispositivo. Il record application verrà creato solo quando la segni come inviata." : application ? "Application aggiornata su Supabase." : "Application inviata e creata su Supabase.", "success", "Preparazione salvata");
    } catch (error) {
      showToast(humanizeError(error, "la preparazione dell’application"), "error", "Application non salvata");
    } finally {
      setBusy($("prepareApplicationButton"), false);
    }
  }

  async function savePreferences(event) {
    event.preventDefault();
    if (!ensureWritable()) return;
    const personalization = {
      motivations: $("preferenceMotivations").value.trim(),
      profileSkills: $("preferenceProfileSkills").value.trim(),
      profileCvText: $("preferenceCvText").value.trim(),
      companyValues: $("preferenceCompanyValues").value.trim()
    };
    try {
      saveLocalPersonalization(personalization);
    } catch (error) {
      showToast("Il browser non consente il salvataggio locale della personalizzazione.", "error", "Personalizzazione non salvata");
      return;
    }
    const payload = {};
    setMapped(payload, "preferences", "roles", toList($("preferenceRoles").value));
    setMapped(payload, "preferences", "sectors", toList($("preferenceSectors").value));
    setMapped(payload, "preferences", "locations", toList($("preferenceLocations").value));
    setMapped(payload, "preferences", "workModes", toList($("preferenceWorkModes").value));
    setMapped(payload, "preferences", "minFit", asNumber($("preferenceMinFit").value, 7));
    setMapped(payload, "preferences", "aiLearning", $("preferenceAiLearning").checked);
    const existing = state.data.preferences[0] || null;
    setBusy($("savePreferencesButton"), true, "Salvataggio…");
    try {
      if (!state.optionalErrors.preferences) {
        if (existing) await updateRecord("preferences", existing.id, payload);
        else await insertRecord("preferences", payload);
      }
      renderPreferences();
      showToast(state.optionalErrors.preferences ? "Motivazioni e competenze salvate su questo dispositivo." : "Preferenze e personalizzazione salvate.", "success", "Preferenze aggiornate");
    } catch (error) {
      showToast(humanizeError(error, "il salvataggio delle preferenze"), "error", "Preferenze non salvate");
    } finally {
      setBusy($("savePreferencesButton"), false);
    }
  }

  async function toggleFollowup(followupId, button) {
    const followup = state.data.followups.find((item) => String(item.id) === String(followupId));
    if (!followup) return;
    const next = !Boolean(valueOf(followup, "followups", "completed", false));
    setBusy(button, true, "");
    try {
      await updateRecord("followups", followup.id, { [fieldName("followups", "completed")]: next });
      renderDashboard();
      renderFollowups();
      updateNavigationCounts();
      showToast(next ? "Follow-up completato." : "Follow-up riaperto.", "success", "Follow-up aggiornato");
    } catch (error) {
      showToast(humanizeError(error, "il follow-up"), "error", "Follow-up non aggiornato");
    } finally {
      setBusy(button, false);
    }
  }

  function openDialog({ eyebrow = "JOBFINDER", title, body }) {
    const dialog = $("appDialog");
    if (dialog.open) dialog.close();
    $("dialogEyebrow").textContent = eyebrow;
    $("dialogTitle").textContent = title;
    $("dialogBody").innerHTML = body;
    document.body.classList.add("dialog-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    window.setTimeout(() => $("dialogBody").querySelector("input, select, textarea, button")?.focus(), 30);
  }

  function closeDialog() {
    const dialog = $("appDialog");
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("dialog-open");
  }

  function optionMarkup(value, label, selectedValue) {
    return `<option value="${escapeAttribute(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function openCompanyForm(company = null) {
    const isEdit = Boolean(company);
    openDialog({
      eyebrow: isEdit ? "MODIFICA TARGET" : "NUOVO TARGET",
      title: isEdit ? "Modifica azienda" : "Aggiungi azienda",
      body: `
        <form class="form-stack" data-dialog-form="company" data-record-id="${company ? escapeAttribute(company.id) : ""}" novalidate>
          <label class="field"><span>Nome *</span><input name="name" required maxlength="160" value="${escapeAttribute(valueOf(company, "companies", "name", ""))}" placeholder="Nome azienda" /></label>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Settore</span><input name="sector" maxlength="120" value="${escapeAttribute(valueOf(company, "companies", "sector", ""))}" placeholder="Tech, Automotive…" /></label>
            <label class="field"><span>Tier</span><select name="tier">${["A", "B", "C"].map((tier) => optionMarkup(tier, `Tier ${tier}`, valueOf(company, "companies", "tier", "B"))).join("")}</select></label>
          </div>
          <label class="field"><span>Website</span><input name="website" inputmode="url" value="${escapeAttribute(valueOf(company, "companies", "website", ""))}" placeholder="https://azienda.com" /></label>
          <label class="field"><span>Note</span><textarea name="notes" rows="5" placeholder="Perché è un target, persone da contattare, segnali da monitorare…">${escapeHtml(valueOf(company, "companies", "notes", ""))}</textarea></label>
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--primary" type="submit">${icon("check")}${isEdit ? "Salva modifiche" : "Aggiungi azienda"}</button></div>
        </form>
      `
    });
  }

  function openCompanyDetails(company) {
    if (!company) {
      showToast("L’azienda selezionata non è disponibile.", "error", "Azienda non trovata");
      return;
    }
    const name = valueOf(company, "companies", "name", "Azienda");
    const associatedJobs = state.data.jobs.filter((job) => String(valueOf(job, "jobs", "companyId", "")) === String(company.id) || companyNameForJob(job) === name);
    const website = safeExternalUrl(valueOf(company, "companies", "website", ""));
    openDialog({
      eyebrow: "AZIENDA TARGET",
      title: name,
      body: `
        <dl class="dialog-details">
          <div><dt>Settore</dt><dd>${escapeHtml(valueOf(company, "companies", "sector", "Non indicato"))}</dd></div>
          <div><dt>Tier</dt><dd>${escapeHtml(valueOf(company, "companies", "tier", "C"))}</dd></div>
          <div><dt>Website</dt><dd>${website ? `<button class="text-button" type="button" data-action="open-url" data-url="${escapeAttribute(website)}">${escapeHtml(website)} ${icon("external")}</button>` : "Non indicato"}</dd></div>
          <div><dt>Note</dt><dd>${escapeHtml(valueOf(company, "companies", "notes", "Nessuna nota."))}</dd></div>
          <div><dt>Opportunità</dt><dd>${associatedJobs.length ? associatedJobs.map((job) => `<button class="text-button dialog-job-link" type="button" data-action="open-copilot" data-id="${escapeAttribute(job.id)}">${escapeHtml(jobTitle(job))} · ${jobFit(job).toFixed(1)}/10 ${icon("arrow-right")}</button>`).join("") : "Nessuna opportunità associata."}</dd></div>
        </dl>
        <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Chiudi</button><button class="button button--primary" type="button" data-action="edit-company" data-id="${escapeAttribute(company.id)}">${icon("edit")}Modifica azienda</button></div>
      `
    });
  }

  function openFollowupForm(followup = null, defaults = {}) {
    const isEdit = Boolean(followup);
    const defaultApplicationId = defaults.applicationId || valueOf(followup, "followups", "applicationId", "");
    const defaultApplication = getApplicationById(defaultApplicationId);
    const defaultJobId = valueOf(followup, "followups", "jobId", "") || (defaultApplication ? valueOf(defaultApplication, "applications", "jobId", "") : "");
    const defaultDate = valueOf(followup, "followups", "dueDate", "");
    openDialog({
      eyebrow: isEdit ? "AGGIORNA AZIONE" : "STAY ON TRACK",
      title: isEdit ? "Modifica follow-up" : "Nuovo follow-up",
      body: `
        <form class="form-stack" data-dialog-form="followup" data-record-id="${followup ? escapeAttribute(followup.id) : ""}" novalidate>
          <label class="field"><span>Azione *</span><input name="action" required maxlength="220" value="${escapeAttribute(valueOf(followup, "followups", "action", ""))}" placeholder="Es. Scrivere al recruiter" /></label>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Job collegato</span><select name="job_id"><option value="">Nessun job</option>${state.data.jobs.map((job) => optionMarkup(job.id, `${jobTitle(job)} · ${companyNameForJob(job)}`, defaultJobId)).join("")}</select></label>
            <label class="field"><span>Application collegata</span><select name="application_id"><option value="">Nessuna application</option>${state.data.applications.map((application) => {
              const job = getJobById(valueOf(application, "applications", "jobId", ""));
              return optionMarkup(application.id, `${job ? jobTitle(job) : "Application"} · ${companyNameForApplication(application)}`, defaultApplicationId);
            }).join("")}</select></label>
            <label class="field"><span>Contatto</span><select name="contact_id"><option value="">Nessun contatto</option>${state.data.contacts.map((contact) => optionMarkup(contact.id, `${valueOf(contact, "contacts", "name", "Contatto")} · ${valueOf(contact, "contacts", "role", valueOf(contact, "contacts", "email", ""))}`, valueOf(followup, "followups", "contactId", ""))).join("")}</select></label>
            <label class="field"><span>Nome contatto (facoltativo)</span><input name="contact_name" maxlength="160" value="${escapeAttribute(valueOf(followup, "followups", "contactName", ""))}" placeholder="Se non è nella rubrica" /></label>
            <label class="field"><span>Scadenza *</span><input name="due_date" type="date" required value="${escapeAttribute(defaultDate ? String(defaultDate).slice(0, 10) : todayIso())}" /></label>
            <label class="switch-control"><span><strong>Completato</strong><small>Puoi riaprirlo anche in seguito.</small></span><input name="completed" type="checkbox" ${Boolean(valueOf(followup, "followups", "completed", false)) ? "checked" : ""} /><i></i></label>
          </div>
          <label class="field"><span>Note</span><textarea name="notes" rows="4" placeholder="Contesto, messaggio da inviare, prossimo passo…">${escapeHtml(valueOf(followup, "followups", "notes", ""))}</textarea></label>
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--primary" type="submit">${icon("check")}${isEdit ? "Salva modifiche" : "Crea follow-up"}</button></div>
        </form>
      `
    });
  }

  function openDeleteFollowupConfirmation(followupId) {
    const followup = state.data.followups.find((item) => String(item.id) === String(followupId));
    if (!followup) return;
    openDialog({
      eyebrow: "CONFERMA ELIMINAZIONE",
      title: "Eliminare questo follow-up?",
      body: `
        <p class="dialog-copy">L’azione “${escapeHtml(valueOf(followup, "followups", "action", "Follow-up"))}” verrà eliminata da Supabase. Questa operazione non modifica job o application collegati.</p>
        <form data-dialog-form="delete-followup" data-record-id="${escapeAttribute(followup.id)}">
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--danger" type="submit">${icon("trash")}Elimina</button></div>
        </form>
      `
    });
  }

  function openApplicationStatusForm(application) {
    if (!application) return;
    const current = normalizeStatus(valueOf(application, "applications", "status", "DRAFT"), "DRAFT");
    const choices = ["DRAFT", "APPLIED", "CONTACTED", "INTERVIEW", "OFFER", "CLOSED"];
    openDialog({
      eyebrow: "AGGIORNA APPLICATION",
      title: "Cambia stato",
      body: `
        <form class="form-stack" data-dialog-form="application-status" data-record-id="${escapeAttribute(application.id)}">
          <label class="field"><span>Nuovo stato</span><select name="status">${choices.map((status) => optionMarkup(status, titleCase(status), current)).join("")}</select></label>
          <label class="switch-control"><span><strong>Sincronizza la pipeline</strong><small>Aggiorna anche lo stato del job collegato, se compatibile.</small></span><input name="sync_job" type="checkbox" checked /><i></i></label>
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--primary" type="submit">${icon("check")}Aggiorna stato</button></div>
        </form>
      `
    });
  }

  function openApplicationNoteForm(application) {
    if (!application) return;
    openDialog({
      eyebrow: "CONTESTO APPLICATION",
      title: "Aggiungi una nota",
      body: `
        <form class="form-stack" data-dialog-form="application-note" data-record-id="${escapeAttribute(application.id)}">
          <label class="field"><span>Note</span><textarea name="notes" rows="8" placeholder="Aggiornamenti, persone contattate, informazioni utili…">${escapeHtml(valueOf(application, "applications", "notes", ""))}</textarea></label>
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--primary" type="submit">${icon("check")}Salva nota</button></div>
        </form>
      `
    });
  }

  function openResourceDetails(resource) {
    if (!resource) return;
    openDialog({
      eyebrow: valueOf(resource, "answerBank", "category", "ANSWER BANK"),
      title: valueOf(resource, "answerBank", "title", "Risorsa"),
      body: `
        <div class="resource-content">${escapeHtml(valueOf(resource, "answerBank", "content", "Contenuto non disponibile.")).replaceAll("\n", "<br>")}</div>
        <div class="form-actions"><span class="muted">${valueOf(resource, "answerBank", "updatedAt", "") ? `Aggiornata ${escapeHtml(formatDateTime(valueOf(resource, "answerBank", "updatedAt", "")))}` : ""}</span><button class="button button--secondary" type="button" data-action="close-dialog">Chiudi</button></div>
      `
    });
  }

  async function submitDialogForm(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const type = form.dataset.dialogForm;
    const submitButton = form.querySelector('button[type="submit"]');
    setBusy(submitButton, true, "Salvataggio…");
    try {
      switch (type) {
        case "company":
          await submitCompanyForm(form);
          break;
        case "opportunity-import":
          await submitOpportunityImport(form);
          break;
        case "template":
          await submitTemplateForm(form);
          break;
        case "followup":
          await submitFollowupForm(form);
          break;
        case "application-status":
          await submitApplicationStatusForm(form);
          break;
        case "application-note":
          await submitApplicationNoteForm(form);
          break;
        case "delete-followup":
          await submitDeleteFollowup(form);
          break;
        case "delete-template":
          await submitDeleteTemplate(form);
          break;
        case "remove-opportunity":
          await submitRemoveOpportunity(form);
          break;
        default:
          throw new Error(`Form non gestito: ${type}`);
      }
    } catch (error) {
      showToast(humanizeError(error, "il salvataggio"), "error", "Dati non salvati");
      setBusy(submitButton, false);
    }
  }

  function normalizedWebsite(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return safeExternalUrl(withProtocol) || null;
  }

  function openTemplateForm(template = null) {
    const isEdit = Boolean(template);
    const categories = ["Messaggio recruiter", "Cover letter", "Domanda application", "Follow-up", "Ringraziamento", "Altro"];
    const currentCategory = valueOf(template, "answerBank", "category", categories[0]);
    openDialog({
      eyebrow: isEdit ? "MODIFICA TEMPLATE" : "NUOVO TEMPLATE",
      title: isEdit ? "Aggiorna testo riutilizzabile" : "Salva un testo riutilizzabile",
      body: `
        <form class="form-stack" data-dialog-form="template" data-record-id="${template ? escapeAttribute(template.id) : ""}" novalidate>
          <label class="field"><span>Titolo *</span><input name="title" required maxlength="180" value="${escapeAttribute(valueOf(template, "answerBank", "title", ""))}" placeholder="Es. Primo messaggio al recruiter" /></label>
          <label class="field"><span>Categoria</span><select name="category">${categories.map((category) => optionMarkup(category, category, currentCategory)).join("")}</select></label>
          <label class="field"><span>Testo *</span><textarea name="content" rows="14" required placeholder="Ciao [Nome], ho visto la posizione [Ruolo] in [Azienda]…">${escapeHtml(valueOf(template, "answerBank", "content", ""))}</textarea></label>
          <div class="notice notice--info"><strong>Personalizza prima di inviare</strong><span>Le parentesi quadre rendono visibili i dati da sostituire, per evitare messaggi generici o incompleti.</span></div>
          <div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--primary" type="submit">${icon("check")}${isEdit ? "Salva modifiche" : "Salva template"}</button></div>
        </form>`
    });
  }

  async function copyTemplate(templateId) {
    const template = state.data.answerBank.find((item) => String(item.id) === String(templateId));
    if (!template) return;
    const content = valueOf(template, "answerBank", "content", "");
    try {
      await navigator.clipboard.writeText(content);
      showToast("Testo copiato: personalizza le variabili prima di inviarlo.", "success", "Template copiato");
    } catch (_error) {
      openResourceDetails(template);
    }
  }

  function openDeleteTemplateConfirmation(templateId) {
    const template = state.data.answerBank.find((item) => String(item.id) === String(templateId));
    if (!template) return;
    openDialog({
      eyebrow: "CONFERMA ELIMINAZIONE",
      title: "Eliminare questo template?",
      body: `<p class="dialog-copy">“${escapeHtml(valueOf(template, "answerBank", "title", "Template"))}” verrà eliminato dalla tua libreria.</p>
        <form data-dialog-form="delete-template" data-record-id="${escapeAttribute(template.id)}"><div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Annulla</button><button class="button button--danger" type="submit">${icon("trash")}Elimina</button></div></form>`
    });
  }

  async function submitOpportunityImport(form) {
    if (!ensureWritable()) throw new Error("Supabase non è disponibile per l’importazione.");
    const values = new FormData(form);
    const url = normalizedWebsite(values.get("url"));
    if (!url) throw new Error("Inserisci un URL http/https valido.");
    const title = String(values.get("title") || "").trim();
    const company = String(values.get("company") || "").trim();
    const location = String(values.get("location") || "").trim();
    let source = String(values.get("source") || "Career site").trim();
    const description = String(values.get("description") || "").trim();
    if (/easy\s*apply/i.test(description) && /linkedin/i.test(`${source} ${url}`)) source = "LinkedIn Easy Apply";
    const duplicate = state.data.jobs.find((job) => {
      const existingUrl = safeExternalUrl(valueOf(job, "jobs", "url", ""));
      return existingUrl === url || (
        jobTitle(job).toLowerCase() === title.toLowerCase() &&
        companyNameForJob(job).toLowerCase() === company.toLowerCase()
      );
    });
    if (duplicate) {
      closeDialog();
      openCopilot(duplicate.id);
      showToast("L’annuncio era già presente: ho aperto il record esistente senza creare duplicati.", "warning", "Opportunità già importata");
      return;
    }
    const analysis = analyzeOpportunity({ title, company, location, description });
    const payload = {};
    setMapped(payload, "jobs", "title", title);
    setMapped(payload, "jobs", "companyName", company);
    setMapped(payload, "jobs", "location", location || null);
    setMapped(payload, "jobs", "fitScore", analysis.score);
    setMapped(payload, "jobs", "status", "REVIEW");
    setMapped(payload, "jobs", "priority", analysis.score >= 8 ? "HIGH" : analysis.score >= 6.5 ? "MEDIUM" : "LOW");
    setMapped(payload, "jobs", "source", source);
    setMapped(payload, "jobs", "url", url);
    setMapped(payload, "jobs", "saved", false);
    setMapped(payload, "jobs", "whyFit", analysis.why);
    setMapped(payload, "jobs", "gaps", analysis.gaps);
    setMapped(payload, "jobs", "angle", analysis.angle);
    const created = await insertRecord("jobs", payload);
    try {
      window.localStorage.setItem(`jobfinder:job-description:${state.user?.id || "anonymous"}:${created.id}`, description);
    } catch (_error) {
      // The job is still usable when local browser storage is unavailable.
    }
    closeDialog();
    renderAll();
    openCopilot(created.id);
    showToast(`Fit ${analysis.score.toFixed(1)}/10${analysis.matches.length ? ` · ${analysis.matches.join(", ")}` : ""}`, "success", "Annuncio importato e analizzato");
  }

  async function submitTemplateForm(form) {
    if (!ensureWritable()) throw new Error("Supabase non è disponibile per il salvataggio.");
    const values = new FormData(form);
    const payload = {};
    setMapped(payload, "answerBank", "title", String(values.get("title") || "").trim());
    setMapped(payload, "answerBank", "category", String(values.get("category") || "Messaggio recruiter").trim());
    setMapped(payload, "answerBank", "content", String(values.get("content") || "").trim());
    setMapped(payload, "answerBank", "updatedAt", new Date().toISOString());
    const id = form.dataset.recordId;
    if (id) await updateRecord("answerBank", id, payload);
    else await insertRecord("answerBank", payload);
    closeDialog();
    renderTemplates();
    renderResources();
    updateNavigationCounts();
    showToast(id ? "Template aggiornato." : "Template salvato nella tua libreria.", "success", "Templates");
  }

  async function submitDeleteTemplate(form) {
    const id = form.dataset.recordId;
    await deleteRecord("answerBank", id);
    closeDialog();
    renderTemplates();
    renderResources();
    updateNavigationCounts();
    showToast("Template eliminato.", "success", "Templates");
  }

  async function submitCompanyForm(form) {
    if (!ensureWritable()) throw new Error("Supabase non è disponibile per il salvataggio.");
    const values = new FormData(form);
    const website = normalizedWebsite(values.get("website"));
    if (values.get("website") && !website) {
      throw new Error("Il website inserito non è un URL http/https valido.");
    }
    const payload = {};
    setMapped(payload, "companies", "name", String(values.get("name") || "").trim());
    setMapped(payload, "companies", "sector", String(values.get("sector") || "").trim() || null);
    setMapped(payload, "companies", "tier", String(values.get("tier") || "B"));
    setMapped(payload, "companies", "website", website || null);
    setMapped(payload, "companies", "notes", String(values.get("notes") || "").trim() || null);
    const id = form.dataset.recordId;
    if (id) await updateRecord("companies", id, payload);
    else await insertRecord("companies", payload);
    closeDialog();
    renderCompanies();
    renderDashboard();
    renderOpportunityFilters();
    showToast(id ? "Azienda aggiornata su Supabase." : "Azienda aggiunta ai target.", "success", "Aziende Target");
  }

  async function submitFollowupForm(form) {
    if (!ensureWritable()) throw new Error("Supabase non è disponibile per il salvataggio.");
    const values = new FormData(form);
    const applicationId = String(values.get("application_id") || "");
    const application = getApplicationById(applicationId);
    const selectedJobId = String(values.get("job_id") || "");
    const linkedJobId = selectedJobId || (application ? String(valueOf(application, "applications", "jobId", "")) : "");
    const payload = {};
    setMapped(payload, "followups", "action", String(values.get("action") || "").trim());
    setMapped(payload, "followups", "jobId", linkedJobId || null);
    setMapped(payload, "followups", "applicationId", applicationId || null);
    setMapped(payload, "followups", "contactId", String(values.get("contact_id") || "") || null);
    setMapped(payload, "followups", "contactName", String(values.get("contact_name") || "").trim() || null);
    setMapped(payload, "followups", "dueDate", String(values.get("due_date") || ""));
    setMapped(payload, "followups", "completed", values.get("completed") === "on");
    setMapped(payload, "followups", "notes", String(values.get("notes") || "").trim() || null);
    const id = form.dataset.recordId;
    if (id) await updateRecord("followups", id, payload);
    else await insertRecord("followups", payload);
    closeDialog();
    renderFollowups();
    renderDashboard();
    updateNavigationCounts();
    showToast(id ? "Follow-up aggiornato." : "Follow-up creato su Supabase.", "success", "Follow-up salvato");
  }

  async function submitApplicationStatusForm(form) {
    const application = getApplicationById(form.dataset.recordId);
    if (!application) throw new Error("Application non più disponibile.");
    const values = new FormData(form);
    const status = normalizeStatus(values.get("status"), "DRAFT");
    const progressByStatus = { DRAFT: 20, APPLIED: 100, CONTACTED: 100, INTERVIEW: 100, OFFER: 100, CLOSED: 100 };
    const payload = { [fieldName("applications", "status")]: status };
    if (progressByStatus[status] !== undefined) payload[fieldName("applications", "progress")] = progressByStatus[status];
    if (status === "APPLIED" && !valueOf(application, "applications", "appliedAt", "")) payload[fieldName("applications", "appliedAt")] = new Date().toISOString();
    await updateRecord("applications", application.id, payload);

    if (values.get("sync_job") === "on" && PIPELINE_STATES.includes(status)) {
      const job = getJobById(valueOf(application, "applications", "jobId", ""));
      if (job) {
        try {
          await updateRecord("jobs", job.id, { [fieldName("jobs", "status")]: status });
        } catch (error) {
          showToast(`Application aggiornata, ma la pipeline no: ${humanizeError(error)}`, "warning", "Sincronizzazione parziale");
        }
      }
    }
    closeDialog();
    renderAll();
    showToast(`Stato application aggiornato a ${status}.`, "success", "Application aggiornata");
  }

  async function submitApplicationNoteForm(form) {
    const application = getApplicationById(form.dataset.recordId);
    if (!application) throw new Error("Application non più disponibile.");
    const values = new FormData(form);
    await updateRecord("applications", application.id, { [fieldName("applications", "notes")]: String(values.get("notes") || "").trim() || null });
    closeDialog();
    renderApplications();
    showToast("Nota salvata nell’application.", "success", "Nota aggiornata");
  }

  async function submitDeleteFollowup(form) {
    await deleteRecord("followups", form.dataset.recordId);
    closeDialog();
    renderFollowups();
    renderDashboard();
    updateNavigationCounts();
    showToast("Follow-up eliminato definitivamente.", "success", "Follow-up eliminato");
  }

  initialize().catch((error) => {
    console.error("JobFinder initialization failed", error);
    hideInitialLoader();
    showAuth({ configMissing: !isSupabaseConfigured() });
    setFormStatus($("authStatus"), `Avvio non riuscito: ${humanizeError(error)}`, "error");
  });
})();
