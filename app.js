(() => {
  "use strict";

  const CONFIG = window.JOBFINDER_CONFIG || {};
  const PIPELINE_STATES = ["NEW", "APPLY", "APPLIED", "CONTACTED", "INTERVIEW", "OFFER", "CLOSED"];
  const PIPELINE_COLORS = {
    NEW: "#7f8da3",
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
    careerChangeReason: "Sto orientando il mio percorso verso ruoli in cui posso unire esperienza trasferibile, comprensione del cliente e capacità di trasformare obiettivi strategici in risultati concreti. Questa scelta nasce da un interesse maturato nel tempo e supportato da formazione mirata e progetti pertinenti.",
    careerChangeReasonEn: "I am intentionally moving towards roles where I can combine transferable experience, customer understanding, and the ability to turn strategic goals into tangible outcomes. This decision is grounded in a long-standing interest, supported by targeted education and relevant projects.",
    companyValues: "TeamViewer: collaborazione, spirito di squadra, attenzione al cliente e innovazione | Mi riconosco in questi valori perché nel mio modo di lavorare metto al centro il cliente, la collaborazione tra stakeholder e il miglioramento continuo."
  };
  const PRIMARY_COVER_LETTERS = {
    en: `Dear Hiring Team,

I am writing to express my interest in the [Role] position, advertised through [Source]. With over eight years of international experience in business development, customer experience, sales operations, and cross-functional transformation projects, I am particularly attracted by this opportunity at [Company]. [Motivation]

In my most recent role at Generali Corporate & Commercial, I led a cross-functional team of 15+ people across nine countries to design and scale a global data-driven NPS framework, translating customer insights and predictive trends into strategic recommendations for C-level stakeholders. Previously, I managed a €20M portfolio of multinational clients and generated €6M in new business, while also leading initiatives involving Salesforce CRM redesign, Power BI solutions, and commercial process improvement.

Building on this professional experience, I am currently pursuing an International Master in Artificial Intelligence at Rome Business School, focused on machine learning, AI-driven decision-making and data strategy, as well as a Master in Game Programming & AI Programming at Digital Bros Game Academy, where I am developing hands-on skills in C++, AI systems and object-oriented programming. [Career change]

[Value for company] My experience managing stakeholders across countries and functions has taught me how to turn complex business challenges into structured initiatives, align different priorities and drive implementation—capabilities I would be excited to apply to [Company].

[Company values]

Fluent in Italian, English, French and Spanish, I would welcome the opportunity to discuss how my experience and evolving technical expertise could contribute to the [Role] team.

Thank you for considering my application.

Kind regards,
[Name]`,
    it: `Gentile Team di Selezione,

desidero esprimere il mio interesse per la posizione di [Ruolo], pubblicata tramite [Fonte]. Con oltre otto anni di esperienza internazionale in business development, customer experience, sales operations e progetti di trasformazione cross-funzionali, sono particolarmente interessata a questa opportunità in [Azienda]. [Motivazione]

Nel mio ruolo più recente presso Generali Corporate & Commercial, ho guidato un team cross-funzionale di oltre 15 persone in nove Paesi per progettare e sviluppare un framework NPS globale e data-driven, traducendo insight sui clienti e trend predittivi in raccomandazioni strategiche per stakeholder C-level. In precedenza ho gestito un portafoglio di clienti multinazionali da €20 milioni e generato €6 milioni di nuovo business, guidando anche iniziative di redesign di Salesforce CRM, soluzioni Power BI e miglioramento dei processi commerciali.

A partire da questa esperienza professionale, sto frequentando un International Master in Artificial Intelligence presso Rome Business School, focalizzato su machine learning, decisioni supportate dall’AI e data strategy, oltre a un Master in Game Programming & AI Programming presso Digital Bros Game Academy, dove sto sviluppando competenze pratiche in C++, sistemi AI e programmazione orientata agli oggetti. [Cambio campo]

[Valore per azienda] L’esperienza nella gestione di stakeholder in Paesi e funzioni differenti mi ha insegnato a trasformare sfide di business complesse in iniziative strutturate, allineare priorità diverse e guidarne l’implementazione: capacità che sarei entusiasta di applicare in [Azienda].

[Valori aziendali]

Parlo fluentemente italiano, inglese, francese e spagnolo e sarei lieta di approfondire come la mia esperienza e le competenze tecniche in continua evoluzione possano contribuire al team responsabile della posizione di [Ruolo].

La ringrazio per l’attenzione dedicata alla mia candidatura.

Cordiali saluti,
[Nome]`
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
    draggedPipelineJobId: null,
    pendingJobActions: new Set(),
    demo: false,
    loadingData: false,
    sessionInitializing: false,
    sessionUserId: null,
    sessionExpiredHandled: false,
    applicationRepairAttempted: false,
    applicationRepairError: "",
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
      TO_REVIEW: "NEW",
      REVIEW: "NEW",
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

  function suggestedCoverLetter(job, language = "it") {
    const preferences = currentPreferences();
    const name = valueOf(state.profile, "profiles", "name", "").trim() || "[Nome e cognome]";
    const company = companyNameForJob(job);
    const role = jobTitle(job);
    const source = valueOf(job, "jobs", "source", language === "en" ? "the job posting" : "l’annuncio");
    const evidence = relevantCvEvidence(preferences, job);
    const skills = toList(preferences.profileSkills).slice(0, 4);
    const careerChange = String(language === "en" ? preferences.careerChangeReasonEn : preferences.careerChangeReason || "").trim();
    const valueContribution = language === "en"
      ? `I would bring ${skills.length ? naturalListEnglish(skills) : "a combination of transferable experience, customer focus, and execution skills"} to help the team turn priorities into measurable outcomes and create value for customers and the business.`
      : `Porterei ${skills.length ? naturalList(skills) : "un insieme di esperienze trasferibili, attenzione al cliente e capacità di execution"}, contribuendo a trasformare le priorità del team in risultati misurabili e valore per clienti e azienda.`;
    const resourceTemplate = personalizedCoverLetterTemplate(job, language, {
      name, company, role, source, evidence, skills, careerChange, valueContribution
    });
    if (resourceTemplate) return resourceTemplate;
    if (language === "en") {
      const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());
      return `${name}\n${valueOf(state.profile, "profiles", "email", state.user?.email || "[Email]")}\n${date}\n\nDear ${company} Hiring Team,\n\nI am writing to apply for the ${role} position, which I found through ${source}. ${roleBasedMotivationEnglish(job)}\n\n${careerChange ? `My decision to move into this field is deliberate: ${careerChange}` : "[Explain briefly why you decided to move into this field and how you prepared for the transition.]"}\n\n${evidence ? `My most relevant experience includes: ${evidence}` : "[Add one or two relevant professional or academic achievements from your CV.]"} ${valueContribution}\n\n${companyValuesAlignment(preferences, job, "en")} This alignment would allow me to contribute not only through my capabilities, but also through a way of working that supports ${company}'s culture and objectives.\n\nI would welcome the opportunity to discuss how my experience and potential could support the ${role} team. Thank you for considering my application.\n\nKind regards,\n${name}`;
    }
    const date = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    return `${name}\n${valueOf(state.profile, "profiles", "email", state.user?.email || "[Email]")}\n${date}\n\nGentile team di selezione di ${company},\n\ndesidero candidarmi per la posizione di ${role}, che ho trovato tramite ${source}. ${motivationForJob(preferences, job)}\n\n${careerChange ? `La decisione di orientare il mio percorso verso questo ambito è consapevole: ${careerChange}` : "[Spiega brevemente perché hai deciso di cambiare ambito e come ti sei preparata alla transizione.]"}\n\n${evidence ? `Tra le esperienze più rilevanti del mio percorso: ${evidence}` : "[Aggiungi uno o due risultati professionali o accademici pertinenti presenti nel CV.]"} ${valueContribution}\n\n${companyValuesAlignment(preferences, job, "it")} Questo allineamento mi permetterebbe di contribuire non solo attraverso le mie capacità, ma anche con un modo di lavorare coerente con la cultura e gli obiettivi di ${company}.\n\nSarei lieta di approfondire in un colloquio come la mia esperienza e il mio potenziale possano supportare il team ${role}. La ringrazio per l’attenzione dedicata alla mia candidatura.\n\nCordiali saluti,\n${name}`;
  }

  function coverLetterResource(language = "it") {
    const coverLetters = state.data.answerBank.filter((item) => /cover\s*letter/i.test(String(valueOf(item, "answerBank", "category", ""))));
    if (!coverLetters.length) return null;
    const languagePattern = language === "en" ? /(?:\ben\b|english|inglese)/i : /(?:\bit\b|italian|italiano|italiana)/i;
    return coverLetters.find((item) => languagePattern.test(`${valueOf(item, "answerBank", "title", "")} ${valueOf(item, "answerBank", "category", "")}`)) || coverLetters[0];
  }

  function personalizedCoverLetterTemplate(job, language, context) {
    const preferences = currentPreferences();
    const english = language === "en";
    const date = new Intl.DateTimeFormat(english ? "en-US" : "it-IT", english ? { month: "long", day: "numeric", year: "numeric" } : { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    const motivation = english ? roleBasedMotivationEnglish(job) : motivationForJob(preferences, job);
    const experience = context.evidence || (english ? "[Add a relevant achievement from your CV]" : "[Aggiungi un risultato pertinente presente nel CV]");
    const careerChange = context.careerChange || (english ? "[Explain why you decided to move into this field]" : "[Spiega perché hai deciso di cambiare campo]");
    const companyValues = companyValuesAlignment(preferences, job, language);
    const skillList = context.skills.length ? (english ? naturalListEnglish(context.skills) : naturalList(context.skills)) : (english ? "[Relevant skills]" : "[Competenze pertinenti]");
    const replacements = {
      nome: context.name,
      name: context.name,
      email: valueOf(state.profile, "profiles", "email", state.user?.email || "[Email]"),
      data: date,
      date,
      azienda: context.company,
      company: context.company,
      ruolo: context.role,
      role: context.role,
      posizione: context.role,
      position: context.role,
      fonte: context.source,
      source: context.source,
      location: valueOf(job, "jobs", "location", english ? "[Location]" : "[Località]"),
      motivazione: motivation,
      motivation,
      "motivo interesse": motivation,
      "motivo dell'interesse": motivation,
      "reason for interest": motivation,
      "cambio campo": careerChange,
      "cambio carriera": careerChange,
      "career change": careerChange,
      esperienza: experience,
      "esperienza rilevante": experience,
      experience,
      "relevant experience": experience,
      competenze: skillList,
      skills: skillList,
      "skill/ambito": skillList,
      "key skills": skillList,
      valore: context.valueContribution,
      "valore per azienda": context.valueContribution,
      "value for company": context.valueContribution,
      potenziale: context.valueContribution,
      potential: context.valueContribution,
      "valori aziendali": companyValues,
      "company values": companyValues,
      "why company": companyValues,
      "company knowledge": companyValues,
      responsabilità: responsibilitySummary(job, 420),
      responsibilities: responsibilitySummary(job, 420)
    };
    const content = PRIMARY_COVER_LETTERS[english ? "en" : "it"];
    const templateKeys = new Set([...content.matchAll(/\[([^\]]+)\]/g)].map((match) => String(match[1]).trim().toLowerCase()));
    let filled = content.replace(/\[([^\]]+)\]/g, (match, key) => replacements[String(key).trim().toLowerCase()] || match);
    const hasAnyKey = (...keys) => keys.some((key) => templateKeys.has(key));
    const header = hasAnyKey("data", "date", "email") ? "" : `${context.name}\n${replacements.email}\n${date}`;
    const requiredParagraphs = [];
    if (!hasAnyKey("ruolo", "role", "posizione", "position", "fonte", "source", "motivazione", "motivation", "motivo interesse", "motivo dell'interesse", "reason for interest")) {
      requiredParagraphs.push(english
        ? `I am applying for the ${context.role} position, which I found through ${context.source}. ${motivation}`
        : `Desidero candidarmi per la posizione di ${context.role}, che ho trovato tramite ${context.source}. ${motivation}`);
    }
    if (!hasAnyKey("cambio campo", "cambio carriera", "career change")) {
      requiredParagraphs.push(english ? `My decision to move into this field is deliberate: ${careerChange}` : `La decisione di orientare il mio percorso verso questo ambito è consapevole: ${careerChange}`);
    }
    if (!/Generali Corporate & Commercial/i.test(filled) && !hasAnyKey("esperienza", "esperienza rilevante", "experience", "relevant experience", "competenze", "skills", "skill/ambito", "key skills", "valore", "valore per azienda", "value for company", "potenziale", "potential")) {
      requiredParagraphs.push(english ? `My most relevant experience includes: ${experience}. ${context.valueContribution}` : `Tra le esperienze più rilevanti del mio percorso: ${experience}. ${context.valueContribution}`);
    }
    if (!hasAnyKey("valori aziendali", "company values", "why company", "company knowledge")) {
      requiredParagraphs.push(english ? `${companyValues} This alignment would help me contribute in a way that supports ${context.company}'s culture and objectives.` : `${companyValues} Questo allineamento mi permetterebbe di contribuire con un modo di lavorare coerente con la cultura e gli obiettivi di ${context.company}.`);
    }
    const hasClosing = /interview|colloquio|thank you|ringrazio|considering my application|candidatura/i.test(filled);
    if (!hasClosing) {
      requiredParagraphs.push(english ? `I would welcome the opportunity to discuss how my experience and potential could support the ${context.role} team. Thank you for considering my application.` : `Sarei lieta di approfondire in un colloquio come la mia esperienza e il mio potenziale possano supportare il team ${context.role}. La ringrazio per l’attenzione dedicata alla mia candidatura.`);
    }
    if (requiredParagraphs.length) {
      const closingPattern = /\n(?=(?:Kind regards|Sincerely|Best regards|Cordiali saluti|Distinti saluti)[,\s]*\n?)/i;
      const closingIndex = filled.search(closingPattern);
      filled = closingIndex >= 0
        ? `${filled.slice(0, closingIndex).trimEnd()}\n\n${requiredParagraphs.join("\n\n")}\n${filled.slice(closingIndex).trimStart()}`
        : `${filled}\n\n${requiredParagraphs.join("\n\n")}`;
    }
    return header ? `${header}\n\n${filled}` : filled;
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
        { id: "j2", user_id: "demo-user", company_id: "c2", company_name: "Motor Valley Labs", title: "Business Transformation Lead", location: "Modena · Hybrid", fit_score: 8.8, status: "NEW", priority: "HIGH", source: "JobTeaser", url: "https://example.com", is_saved: false },
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
    state.applicationRepairAttempted = false;
    state.applicationRepairError = "";
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
    if (!state.applicationRepairAttempted && !state.errors.applications) {
      state.applicationRepairAttempted = true;
      const missingJobs = applicationRegisterEntries().filter((entry) => entry.missingRecord && entry.job).map((entry) => entry.job);
      const repairErrors = [];
      for (const job of missingJobs) {
        try {
          await writeApplicationRecord("insert", null, appliedApplicationPayload(job, null), "APPLIED");
        } catch (error) {
          repairErrors.push(humanizeError(error, "la creazione dell’application"));
        }
      }
      state.applicationRepairError = repairErrors[0] || "";
    }
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
    const application = getApplicationForJob(job?.id);
    const applicationStatus = normalizeStatus(valueOf(application, "applications", "status", ""), "");
    const status = PIPELINE_STATES.includes(applicationStatus)
      ? applicationStatus
      : normalizeStatus(valueOf(job, "jobs", "status", "NEW"));
    return PIPELINE_STATES.includes(status) ? status : "NEW";
  }

  function applicationStatusForDatabase(status) {
    const normalized = normalizeStatus(status, "DRAFT");
    return { DRAFT: "draft", APPLY: "draft", APPLIED: "applied", CONTACTED: "contacted", INTERVIEW: "interview", OFFER: "offer", CLOSED: "closed" }[normalized] || normalized.toLowerCase();
  }

  function applicationStatusCandidates(status) {
    const normalized = normalizeStatus(status, "DRAFT");
    const aliases = {
      DRAFT: ["DRAFT", "draft", "in_progress"], APPLIED: ["APPLIED", "SUBMITTED", "applied", "submitted", "DRAFT", "draft"],
      CONTACTED: ["contacted", "screening", "CONTACTED"], INTERVIEW: ["interview", "interviewing", "INTERVIEW"],
      OFFER: ["offer", "offered", "OFFER"], CLOSED: ["closed", "rejected", "withdrawn", "CLOSED"]
    };
    return [...new Set(aliases[normalized] || [applicationStatusForDatabase(normalized)])];
  }

  function isApplicationStatusConstraintError(error) {
    const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
    return message.includes("applications_status_check") || (String(error?.code || "") === "23514" && message.includes("status"));
  }

  async function writeApplicationRecord(mode, recordId, payload, logicalStatus) {
    let lastError = null;
    for (const candidate of applicationStatusCandidates(logicalStatus)) {
      try {
        const compatiblePayload = { ...payload, [fieldName("applications", "status")]: candidate };
        return mode === "update" ? await updateRecord("applications", recordId, compatiblePayload) : await insertRecord("applications", compatiblePayload);
      } catch (error) {
        lastError = error;
        if (!isApplicationStatusConstraintError(error)) throw error;
      }
    }
    throw lastError || new Error("Lo stato della candidatura non è compatibile con la configurazione del database.");
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
      careerChangeReason: local.careerChangeReason || DEFAULT_PREFERENCES.careerChangeReason,
      careerChangeReasonEn: local.careerChangeReasonEn || DEFAULT_PREFERENCES.careerChangeReasonEn,
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
    const explicitLogo = safeExternalUrl(valueOf(company, "companies", "logoUrl", ""));
    const companyWebsite = safeExternalUrl(valueOf(company, "companies", "website", ""));
    const jobUrl = safeExternalUrl(valueOf(job, "jobs", "url", ""));
    let candidateUrl = companyWebsite;
    if (!candidateUrl && jobUrl) {
      try {
        const hostname = new URL(jobUrl).hostname.toLowerCase();
        if (!/(?:linkedin|jobteaser|greenhouse|lever|indeed)\./.test(hostname)) candidateUrl = jobUrl;
      } catch (_error) {
        // Keep the initials fallback.
      }
    }
    let logo = "";
    if (explicitLogo) {
      logo = `<img src="${escapeAttribute(explicitLogo)}" alt="Logo ${escapeAttribute(companyName)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`;
    } else if (candidateUrl) {
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

  function industryFromText(text) {
    const normalized = String(text || "").toLowerCase();
    const sectors = [
      [/automotive|mobility|vehicle|mobilità|veicoli/, "Automotive & Mobility"],
      [/artificial intelligence|machine learning|\bai\b|software|cloud|saas|cybersecurity/, "Technology & AI"],
      [/bank|banking|insurance|fintech|financial|assicuraz/, "Financial Services"],
      [/energy|energia|renewable|utility|utilities|oil|gas/, "Energy & Utilities"],
      [/pharma|healthcare|medical|biotech|salute/, "Healthcare & Life Sciences"],
      [/retail|e-commerce|ecommerce|consumer goods/, "Retail & Consumer"],
      [/consulting|consulenza|advisory/, "Consulting"],
      [/telecom|telco|telecommunications/, "Telecommunications"],
      [/manufacturing|industrial|engineering|infrastructure/, "Industrial & Infrastructure"]
    ];
    return sectors.find(([pattern]) => pattern.test(normalized))?.[1] || "";
  }

  function companyIndustry(job) {
    const company = getCompanyById(valueOf(job, "jobs", "companyId", ""));
    const saved = valueOf(company, "companies", "sector", valueOf(job, "jobs", "industry", ""));
    return saved || industryFromText(`${jobTitle(job)} ${jobDescriptionText(job)}`) || "Industria non indicata";
  }

  function companySummaryFromText(companyName, description, industry = "") {
    const sentence = String(description || "").split(/(?<=[.!?])\s+/).find((item) =>
      item.length > 35 && item.length < 260 && /(?:company|azienda|leader|provid|offr|svilupp|specializ|operat|mission|customers|clienti)/i.test(item)
    );
    if (sentence) return sentence.trim();
    return industry
      ? `${companyName} è un’azienda attiva nel settore ${industry}, dove sviluppa prodotti, servizi o soluzioni per i propri clienti.`
      : "";
  }

  function companyOverview(job) {
    const company = getCompanyById(valueOf(job, "jobs", "companyId", ""));
    const notes = String(valueOf(company, "companies", "notes", "")).trim();
    if (notes) return notes;
    const industry = companyIndustry(job);
    const description = jobDescriptionText(job);
    const extracted = companySummaryFromText(companyNameForJob(job), description, industry === "Industria non indicata" ? "" : industry);
    if (extracted) return extracted;
    return industry !== "Industria non indicata"
      ? `${companyNameForJob(job)} è un’azienda attiva nel settore ${industry}, dove sviluppa prodotti, servizi o soluzioni per i propri clienti.`
      : `${companyNameForJob(job)} propone questa opportunità per rafforzare il team e contribuire alle priorità descritte nell’annuncio.`;
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

  function salaryFromJob(job) {
    const description = jobDescriptionText(job);
    if (!description) return "";
    const patterns = [
      /(?:ral|retribuzione|stipendio|salary|compensation|pay range|base salary)\s*[:\-–—]?\s*((?:€|eur|£|gbp|\$|usd)?\s*\d{2,3}(?:[.,]\d{3})?(?:\s*[kK])?\s*(?:[-–—]|to|a)\s*(?:€|eur|£|gbp|\$|usd)?\s*\d{2,3}(?:[.,]\d{3})?(?:\s*[kK])?(?:\s*(?:annui|annuo|per year|yearly|p\.a\.))?)/i,
      /((?:€|eur|£|gbp|\$|usd)\s*\d{2,3}(?:[.,]\d{3})?(?:\s*[kK])?\s*(?:[-–—]|to|a)\s*(?:€|eur|£|gbp|\$|usd)?\s*\d{2,3}(?:[.,]\d{3})?(?:\s*[kK])?(?:\s*(?:annui|annuo|per year|yearly|p\.a\.))?)/i,
      /(?:ral|retribuzione|stipendio|salary|compensation)\s*[:\-–—]?\s*((?:€|eur|£|gbp|\$|usd)?\s*\d{2,3}(?:[.,]\d{3})?(?:\s*[kK])?(?:\s*(?:annui|annuo|per year|yearly|p\.a\.))?)/i
    ];
    const match = patterns.map((pattern) => description.match(pattern)).find(Boolean);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  }

  function salaryMarkup(job) {
    const salary = salaryFromJob(job);
    return salary ? `<span class="opportunity-salary">${icon("briefcase")}RAL / stipendio: ${escapeHtml(salary)}</span>` : "";
  }

  function jobSeniority(job) {
    const text = `${jobTitle(job)} ${jobDescriptionText(job)}`;
    if (/\b(intern|internship|stage|tirocinio)\b/i.test(text)) return "Internship";
    if (/\b(junior|entry.level|graduate)\b/i.test(text)) return "Junior";
    if (/\b(head|director|vp|vice president|executive)\b/i.test(text)) return "Leadership";
    if (/\b(senior|lead|principal|manager)\b/i.test(text)) return "Senior";
    if (/\b(mid.level|intermediate|specialist)\b/i.test(text)) return "Mid-level";
    return "Non indicato";
  }

  function jobExperience(job) {
    const text = jobDescriptionText(job);
    const range = text.match(/(?:at least|minimum|minimo|almeno|oltre)?\s*(\d{1,2})\s*(?:[-–—]|to|a)\s*(\d{1,2})\+?\s*(?:years?|anni)\s+(?:of\s+)?(?:experience|esperienza)/i);
    if (range) return `${range[1]}–${range[2]} anni`;
    const single = text.match(/(?:at least|minimum|minimo|almeno|oltre)?\s*(\d{1,2})\+?\s*(?:years?|anni)\s+(?:of\s+)?(?:experience|esperienza)/i)
      || text.match(/(?:experience|esperienza)(?:\s+(?:of|di))?\s*(\d{1,2})\+?\s*(?:years?|anni)/i);
    return single ? `${single[1]}${/\+/.test(single[0]) ? "+" : ""} anni` : "Non indicata";
  }

  function jobContract(job) {
    const text = jobDescriptionText(job);
    const types = [
      [/tempo indeterminato|permanent contract|permanent position/, "Tempo indeterminato"],
      [/tempo determinato|fixed.term|temporary contract/, "Tempo determinato"],
      [/full.time|full time|tempo pieno/, "Full-time"],
      [/part.time|part time/, "Part-time"],
      [/internship|stage|tirocinio/, "Stage"],
      [/freelance|contractor|consulenza/, "Freelance / contratto"]
    ];
    return types.find(([pattern]) => pattern.test(text))?.[1] || "Non indicato";
  }

  function jobLanguages(job) {
    const text = jobDescriptionText(job);
    const languages = [
      [/\bitalian(?:o|a)?\b/i, "Italiano"], [/\benglish|inglese\b/i, "Inglese"],
      [/\bfrench|francese\b/i, "Francese"], [/\bspanish|spagnolo\b/i, "Spagnolo"],
      [/\bgerman|tedesco\b/i, "Tedesco"]
    ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
    return languages.length ? languages.slice(0, 3).join(" · ") : "Non indicata";
  }

  function roleSynopsis(job) {
    const description = jobDescriptionText(job);
    if (!description) return inferredRoleSummary(job);
    const sentences = description.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 35);
    const intro = sentences.filter((sentence) => /(?:role|position|ruolo|opportunit|team|you will|sarai|cerchiamo|looking for)/i.test(sentence)).slice(0, 2).join(" ");
    const selected = intro || sentences.slice(0, 2).join(" ") || inferredRoleSummary(job);
    return selected.length > 520 ? `${selected.slice(0, 519).trimEnd()}…` : selected;
  }

  function responsibilityItems(job) {
    const description = jobDescriptionText(job);
    const sentences = description.split(/(?<=[.!?;])\s+|\n+/).map((item) => item.replace(/^[•\-–—\s]+/, "").trim()).filter((item) => item.length > 20);
    const pattern = /responsabil|attivit|what you.ll do|duties|manage|lead|develop|deliver|support|coordinate|gestir|guidar|svilupp|coordin|realizz|implement|analizz|define|drive/i;
    const items = sentences.filter((item) => pattern.test(item)).slice(0, 5);
    if (items.length) return items.map((item) => item.length > 190 ? `${item.slice(0, 189).trimEnd()}…` : item);
    return inferredRoleSummary(job).split(/;|\.(?:\s+|$)/).map((item) => item.trim()).filter(Boolean).slice(0, 4);
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
    return `${summary} In ${company}, la posizione richiede di comprendere rapidamente il contesto aziendale, trasformare le priorità in azioni concrete e comunicare con chiarezza avanzamento, decisioni e impatto generato.`;
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
      || jobStatus(job) !== "NEW"
      || Boolean(feedbackValueForJob(job.id));
    const byNewest = (a, b) => new Date(valueOf(b, "jobs", "createdAt", 0)) - new Date(valueOf(a, "jobs", "createdAt", 0));
    const newJobs = visibleJobs.filter((job) => !isEvaluated(job)).sort(byNewest).slice(0, 6);
    const evaluatedAt = (job) => {
      const application = getApplicationForJob(job.id);
      const timestamp = valueOf(application, "applications", "appliedAt", "")
        || valueOf(job, "jobs", "updatedAt", "")
        || valueOf(job, "jobs", "createdAt", 0);
      return new Date(timestamp).getTime() || 0;
    };
    const evaluatedJobs = visibleJobs.filter(isEvaluated).sort((a, b) => {
      const appliedFirst = Number(hasAppliedToJob(b)) - Number(hasAppliedToJob(a));
      return appliedFirst || evaluatedAt(b) - evaluatedAt(a) || jobFit(b) - jobFit(a);
    }).slice(0, 6);
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
          ${salaryMarkup(job)}
        </div>
        <div class="opportunity-company-brief">
          <span class="opportunity-company-brief__logo company-logo">${companyLogoContent(job)}</span>
          <div><strong>${escapeHtml(companyIndustry(job))}</strong><p>${escapeHtml(companyOverview(job))}</p></div>
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

  function pipelineOrderKey() {
    return `jobfinder:pipeline-order:${state.user?.id || "anonymous"}`;
  }

  function pipelineOrder() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(pipelineOrderKey()) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch (_error) {
      return {};
    }
  }

  function sortPipelineJobs(jobs, status) {
    const order = pipelineOrder()[status] || [];
    const position = new Map(order.map((id, index) => [String(id), index]));
    return [...jobs].sort((a, b) => {
      const aIndex = position.has(String(a.id)) ? position.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
      const bIndex = position.has(String(b.id)) ? position.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex || jobFit(b) - jobFit(a);
    });
  }

  function savePipelineOrder(status, orderedIds) {
    const allOrders = pipelineOrder();
    allOrders[status] = orderedIds.map(String);
    window.localStorage.setItem(pipelineOrderKey(), JSON.stringify(allOrders));
  }

  function reorderPipelineCard(sourceId, targetId, status, placeAfter = false) {
    if (targetId && String(sourceId) === String(targetId)) return;
    const jobs = sortPipelineJobs(state.data.jobs.filter((job) => jobStatus(job) === status), status);
    const ids = jobs.map((job) => String(job.id)).filter((id) => id !== String(sourceId));
    const targetIndex = targetId ? ids.indexOf(String(targetId)) : ids.length;
    ids.splice(targetIndex < 0 ? ids.length : targetIndex + (placeAfter ? 1 : 0), 0, String(sourceId));
    savePipelineOrder(status, ids);
    renderPipeline();
    showToast("Ranking personale aggiornato e salvato in questo browser.", "success", "Pipeline riordinata");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  }

  function downloadPipelineReport() {
    const entries = applicationRegisterEntries().filter((entry) => entry.job);
    if (!entries.length) {
      showToast("Non ci sono candidature da includere nel report.", "warning", "Report non creato");
      return;
    }
    const header = ["Ranking", "Azienda", "Industria", "Posizione", "Stato", "Data candidatura", "RAL / stipendio", "Fonte", "Link opportunità"];
    const rankedJobs = PIPELINE_STATES.flatMap((status) => sortPipelineJobs(state.data.jobs.filter((job) => jobStatus(job) === status), status));
    const rank = new Map(rankedJobs.map((job, index) => [String(job.id), index + 1]));
    const rows = entries.sort((a, b) => (rank.get(String(a.job.id)) || Number.MAX_SAFE_INTEGER) - (rank.get(String(b.job.id)) || Number.MAX_SAFE_INTEGER)).map(({ application, job }) => [
      rank.get(String(job.id)) || "", companyNameForJob(job), companyIndustry(job), jobTitle(job), jobStatus(job),
      valueOf(application, "applications", "appliedAt", "") ? formatDate(valueOf(application, "applications", "appliedAt", "")) : "",
      salaryFromJob(job) || "Non indicata", valueOf(job, "jobs", "source", ""), valueOf(job, "jobs", "url", "")
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jobfinder-pipeline-${todayIso()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${rows.length} candidature incluse nel file.`, "success", "Report scaricato");
  }

  function renderPipeline() {
    $("pipelineBoard").innerHTML = PIPELINE_STATES.map((status, index) => {
      const jobs = sortPipelineJobs(state.data.jobs.filter((job) => jobStatus(job) === status), status);
      return `
        <section class="kanban-column" data-pipeline-status="${status}" style="--column-color:${PIPELINE_COLORS[status]}">
          <header class="kanban-column__heading"><strong>${status}</strong><span class="kanban-count">${jobs.length}</span></header>
          <div class="kanban-cards" data-pipeline-status="${status}">
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
      <article class="kanban-card" draggable="true" data-pipeline-job-id="${escapeAttribute(job.id)}" data-pipeline-status="${status}" aria-label="${escapeAttribute(jobTitle(job))}. Trascina per cambiare il ranking nella colonna.">
        <div class="kanban-card__drag-handle" title="Trascina per ordinare">⋮⋮ <span>Trascina per ordinare</span></div>
        <div class="kanban-card__top"><span class="company-logo">${companyLogoContent(job)}</span><span class="badge badge--fit">${jobFit(job).toFixed(1)}</span></div>
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
      ${missing ? `<div class="notice notice--warning application-data-warning"><strong>${missing} ${missing === 1 ? "candidatura non sincronizzata" : "candidature non sincronizzate"}</strong><span>${escapeHtml(state.applicationRepairError || "La riparazione automatica non è riuscita. Riprova oppure verifica le policy INSERT e SELECT della tabella applications.")}</span><button class="button button--warning" type="button" data-action="repair-applications">Riprova</button></div>` : ""}
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
    $("preferenceCareerChangeReason").value = preferences.careerChangeReason;
    $("preferenceCareerChangeReasonEn").value = preferences.careerChangeReasonEn;
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

  function suggestedCopilotContent(job, language = "it") {
    const preferences = currentPreferences();
    const company = companyNameForJob(job);
    const role = jobTitle(job);
    const roleMatches = preferences.roles.filter((target) => role.toLowerCase().includes(target.toLowerCase().split(" ")[0])).slice(0, 3);
    const location = valueOf(job, "jobs", "location", "");
    const source = valueOf(job, "jobs", "source", "");
    const fit = jobFit(job);
    const why = language === "en" ? `Fit ${fit.toFixed(1)}/10. The ${role} role is aligned with the target profile${roleMatches.length ? ` (${roleMatches.join(", ")})` : ""}. Highlight measurable outcomes, the ability to connect strategy with execution, and customer impact.` : valueOf(job, "jobs", "whyFit", "") || `Fit ${fit.toFixed(1)}/10. Il ruolo ${role} è coerente con il posizionamento target${roleMatches.length ? ` (${roleMatches.join(", ")})` : ""}. Evidenzia risultati misurabili, capacità di lavorare tra strategia ed execution e impatto sul cliente.`;
    const gaps = language === "en" ? "Check which technical or industry requirements are not yet covered by your profile. Address any gaps through relevant transferable experience and a concrete learning plan." : valueOf(job, "jobs", "gaps", "") || "Verifica i requisiti tecnici e di settore non ancora coperti dal profilo. Prepara una risposta concreta su come colmare rapidamente gli eventuali gap con esperienze trasferibili e apprendimento mirato.";
    const angle = language === "en" ? `Position yourself as the link between business goals, customer needs, and operational transformation. Support each statement with an outcome and explain why this approach is relevant to ${company}.` : valueOf(job, "jobs", "angle", "") || `Posizionati come ponte tra obiettivi di business, bisogni del cliente e trasformazione operativa. Collega ogni affermazione a un risultato e mostra perché questo approccio è rilevante per ${company}.`;
    const motivation = motivationForJob(preferences, job);
    const evidence = relevantCvEvidence(preferences, job);
    const skills = toList(preferences.profileSkills).slice(0, 4);
    const competenceSentence = evidence
      ? language === "en" ? `My background includes experience that is particularly relevant to this role: ${evidence}` : `Nel mio percorso ho maturato esperienze particolarmente pertinenti: ${evidence}`
      : skills.length
        ? language === "en" ? `I also believe that my background in ${naturalListEnglish(skills)} is well aligned with the responsibilities of the role.` : `Credo inoltre che il mio background in ${naturalList(skills)} sia coerente con le attività e le responsabilità previste dal ruolo.`
        : language === "en" ? "Before sending, add a relevant skill or measurable result from your CV: [skill or result]." : "Prima dell’invio, aggiungi qui una competenza o un risultato concreto pertinente al ruolo: [competenza o risultato dal CV].";
    const valuesAlignment = companyValuesAlignment(preferences, job, language);
    if (language === "en") {
      const note = `Hello [Name],\n\nI hope you do not mind me contacting you directly. I recently applied for the ${role} position at ${company} and wanted to introduce myself briefly.\n\n${roleBasedMotivationEnglish(job)}\n\n${competenceSentence}\n\n${valuesAlignment}\n\nI would be grateful if you had the opportunity to review my profile, and I would be happy to discuss the contribution I could bring to the team.\n\nThank you for your time.\nBest regards,\n${valueOf(state.profile, "profiles", "name", "[Name]") || "[Name]"}`;
      return { why, gaps, angle, note };
    }
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

  function roleBasedMotivationEnglish(job) {
    const role = jobTitle(job).toLowerCase();
    if (/customer success|client success/.test(role)) return "I am particularly interested in this opportunity because it combines customer relationships, a strong understanding of client goals, and the ability to turn product adoption into tangible outcomes.";
    if (/transformation|program(?:me)? manager/.test(role)) return "I am particularly interested in the opportunity to lead complex transformation initiatives, aligning people, priorities, and execution around measurable outcomes.";
    if (/product manager|product owner/.test(role)) return "I am particularly interested in the opportunity to connect user needs, business priorities, and product execution.";
    if (/strategy|strategic/.test(role)) return "I am particularly interested in the opportunity to turn analysis and strategic priorities into concrete decisions and initiatives.";
    if (/business analy|data analy|insight/.test(role)) return "I am particularly interested in the way this role combines analysis, business understanding, and the ability to turn data into actionable decisions.";
    return "This opportunity caught my attention because of its responsibilities and the possibility of contributing directly to the team's goals.";
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

  function naturalListEnglish(items) {
    if (items.length < 2) return items[0] || "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  }

  function companyValuesAlignment(preferences, job, language = "it") {
    const company = companyNameForJob(job);
    const entries = String(preferences.companyValues || "").split(/\r?\n/).map((line) => {
      const separator = line.indexOf(":");
      if (separator < 1) return null;
      const name = line.slice(0, separator).trim();
      const [values, reason] = line.slice(separator + 1).split("|").map((part) => part?.trim());
      return name && values ? { name, values, reason } : null;
    }).filter(Boolean);
    const match = entries.find((entry) => company.toLowerCase().includes(entry.name.toLowerCase()) || entry.name.toLowerCase().includes(company.toLowerCase()));
    if (!match) return language === "en" ? `Before sending, complete your alignment with ${company}'s values: [verified company values and why they resonate with you].` : `Prima dell’invio, completa l’allineamento con i valori di ${company}: [valori aziendali verificati e perché ti rappresentano].`;
    if (!match.reason) return language === "en" ? `I identify with ${company}'s values, particularly ${match.values}. Before sending, add a personal example: [why these values resonate with you].` : `Mi ritrovo nei valori di ${company}, in particolare ${match.values}. Prima dell’invio aggiungi una prova personale: [perché questi valori ti rappresentano].`;
    if (language === "en") return `I also identify with ${company}'s values, particularly ${match.values}. ${match.reason}`;
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
    const language = $("copilotLanguage")?.value || "it";
    const suggestions = suggestedCopilotContent(job, language);
    const company = companyNameForJob(job);
    $("copilotCompanyLogo").innerHTML = companyLogoContent(job);
    $("copilotRole").textContent = jobTitle(job);
    $("copilotCompany").textContent = company;
    $("copilotFitScore").textContent = jobFit(job).toFixed(1);
    $("copilotPriority").textContent = titleCase(jobPriority(job));
    $("copilotStatus").textContent = jobStatus(job);
    $("copilotLocation").textContent = valueOf(job, "jobs", "location", "Non indicata");
    $("copilotIndustry").textContent = companyIndustry(job);
    $("copilotSalary").textContent = salaryFromJob(job) || "Non indicata nell’annuncio";
    $("copilotCompanyOverview").textContent = companyOverview(job);
    $("copilotSeniority").textContent = jobSeniority(job);
    $("copilotExperience").textContent = jobExperience(job);
    $("copilotContract").textContent = jobContract(job);
    $("copilotLanguages").textContent = jobLanguages(job);
    $("copilotRoleBrief").textContent = roleSynopsis(job);
    $("copilotResponsibilities").innerHTML = responsibilityItems(job).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("copilotWhyFit").value = valueOf(application, "applications", "whyFit", localDraft.whyFit || suggestions.why);
    $("copilotGaps").value = valueOf(application, "applications", "gaps", localDraft.gaps || suggestions.gaps);
    $("copilotAngle").value = valueOf(application, "applications", "angle", localDraft.angle || suggestions.angle);
    $("copilotCv").value = valueOf(application, "applications", "cvUsed", localDraft.cvUsed || valueOf(job, "jobs", "recommendedCv", ""));
    $("copilotPreparationStatus").value = valueOf(application, "applications", "preparationStatus", localDraft.preparationStatus || "draft");
    const savedRecruiterNote = valueOf(application, "applications", "recruiterNote", localDraft.recruiterNote || "");
    $("copilotRecruiterNote").value = resolvedRecruiterNote(savedRecruiterNote, suggestions.note);
    $("copilotCoverLetter").value = valueOf(application, "applications", "notes", localDraft.notes || suggestedCoverLetter(job, language));
    $("copilotCoverLetterSource").textContent = "Basata sul modello principale di Margherita, adattata all’annuncio e completata secondo le linee guida.";
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
    $("copilotLanguage")?.addEventListener("change", regenerateCopilotTexts);
    $("closeDialogButton")?.addEventListener("click", closeDialog);
    $("appDialog")?.addEventListener("close", () => document.body.classList.remove("dialog-open"));
    $("appDialog")?.addEventListener("click", (event) => {
      if (event.target === $("appDialog")) closeDialog();
    });
    document.addEventListener("click", handleDelegatedClick);
    document.addEventListener("dragstart", handlePipelineDragStart);
    document.addEventListener("dragover", handlePipelineDragOver);
    document.addEventListener("drop", handlePipelineDrop);
    document.addEventListener("dragend", clearPipelineDragState);
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
        case "repair-applications":
          await repairMissingApplications(trigger);
          break;
        case "download-pipeline-report":
          downloadPipelineReport();
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
        case "regenerate-copilot":
          regenerateCopilotTexts();
          break;
        case "copy-copilot-field":
          await copyCopilotField(trigger.dataset.field);
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

  function handlePipelineDragStart(event) {
    const card = event.target.closest?.("[data-pipeline-job-id]");
    if (!card) return;
    state.draggedPipelineJobId = card.dataset.pipelineJobId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedPipelineJobId);
  }

  function handlePipelineDragOver(event) {
    if (!state.draggedPipelineJobId) return;
    const container = event.target.closest?.(".kanban-cards");
    const source = document.querySelector(`[data-pipeline-job-id="${CSS.escape(String(state.draggedPipelineJobId))}"]`);
    if (!container || !source || container.dataset.pipelineStatus !== source.dataset.pipelineStatus) return;
    event.preventDefault();
    document.querySelectorAll(".kanban-card.is-drag-target").forEach((card) => card.classList.remove("is-drag-target"));
    event.target.closest?.(".kanban-card")?.classList.add("is-drag-target");
  }

  function handlePipelineDrop(event) {
    if (!state.draggedPipelineJobId) return;
    const container = event.target.closest?.(".kanban-cards");
    const source = document.querySelector(`[data-pipeline-job-id="${CSS.escape(String(state.draggedPipelineJobId))}"]`);
    if (!container || !source || container.dataset.pipelineStatus !== source.dataset.pipelineStatus) return;
    event.preventDefault();
    const target = event.target.closest?.(".kanban-card");
    const rect = target?.getBoundingClientRect();
    const placeAfter = Boolean(rect && event.clientY > rect.top + rect.height / 2);
    reorderPipelineCard(state.draggedPipelineJobId, target?.dataset.pipelineJobId || "", container.dataset.pipelineStatus, placeAfter);
    clearPipelineDragState();
  }

  function clearPipelineDragState() {
    state.draggedPipelineJobId = null;
    document.querySelectorAll(".kanban-card.is-dragging, .kanban-card.is-drag-target").forEach((card) => card.classList.remove("is-dragging", "is-drag-target"));
  }

  function regenerateCopilotTexts() {
    const job = getJobById(state.selectedJobId);
    if (!job) return;
    const language = $("copilotLanguage")?.value || "it";
    const suggestions = suggestedCopilotContent(job, language);
    $("copilotWhyFit").value = suggestions.why;
    $("copilotGaps").value = suggestions.gaps;
    $("copilotAngle").value = suggestions.angle;
    $("copilotRecruiterNote").value = suggestions.note;
    $("copilotCoverLetter").value = suggestedCoverLetter(job, language);
    $("copilotCoverLetterSource").textContent = "Basata sul modello principale di Margherita, adattata all’annuncio e completata secondo le linee guida.";
    showToast(language === "en" ? "Recruiter message and cover letter generated in English." : "Messaggio recruiter e cover letter generati in italiano.", "success", "Testi aggiornati");
  }

  async function copyCopilotField(fieldId) {
    const allowedFields = new Set(["copilotRecruiterNote", "copilotCoverLetter"]);
    const field = allowedFields.has(fieldId) ? $(fieldId) : null;
    const content = field?.value?.trim();
    if (!content) {
      showToast("Non c’è ancora un testo da copiare.", "warning", "Contenuto vuoto");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      showToast("Testo copiato negli appunti.", "success", "Pronto da incollare");
    } catch (_error) {
      openDialog({ eyebrow: "TESTO PRONTO", title: "Copia il contenuto", body: `<textarea class="kit-preview" rows="16" readonly>${escapeHtml(content)}</textarea><div class="form-actions"><button class="button button--secondary" type="button" data-action="close-dialog">Chiudi</button></div>` });
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
        <p class="dialog-copy">Incolla il link e il testo completo raccolto da LinkedIn, JobTeaser o dal sito aziendale. JobFinder evita duplicati e riconosce automaticamente fonte, Easy Apply, RAL, industria, seniority, esperienza, contratto, lingue e responsabilità quando sono realmente presenti.</p>
        <form class="form-stack" data-dialog-form="opportunity-import" novalidate>
          <label class="field"><span>URL annuncio</span><input name="url" type="url" required placeholder="https://azienda.com/jobs/…" /></label>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Ruolo</span><input name="title" required placeholder="Customer Success Manager" /></label>
            <label class="field"><span>Azienda</span><input name="company" required placeholder="Nome azienda" /></label>
          </div>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Industria <small>(opzionale: viene dedotta dal testo)</small></span><input name="industry" placeholder="Technology, Automotive, Energy…" /></label>
            <label class="field"><span>Sito aziendale</span><input name="company_website" type="url" placeholder="https://azienda.com" /></label>
          </div>
          <label class="field"><span>Cosa fa l’azienda <small>(opzionale: viene dedotto dal testo)</small></span><textarea name="company_description" rows="3" placeholder="Prodotti, servizi, clienti e mercato principale…"></textarea></label>
          <div class="form-grid form-grid--two">
            <label class="field"><span>Località / modalità</span><input name="location" placeholder="Milano · Hybrid" /></label>
            <label class="field"><span>Fonte</span><select name="source"><option>Career site</option><option>LinkedIn alert</option><option>LinkedIn Easy Apply</option><option>JobTeaser</option><option>Lever</option><option>Greenhouse</option><option>Altro</option></select></label>
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
    if (jobStatus(job) === "NEW") jobPatch[fieldName("jobs", "status")] = "APPLY";
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
    setMapped(payload, "applications", "status", applicationStatusForDatabase("APPLIED"));
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
          ? await writeApplicationRecord("update", existingApplication.id, appliedApplicationPayload(job, existingApplication), "APPLIED")
          : await writeApplicationRecord("insert", null, appliedApplicationPayload(job, null), "APPLIED");
      } catch (applicationError) {
        throw new Error(`La candidatura non è stata modificata perché il record application non è stato salvato. ${humanizeError(applicationError, "la creazione dell’application")}`);
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
      openFollowupPrompt(savedApplication, job);
    } finally {
      state.pendingJobActions.delete(actionKey);
      setBusy(button, false);
    }
  }

  async function repairMissingApplications(button) {
    const missingJobs = applicationRegisterEntries().filter((entry) => entry.missingRecord && entry.job).map((entry) => entry.job);
    if (!missingJobs.length || !ensureWritable()) return;
    setBusy(button, true, `Riparazione 0/${missingJobs.length}`);
    let repaired = 0;
    const errors = [];
    for (const job of missingJobs) {
      try {
        await writeApplicationRecord("insert", null, appliedApplicationPayload(job, null), "APPLIED");
        repaired += 1;
        button.innerHTML = `<span class="spinner spinner--button"></span>Riparazione ${repaired}/${missingJobs.length}`;
      } catch (error) {
        errors.push(`${jobTitle(job)}: ${humanizeError(error, "la creazione dell’application")}`);
      }
    }
    await loadAllData({ quiet: true });
    renderAll();
    setBusy(button, false);
    if (errors.length) showToast(`${repaired} riparate, ${errors.length} non riuscite. ${errors[0]}`, "warning", "Riparazione parziale");
    else showToast(`${repaired} candidature riallineate in tutte le pagine.`, "success", "Dati sincronizzati");
  }

  function openFollowupPrompt(application, job) {
    openDialog({
      eyebrow: "CANDIDATURA REGISTRATA",
      title: "Hai applicato!",
      body: `<div class="notice notice--success"><strong>${escapeHtml(jobTitle(job))}</strong> presso ${escapeHtml(jobCompany(job))} risulta ora applicata.</div>
        <p class="dialog-copy">Lo stato è stato aggiornato in Dashboard, Opportunità, Pipeline e Le mie Application. La posizione è ora la prima tra quelle già valutate.</p>
        <p class="dialog-copy"><strong>Vuoi impostare anche un follow-up?</strong></p>
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
    setMapped(payload, "applications", "status", applicationStatusForDatabase(preparationStatus === "submitted" ? "APPLIED" : preservedStatus));
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
    let savedApplication = application;
    let createdApplication = false;
    const previousApplication = application
      ? recordPatch("applications", application, ["status", "cvUsed", "progress", "whyFit", "gaps", "angle", "recruiterNote", "notes", "preparationStatus", "appliedAt"])
      : null;
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
        savedApplication = await writeApplicationRecord("update", application.id, payload, preparationStatus === "submitted" ? "APPLIED" : preservedStatus);
      } else {
        savedApplication = await writeApplicationRecord("insert", null, payload, preparationStatus === "submitted" ? "APPLIED" : preservedStatus);
        createdApplication = true;
        clearLocalCopilotDraft(job.id);
      }

      const currentJobStatus = jobStatus(job);
      const desiredJobStatus = preparationStatus === "submitted" ? "APPLIED" : currentJobStatus === "NEW" ? "APPLY" : currentJobStatus;
      if (desiredJobStatus !== currentJobStatus) {
        try {
          await updateRecord("jobs", job.id, { [fieldName("jobs", "status")]: desiredJobStatus });
        } catch (jobError) {
          try {
            if (createdApplication && savedApplication) await deleteRecord("applications", savedApplication.id);
            else if (application && previousApplication) await updateRecord("applications", application.id, previousApplication);
          } catch (_rollbackError) {
            await loadAllData({ quiet: true });
          }
          throw new Error(`Nessun dato è stato modificato perché la sincronizzazione del job è fallita. ${humanizeError(jobError)}`);
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
      careerChangeReason: $("preferenceCareerChangeReason").value.trim(),
      careerChangeReasonEn: $("preferenceCareerChangeReasonEn").value.trim(),
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
          <label class="field"><span>Cosa fa l’azienda</span><textarea name="notes" rows="5" placeholder="Prodotti, servizi, clienti e mercato principale…">${escapeHtml(valueOf(company, "companies", "notes", ""))}</textarea></label>
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
          <div><dt>Cosa fa l’azienda</dt><dd>${escapeHtml(valueOf(company, "companies", "notes", "Descrizione non disponibile."))}</dd></div>
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
          <p class="notice notice--info"><strong>Sincronizzazione automatica</strong><span>Il nuovo stato verrà mostrato in Dashboard, Opportunità, Pipeline e Le mie Application.</span></p>
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
          <div class="notice notice--info"><strong>Variabili automatiche</strong><span>Per le cover letter puoi usare [Nome], [Email], [Data], [Azienda], [Ruolo], [Fonte], [Location], [Motivazione], [Cambio carriera], [Esperienza rilevante], [Competenze], [Valore per azienda], [Valori aziendali] e [Responsabilità]. Il Copilot le adatta a ogni annuncio.</span></div>
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
    const suppliedIndustry = String(values.get("industry") || "").trim();
    let companyDescription = String(values.get("company_description") || "").trim();
    const companyWebsite = normalizedWebsite(values.get("company_website"));
    if (values.get("company_website") && !companyWebsite) throw new Error("Inserisci un sito aziendale http/https valido.");
    let source = String(values.get("source") || "Career site").trim();
    const description = String(values.get("description") || "").trim();
    const industry = suppliedIndustry || industryFromText(`${title} ${description}`);
    companyDescription ||= companySummaryFromText(company, description, industry);
    if (/jobteaser\.(?:com|fr|it|de|co\.uk)/i.test(url)) source = "JobTeaser";
    else if (/linkedin\.com/i.test(url) && !/linkedin/i.test(source)) source = "LinkedIn alert";
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
    let companyRecord = state.data.companies.find((item) => valueOf(item, "companies", "name", "").trim().toLowerCase() === company.toLowerCase()) || null;
    try {
      if (!companyRecord) {
        const companyPayload = {};
        setMapped(companyPayload, "companies", "name", company);
        setMapped(companyPayload, "companies", "sector", industry || null);
        setMapped(companyPayload, "companies", "tier", "B");
        setMapped(companyPayload, "companies", "website", companyWebsite || null);
        setMapped(companyPayload, "companies", "notes", companyDescription || null);
        companyRecord = await insertRecord("companies", companyPayload);
      } else if (industry || companyDescription || companyWebsite) {
        const companyPatch = {};
        if (industry) setMapped(companyPatch, "companies", "sector", industry);
        if (companyDescription) setMapped(companyPatch, "companies", "notes", companyDescription);
        if (companyWebsite) setMapped(companyPatch, "companies", "website", companyWebsite);
        companyRecord = await updateRecord("companies", companyRecord.id, companyPatch);
      }
    } catch (companyError) {
      console.warn("Company enrichment could not be saved", companyError);
    }
    const payload = {};
    setMapped(payload, "jobs", "title", title);
    setMapped(payload, "jobs", "companyName", company);
    setMapped(payload, "jobs", "companyId", companyRecord?.id || null);
    setMapped(payload, "jobs", "location", location || null);
    setMapped(payload, "jobs", "fitScore", analysis.score);
    setMapped(payload, "jobs", "status", "NEW");
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
    const previousApplication = recordPatch("applications", application, ["status", "progress", "appliedAt"]);
    const payload = { [fieldName("applications", "status")]: applicationStatusForDatabase(status) };
    if (progressByStatus[status] !== undefined) payload[fieldName("applications", "progress")] = progressByStatus[status];
    if (status === "APPLIED" && !valueOf(application, "applications", "appliedAt", "")) payload[fieldName("applications", "appliedAt")] = new Date().toISOString();
    await writeApplicationRecord("update", application.id, payload, status);

    const job = getJobById(valueOf(application, "applications", "jobId", ""));
    if (job && PIPELINE_STATES.includes(status)) {
      try {
        await updateRecord("jobs", job.id, { [fieldName("jobs", "status")]: status });
      } catch (error) {
        try { await updateRecord("applications", application.id, previousApplication); } catch (_rollbackError) { await loadAllData({ quiet: true }); }
        throw new Error(`Nessuno stato è stato modificato perché la sincronizzazione della pipeline è fallita. ${humanizeError(error)}`);
      }
    }
    closeDialog();
    renderAll();
    showToast(`Stato aggiornato a ${status} in tutte le pagine.`, "success", "Application sincronizzata");
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
