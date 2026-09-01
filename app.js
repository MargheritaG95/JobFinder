const cfg = window.JOBFINDER_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const authShell=$("#auth-shell"), authCard=$("#auth-card"), resetCard=$("#reset-card"), app=$("#app");
const emailInput=$("#email"), passwordInput=$("#password"), message=$("#message"), resetMessage=$("#reset-message");
const content=$("#content"), greeting=$("#greeting"), pageSubtitle=$("#page-subtitle"), userEmail=$("#user-email");
const modalBackdrop=$("#modal-backdrop"), modalContent=$("#modal-content"), toast=$("#toast");

const demoJobs = [
 {id:"d1",company_name:"Banca Generali",role_title:"AI Product Manager",location:"Milano",fit_score:9.6,priority:"APPLY",status:"NEW",source:"Career Site",source_url:"#",description:"AI product leadership, business transformation and customer value."},
 {id:"d2",company_name:"Generali",role_title:"Group CRM & Customer Engagement Senior Professional",location:"Milano",fit_score:9.5,priority:"APPLY",status:"REVIEW",source:"Career Site",source_url:"#",description:"CRM, customer engagement, analytics and international stakeholder management."},
 {id:"d3",company_name:"Lutech",role_title:"AI Strategy & Adoption Consultant",location:"Milano",fit_score:9.2,priority:"APPLY",status:"APPLY",source:"LinkedIn",source_url:"#",description:"AI adoption, strategy, transformation and change."},
 {id:"d4",company_name:"Harvey",role_title:"Enterprise Account Executive",location:"Milano",fit_score:9.0,priority:"APPLY",status:"APPLIED",source:"Career Site",source_url:"#",description:"Enterprise sales for an AI technology platform."},
 {id:"d5",company_name:"MotorK",role_title:"Customer Success Manager Automotive",location:"Milano",fit_score:8.8,priority:"REVIEW",status:"CONTACTED",source:"LinkedIn",source_url:"#",description:"Automotive SaaS customer success."},
 {id:"d6",company_name:"DAZN",role_title:"Senior Product Manager, Growth",location:"Milano",fit_score:8.7,priority:"APPLY",status:"INTERVIEW",source:"Career Site",source_url:"#",description:"Growth product management in entertainment and streaming."}
];

const defaultCompanies=["Banca Generali","Generali","Deloitte","EY","Accenture","Anthropic","Bending Spoons","Salesforce","Docebo","MotorK","DAZN","Geotab"];

let state={user:null,jobs:[],applications:[],companies:[],followups:[],feedback:[],profile:null,prefs:null,usingDemo:false};

function esc(v=""){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function notify(text){toast.textContent=text;toast.classList.remove("hidden");clearTimeout(window.__toast);window.__toast=setTimeout(()=>toast.classList.add("hidden"),2400)}
function setMessage(el,text,type=""){el.textContent=text||"";el.className="message"+(type?` ${type}`:"");if(!text)el.classList.add("hidden")}
function showAuth(){authShell.classList.remove("hidden");authCard.classList.remove("hidden");resetCard.classList.add("hidden");app.classList.add("hidden")}
function showReset(){authShell.classList.remove("hidden");authCard.classList.add("hidden");resetCard.classList.remove("hidden");app.classList.add("hidden")}
function showApp(){authShell.classList.add("hidden");app.classList.remove("hidden")}

async function safeTable(table, select="*"){
  try{
    const {data,error}=await sb.from(table).select(select);
    if(error) throw error;
    return data||[];
  }catch(e){console.warn(table,e.message);return []}
}
async function loadData(){
  const [jobs,apps,companies,followups,feedback,profiles,prefs]=await Promise.all([
    safeTable("jobs"),safeTable("applications"),safeTable("companies"),safeTable("followups"),safeTable("feedback"),safeTable("profiles"),safeTable("search_preferences")
  ]);
  state.jobs=jobs.length?jobs:demoJobs;
  state.usingDemo=!jobs.length;
  state.applications=apps;
  state.companies=companies;
  state.followups=followups;
  state.feedback=feedback;
  state.profile=profiles[0]||null;
  state.prefs=prefs[0]||null;
}

function avgFit(){return state.jobs.length?(state.jobs.reduce((a,j)=>a+Number(j.fit_score||0),0)/state.jobs.length):0}
function updateFitRing(){const n=avgFit();$("#avg-fit").textContent=n?n.toFixed(1)+"/10":"—";const deg=Math.max(0,Math.min(100,n*10));$(".ring").style.background=`conic-gradient(var(--purple) 0 ${deg}%,#eae2fb ${deg}%)`}
function logoText(c){return (c||"?").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function statusLabel(s){return ({NEW:"Nuova",REVIEW:"In evidenza",APPLY:"Da applicare",APPLIED:"Application",CONTACTED:"Screening",INTERVIEW:"Colloquio",OFFER:"Offer",CLOSED:"Chiusa"}[s]||s||"Nuova")}
function badgeClass(s){return ["NEW","APPLIED","CONTACTED"].includes(s)?"purple":["APPLY","INTERVIEW","OFFER"].includes(s)?"green":"orange"}

function jobCard(j){
 return `<div class="job-row" data-id="${esc(j.id)}">
  <div class="job-main"><div class="company-logo">${esc(logoText(j.company_name))}</div><div class="min0">
    <div class="job-title">${esc(j.role_title)}</div><div class="job-meta">${esc(j.company_name)} · ${esc(j.location||"")}</div>
    <div class="badges"><span class="badge green">${Number(j.fit_score||0)>=9?"ALTO FIT":"BUON FIT"}</span><span class="badge ${badgeClass(j.status)}">${esc(statusLabel(j.status))}</span></div>
  </div></div>
  <div class="fit-score">${Number(j.fit_score||0).toFixed(1)}/10<small>FIT</small></div>
  <button class="apply-btn" data-action="prepare" data-id="${esc(j.id)}">Applica ora</button>
  <button class="icon-btn" title="Salva" data-action="save" data-id="${esc(j.id)}">♡</button>
 </div>`
}

function pipelineCounts(){
 const statuses=["NEW","APPLIED","CONTACTED","INTERVIEW","OFFER","CLOSED"];
 return Object.fromEntries(statuses.map(s=>[s,state.jobs.filter(j=>j.status===s).length]))
}

function renderDashboard(){
 const pc=pipelineCounts(), applied=state.jobs.filter(j=>["APPLIED","CONTACTED","INTERVIEW","OFFER"].includes(j.status)).length;
 const top=[...state.jobs].sort((a,b)=>Number(b.fit_score)-Number(a.fit_score)).slice(0,5);
 const companies=(state.companies.length?state.companies.map(c=>c.name):defaultCompanies).slice(0,5);
 content.innerHTML=`
 <div class="kpi-grid">
  ${kpi("OPPORTUNITÀ ALTO FIT",state.jobs.filter(j=>Number(j.fit_score)>=7).length,"▣")}
  ${kpi("APPLICATION IN CORSO",applied,"➤","blue")}
  ${kpi("COLLOQUI",pc.INTERVIEW,"♧","green")}
  ${kpi("OFFERTE",pc.OFFER,"☆","orange")}
  ${kpi("AZIENDE TARGET",state.companies.length||defaultCompanies.length,"▦")}
 </div>
 <div class="two-col">
  <section class="panel"><div class="panel-head"><h2>Top opportunità per te</h2><button class="subtle-btn" data-go="opportunities">Vedi tutte</button></div>
   <div class="job-list">${top.map(jobCard).join("")}</div>
  </section>
  <div class="stack">
   <section class="panel"><div class="panel-head"><h2>La tua pipeline</h2><button class="subtle-btn" data-go="pipeline">Vedi dettagli</button></div>
    ${pipe("Ricerca",state.jobs.filter(j=>["NEW","REVIEW","APPLY"].includes(j.status)).length,90)}
    ${pipe("Application",pc.APPLIED,58)}
    ${pipe("Screening",pc.CONTACTED,40)}
    ${pipe("Colloqui",pc.INTERVIEW,27)}
    ${pipe("Offer",pc.OFFER,20)}
    ${pipe("Rifiutate",pc.CLOSED,24)}
   </section>
   <section class="panel"><div class="panel-head"><h2>Prossime azioni</h2><button class="subtle-btn" data-go="followups">Vedi tutte</button></div>
    ${actionItem("Invia application per "+esc(top[0]?.role_title||"top opportunity"),top[0]?.company_name||"","ALTA PRIORITÀ")}
    ${actionItem("Follow-up con recruiter",top[1]?.company_name||"","OGGI")}
    ${actionItem("Prepara il prossimo colloquio",top.find(j=>j.status==="INTERVIEW")?.company_name||top[2]?.company_name||"","DOMANI")}
   </section>
  </div>
 </div>
 <section class="panel company-strip"><div class="panel-head"><h2>Aziende target</h2><button class="subtle-btn" data-go="companies">Vedi tutte</button></div>
  <div class="company-cards">${companies.map((c,i)=>`<div class="company-card"><strong>${esc(c)}</strong><p>Milano <span class="badge ${i<2?"purple":""}" style="float:right">${i<2?"ALTO":"MEDIO"}</span></p></div>`).join("")}</div>
 </section>
 ${state.usingDemo?`<p class="muted" style="font-size:11px;margin-top:10px">Dati demo mostrati perché la tabella jobs è vuota. Le azioni restano cliccabili; quando inserirai dati Supabase verranno usati automaticamente.</p>`:""}`;
 wireContent();
}

function kpi(label,value,icon,kind=""){return `<div class="kpi"><div class="label" style="color:${kind==="green"?"var(--green)":kind==="orange"?"var(--orange)":kind==="blue"?"var(--blue)":"var(--purple)"}">${label}</div><div class="value">${value}</div><div class="icon">${icon}</div></div>`}
function pipe(label,n,pct){return `<div class="pipeline-row"><div class="pipeline-line"><span>${label}</span><strong>${n}</strong></div><div class="progress"><span style="width:${n?Math.max(12,pct):4}%"></span></div></div>`}
function actionItem(title,sub,tag){return `<label class="action-item"><input type="checkbox"><span><strong>${title}</strong><br><span class="muted">${esc(sub)}</span></span><span class="priority">${tag}</span></label>`}

function renderOpportunities(){
 content.innerHTML=`<section class="panel"><div class="toolbar"><div><h2 style="font-size:18px;margin:0">Opportunità</h2><p class="muted" style="font-size:12px">Ruoli prioritizzati per Fit Score.</p></div><div class="left"><select id="fit-filter" class="filter"><option value="7">Fit ≥ 7</option><option value="8">Fit ≥ 8</option><option value="9">Fit ≥ 9</option></select><select id="status-filter" class="filter"><option value="">Tutti gli stati</option>${["NEW","REVIEW","APPLY","APPLIED","CONTACTED","INTERVIEW","OFFER"].map(s=>`<option>${s}</option>`).join("")}</select></div></div><div id="opp-list" class="job-list"></div></section>`;
 const draw=()=>{const fit=Number($("#fit-filter").value),st=$("#status-filter").value;$("#opp-list").innerHTML=state.jobs.filter(j=>Number(j.fit_score)>=fit&&(!st||j.status===st)).sort((a,b)=>Number(b.fit_score)-Number(a.fit_score)).map(jobCard).join("")||`<div class="empty">Nessun ruolo con questi filtri.</div>`;wireContent()};
 $("#fit-filter").onchange=draw;$("#status-filter").onchange=draw;draw();
}

function renderPipeline(){
 const cols=[["Da valutare",["NEW","REVIEW","APPLY"]],["Application",["APPLIED"]],["Screening",["CONTACTED"]],["Colloqui / Offer",["INTERVIEW","OFFER"]]];
 content.innerHTML=`<div class="board">${cols.map(([title,statuses])=>`<section class="column"><h3>${title} · ${state.jobs.filter(j=>statuses.includes(j.status)).length}</h3>${state.jobs.filter(j=>statuses.includes(j.status)).map(j=>`<div class="kanban"><strong>${esc(j.role_title)}</strong><p>${esc(j.company_name)}</p><span class="badge">${Number(j.fit_score).toFixed(1)}/10</span><div style="margin-top:8px"><button class="subtle-btn" data-action="advance" data-id="${esc(j.id)}">Avanza →</button></div></div>`).join("")||`<div class="muted" style="font-size:11px">Vuoto</div>`}</section>`).join("")}</div>`;
 wireContent();
}

function renderApplications(){
 const rows=state.jobs.filter(j=>["APPLIED","CONTACTED","INTERVIEW","OFFER"].includes(j.status));
 content.innerHTML=`<section class="panel"><div class="panel-head"><h2>Le mie Application</h2><button class="btn btn-primary" data-go="opportunities">+ Nuova application</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Azienda</th><th>Ruolo</th><th>Fit</th><th>Stato</th><th>Azione</th></tr></thead><tbody>${rows.map(j=>`<tr><td>${esc(j.company_name)}</td><td>${esc(j.role_title)}</td><td>${Number(j.fit_score).toFixed(1)}</td><td><span class="badge ${badgeClass(j.status)}">${statusLabel(j.status)}</span></td><td><button class="subtle-btn" data-action="prepare" data-id="${esc(j.id)}">Apri Copilot</button></td></tr>`).join("")}</tbody></table></div></section>`;wireContent();
}

function renderCompanies(){
 const cs=state.companies.length?state.companies:defaultCompanies.map((name,i)=>({name,tier:i<4?"A":i<8?"B":"C",sector:i<5?"Tech / AI":"Target"}));
 content.innerHTML=`<div class="toolbar"><div><h2 style="margin:0">Aziende Target</h2><p class="muted" style="font-size:12px">Organizza le aziende per priorità.</p></div><button class="btn btn-primary" id="add-company">+ Aggiungi azienda</button></div><div class="company-cards">${cs.map(c=>`<div class="company-card"><span class="badge purple">Tier ${esc(c.tier||"B")}</span><h3>${esc(c.name)}</h3><p>${esc(c.sector||"Target company")}</p><button class="subtle-btn" data-company="${esc(c.name)}">Apri scheda</button></div>`).join("")}</div>`;$("#add-company").onclick=()=>openCompanyModal();$$("[data-company]").forEach(b=>b.onclick=()=>openCompanyModal(b.dataset.company));
}

function renderFollowups(){
 content.innerHTML=`<section class="panel"><div class="panel-head"><h2>Follow-up</h2><button class="btn btn-primary" id="new-followup">+ Nuovo follow-up</button></div><div class="stack">${state.followups.length?state.followups.map(f=>`<div class="action-item"><input type="checkbox"><span><strong>${esc(f.action)}</strong><br><span class="muted">${f.due_at?new Date(f.due_at).toLocaleString("it-IT"):"Senza scadenza"}</span></span><span class="priority">DA FARE</span></div>`).join(""):`<div class="empty">Nessun follow-up salvato. Creane uno.</div>`}</div></section>`;$("#new-followup").onclick=openFollowupModal;
}

function renderFeedback(){
 content.innerHTML=`<section class="panel"><h2>Feedback sulle opportunità</h2><p class="muted">Aiuta JobFinder a capire cosa vuoi vedere di più.</p><div class="job-list">${state.jobs.slice(0,8).map(j=>`<div class="job-row" style="grid-template-columns:1fr auto"><div><strong>${esc(j.role_title)}</strong><div class="job-meta">${esc(j.company_name)}</div></div><div class="left"><button class="subtle-btn" data-feedback="LIKE" data-id="${esc(j.id)}">👍</button> <button class="subtle-btn" data-feedback="PASS" data-id="${esc(j.id)}">PASS</button> <button class="subtle-btn" data-feedback="DISLIKE" data-id="${esc(j.id)}">👎</button></div></div>`).join("")}</div></section>`;$$("[data-feedback]").forEach(b=>b.onclick=()=>saveFeedback(b.dataset.id,b.dataset.feedback));
}

function renderPreferences(){
 const p=state.prefs||{};
 content.innerHTML=`<section class="panel"><h2>Preferenze di ricerca</h2><p class="muted">Le preferenze manuali restano sotto il tuo controllo.</p><div class="form-grid">
  <div><label>Ruoli target</label><textarea id="pref-roles" rows="5">${esc((p.role_tags||["Customer Experience","Business Strategy","Sales Ops / RevOps","Customer Insights","Business Analytics","AI Strategy","AI Product","Customer Success"]).join(", "))}</textarea></div>
  <div><label>Settori</label><textarea id="pref-industries" rows="5">${esc((p.industry_tags||["Tech","AI","Automotive","Motorsport","Motorcycle","Classic Cars","Gaming"]).join(", "))}</textarea></div>
  <div><label>Località</label><input id="pref-locations" value="${esc((p.location_tags||["Milano","Remote Italy","EU"]).join(", "))}"></div>
  <div><label>Modalità di lavoro</label><input id="pref-modes" value="${esc((p.work_mode_tags||["Hybrid","Remote"]).join(", "))}"></div>
  <div><label>Fit minimo</label><input id="pref-fit" type="number" min="0" max="10" step=".1" value="${Number(p.min_fit??7).toFixed(1)}"></div>
  <div class="switch"><span><strong>AI learning</strong><br><small class="muted">Salva segnali per migliorare i suggerimenti.</small></span><input id="pref-ai" type="checkbox" ${p.ai_learning_enabled!==false?"checked":""}></div>
 </div><button id="save-prefs" class="btn btn-primary" style="margin-top:16px">Salva preferenze</button></section>`;$("#save-prefs").onclick=savePreferences;
}

function renderResources(){content.innerHTML=`<div class="two-col"><section class="panel"><h2>CV & Application Kit</h2><p class="muted">Prepara varianti CV per i diversi track.</p>${["AI / Strategy","CX / Customer Success","Commercial / Enterprise","Automotive","Business Analytics / Transformation"].map(x=>`<div class="action-item"><span>▤</span><span><strong>${x}</strong><br><span class="muted">Template CV</span></span><button class="subtle-btn" onclick="notify('Sezione CV pronta per il prossimo step')">Apri</button></div>`).join("")}</section><section class="panel"><h2>Answer Bank</h2><p class="muted">Risposte ricorrenti per candidature.</p>${["Esperienza","Lingue","Disponibilità","Salary expectation","Work authorization"].map(x=>`<div class="action-item"><span>✓</span><span>${x}</span><button class="subtle-btn" onclick="notify('Answer Bank: '+${JSON.stringify(x)})">Modifica</button></div>`).join("")}</section></div>`}
function renderAnalytics(){const buckets=[["9–10",state.jobs.filter(j=>j.fit_score>=9).length],["8–8.9",state.jobs.filter(j=>j.fit_score>=8&&j.fit_score<9).length],["7–7.9",state.jobs.filter(j=>j.fit_score>=7&&j.fit_score<8).length]];content.innerHTML=`<div class="kpi-grid">${kpi("FIT MEDIO",avgFit().toFixed(1),"◎")}${kpi("OPPORTUNITÀ",state.jobs.length,"▣")}${kpi("APPLICATION",state.jobs.filter(j=>j.status==="APPLIED").length,"➤")}${kpi("COLLOQUI",state.jobs.filter(j=>j.status==="INTERVIEW").length,"♧")}${kpi("OFFER",state.jobs.filter(j=>j.status==="OFFER").length,"☆")}</div><section class="panel"><h2>Distribuzione Fit Score</h2>${buckets.map(([l,n])=>pipe(l,n,Math.min(100,n*18))).join("")}</section>`}

function renderPage(page){
 $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 const subtitles={dashboard:"Ecco il tuo overview di oggi",opportunities:"Le migliori opportunità per te",pipeline:"Segui ogni candidatura",applications:"Tutte le candidature attive",companies:"Le aziende che vuoi monitorare",followups:"Non perdere il prossimo passo",feedback:"Allena le tue preferenze",preferences:"Configura la ricerca",resources:"CV, risposte e materiali",analytics:"Misura cosa sta funzionando"};
 pageSubtitle.textContent=subtitles[page]||"";
 ({dashboard:renderDashboard,opportunities:renderOpportunities,pipeline:renderPipeline,applications:renderApplications,companies:renderCompanies,followups:renderFollowups,feedback:renderFeedback,preferences:renderPreferences,resources:renderResources,analytics:renderAnalytics}[page]||renderDashboard)();
}

function wireContent(){
 $$("[data-go]").forEach(b=>b.onclick=()=>renderPage(b.dataset.go));
 $$("[data-action='prepare']").forEach(b=>b.onclick=()=>openApplicationModal(b.dataset.id));
 $$("[data-action='save']").forEach(b=>b.onclick=()=>{b.textContent=b.textContent==="♥"?"♡":"♥";notify(b.textContent==="♥"?"Opportunità salvata":"Rimossa dai salvati")});
 $$("[data-action='advance']").forEach(b=>b.onclick=()=>advanceJob(b.dataset.id));
}

function openModal(html){modalContent.innerHTML=html;modalBackdrop.classList.remove("hidden")}
function closeModal(){modalBackdrop.classList.add("hidden")}
$("#modal-close").onclick=closeModal;modalBackdrop.onclick=e=>{if(e.target===modalBackdrop)closeModal()};

function findJob(id){return state.jobs.find(j=>String(j.id)===String(id))}
function openApplicationModal(id){
 const j=findJob(id);if(!j)return;
 openModal(`<h2>✨ Application Copilot</h2><p class="muted">${esc(j.company_name)} · ${esc(j.role_title)}</p>
 <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">${kpi("FIT",Number(j.fit_score).toFixed(1)+"/10","◎")}${kpi("PRIORITÀ",j.priority||"REVIEW","☆")}${kpi("STATO",statusLabel(j.status),"➤")}</div>
 <section class="panel" style="box-shadow:none"><h2>Perché sei in fit</h2><p>${esc(j.description||"Esperienza coerente con ruolo, seniority e contesto.")}</p></section>
 <div class="form-grid"><div><label>CV consigliato</label><select id="cv-choice"><option>AI / Strategy</option><option>CX / Customer Success</option><option>Commercial / Enterprise</option><option>Automotive</option></select></div><div><label>Stato candidatura</label><select id="application-status"><option>PREPARING</option><option>READY</option><option>SUBMITTED</option></select></div><div class="full"><label>Nota / messaggio recruiter</label><textarea id="application-note" rows="4" placeholder="Scrivi qui il tuo angle per questa candidatura..."></textarea></div></div>
 <div class="modal-actions"><button class="btn btn-ghost" id="open-source">Apri annuncio</button><button class="btn btn-primary" id="save-application">Prepara application</button></div>`);
 $("#open-source").onclick=()=>{if(j.source_url&&j.source_url!=="#")window.open(j.source_url,"_blank");else notify("Link annuncio non disponibile nei dati demo")};
 $("#save-application").onclick=()=>saveApplication(j);
}
async function saveApplication(j){
 if(state.usingDemo){j.status="APPLIED";notify("Application segnata come preparata");closeModal();renderPage("applications");return}
 const payload={user_id:state.user.id,job_id:j.id,status:$("#application-status").value,cv_variant:$("#cv-choice").value,notes:$("#application-note").value||null,package_progress:25};
 const {error}=await sb.from("applications").upsert(payload,{onConflict:"user_id,job_id"});
 if(error){notify("Errore: "+error.message);return}
 await sb.from("jobs").update({status:"APPLIED"}).eq("id",j.id).eq("user_id",state.user.id);
 await loadData();notify("Application preparata");closeModal();renderPage("applications")
}
async function advanceJob(id){
 const j=findJob(id);if(!j)return;const order=["NEW","REVIEW","APPLY","APPLIED","CONTACTED","INTERVIEW","OFFER","CLOSED"];j.status=order[Math.min(order.length-1,order.indexOf(j.status)+1)]||"APPLIED";
 if(!state.usingDemo){const {error}=await sb.from("jobs").update({status:j.status}).eq("id",j.id).eq("user_id",state.user.id);if(error){notify(error.message);return}}
 notify("Stato aggiornato: "+statusLabel(j.status));renderPage("pipeline")
}
async function saveFeedback(id,signal){
 const j=findJob(id);if(state.usingDemo){notify("Feedback registrato: "+signal);return}
 const {error}=await sb.from("feedback").insert({user_id:state.user.id,job_id:j.id,signal,reasons:[]});notify(error?"Errore: "+error.message:"Feedback salvato")
}
async function savePreferences(){
 const payload={user_id:state.user.id,role_tags:$("#pref-roles").value.split(",").map(s=>s.trim()).filter(Boolean),industry_tags:$("#pref-industries").value.split(",").map(s=>s.trim()).filter(Boolean),location_tags:$("#pref-locations").value.split(",").map(s=>s.trim()).filter(Boolean),work_mode_tags:$("#pref-modes").value.split(",").map(s=>s.trim()).filter(Boolean),min_fit:Number($("#pref-fit").value||7),ai_learning_enabled:$("#pref-ai").checked};
 const {error}=await sb.from("search_preferences").upsert(payload,{onConflict:"user_id"});
 if(error){localStorage.setItem("jobfinder_prefs",JSON.stringify(payload));notify("Preferenze salvate localmente");return}
 state.prefs=payload;notify("Preferenze salvate in Supabase")
}
function openCompanyModal(name=""){
 openModal(`<h2>${name?"Azienda target":"Aggiungi azienda"}</h2><div class="form-grid"><div class="full"><label>Nome</label><input id="company-name" value="${esc(name)}"></div><div><label>Tier</label><select id="company-tier"><option>A</option><option>B</option><option>C</option></select></div><div><label>Settore</label><input id="company-sector" placeholder="Tech, AI, Automotive..."></div><div class="full"><label>Note</label><textarea id="company-notes" rows="4"></textarea></div></div><div class="modal-actions"><button class="btn btn-primary" id="save-company">Salva</button></div>`);
 $("#save-company").onclick=async()=>{const n=$("#company-name").value.trim();if(!n)return notify("Inserisci il nome");if(state.usingDemo){defaultCompanies.unshift(n);notify("Azienda aggiunta alla demo");closeModal();renderCompanies();return}const{error}=await sb.from("companies").insert({user_id:state.user.id,name:n,tier:$("#company-tier").value,sector:$("#company-sector").value||null,notes:$("#company-notes").value||null});if(error)return notify(error.message);await loadData();closeModal();renderCompanies()}
}
function openFollowupModal(){
 openModal(`<h2>Nuovo follow-up</h2><label>Azione</label><input id="follow-action" placeholder="Es. Scrivere al recruiter"><label>Scadenza</label><input id="follow-date" type="datetime-local"><div class="modal-actions"><button class="btn btn-primary" id="save-follow">Salva follow-up</button></div>`);
 $("#save-follow").onclick=async()=>{const action=$("#follow-action").value.trim();if(!action)return notify("Inserisci un'azione");if(state.usingDemo){state.followups.push({action,due_at:$("#follow-date").value});closeModal();notify("Follow-up aggiunto");renderFollowups();return}const{error}=await sb.from("followups").insert({user_id:state.user.id,action,due_at:$("#follow-date").value||null});if(error)return notify(error.message);await loadData();closeModal();renderFollowups()}
}

async function login(){setMessage(message,"");const email=emailInput.value.trim(),password=passwordInput.value;if(!email||!password)return setMessage(message,"Inserisci email e password.","error");const{data,error}=await sb.auth.signInWithPassword({email,password});if(error)return setMessage(message,error.message==="Invalid login credentials"?"Email o password non corretti. Usa “Password dimenticata?” per reimpostarla.":error.message,"error");if(data.user)boot(data.user)}
async function signup(){setMessage(message,"");const email=emailInput.value.trim(),password=passwordInput.value;if(!email||password.length<8)return setMessage(message,"Inserisci email e password di almeno 8 caratteri.","error");const{data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:cfg.appUrl}});if(error)return setMessage(message,error.message,"error");if(data.session&&data.user)boot(data.user);else setMessage(message,"Se l'account è nuovo, controlla l'email di conferma.","success")}
async function forgot(){const email=emailInput.value.trim();if(!email)return setMessage(message,"Inserisci prima l'email.","error");const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:cfg.appUrl});setMessage(message,error?error.message:"Se l'account esiste, riceverai una email per cambiare password.",error?"error":"success")}
async function savePassword(){const p=$("#new-password").value;if(!p||p.length<8)return setMessage(resetMessage,"Minimo 8 caratteri.","error");const{error}=await sb.auth.updateUser({password:p});if(error)return setMessage(resetMessage,error.message,"error");history.replaceState({},document.title,location.pathname);const{data:{user}}=await sb.auth.getUser();if(user)boot(user)}
async function logout(){await sb.auth.signOut();showAuth()}

async function boot(user){
 state.user=user;showApp();userEmail.textContent=user.email||"";
 await loadData();
 const name=state.profile?.full_name?.split(" ")[0]||"";
 greeting.textContent=name?`Bentornato, ${name}! 👋`:"Bentornato! 👋";
 updateFitRing();renderPage("dashboard")
}

$("#login-btn").onclick=login;$("#signup-btn").onclick=signup;$("#forgot-btn").onclick=forgot;$("#save-password-btn").onclick=savePassword;$("#logout-btn").onclick=logout;
passwordInput.addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$$(".nav-item").forEach(b=>b.onclick=()=>renderPage(b.dataset.page));

let recoveryMode=false;
sb.auth.onAuthStateChange((event,session)=>{if(event==="PASSWORD_RECOVERY"){recoveryMode=true;showReset();return}if(recoveryMode)return;if(session?.user&&!state.user)boot(session.user);if(!session?.user)showAuth()});
(async()=>{const hash=new URLSearchParams(location.hash.replace(/^#/,"")),query=new URLSearchParams(location.search);const recovery=hash.get("type")==="recovery"||query.get("type")==="recovery";const{data:{session}}=await sb.auth.getSession();if(recovery&&session?.user){recoveryMode=true;showReset();return}if(session?.user)boot(session.user);else showAuth()})();
