const cfg = window.JOBFINDER_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

const authCard = document.getElementById("auth-card");
const resetCard = document.getElementById("reset-card");
const dashboardCard = document.getElementById("dashboard-card");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const resetMessage = document.getElementById("reset-message");
const welcome = document.getElementById("welcome");
const pageTitle = document.getElementById("page-title");
const pageContent = document.getElementById("page-content");

const sampleJobs = [
  {company:"Banca Generali",role:"AI Product Manager",location:"Milano",fit:9.6,priority:"APPLY",status:"NEW"},
  {company:"Generali",role:"Group CRM & Customer Engagement Senior Professional",location:"Milano",fit:9.5,priority:"APPLY",status:"REVIEW"},
  {company:"Lutech",role:"AI Strategy & Adoption Consultant",location:"Milano",fit:9.2,priority:"APPLY",status:"APPLY"},
  {company:"Harvey",role:"Enterprise Account Executive",location:"Milano",fit:9.0,priority:"APPLY",status:"APPLIED"},
  {company:"DAZN",role:"Senior Product Manager, Growth",location:"Milano",fit:8.7,priority:"APPLY",status:"REVIEW"},
  {company:"MotorK",role:"Customer Success Manager Automotive",location:"Milano",fit:8.8,priority:"REVIEW",status:"CONTACTED"}
];

function setMessage(el,text,type=""){el.textContent=text||"";el.className="message"+(type?` ${type}`:"");if(!text)el.classList.add("hidden")}
function showAuth(){authCard.classList.remove("hidden");resetCard.classList.add("hidden");dashboardCard.classList.add("hidden")}
function showReset(){authCard.classList.add("hidden");resetCard.classList.remove("hidden");dashboardCard.classList.add("hidden")}
function showDashboard(user){authCard.classList.add("hidden");resetCard.classList.add("hidden");dashboardCard.classList.remove("hidden");welcome.textContent=user.email||"utente";renderPage("home")}

function jobRows(){return sampleJobs.map(j=>`<div class="job"><div><h3>${j.role}</h3><div class="muted">${j.company} · ${j.location}</div><div style="margin-top:8px"><span class="pill">${j.priority}</span><span class="pill">${j.status}</span></div></div><div class="fit">${j.fit.toFixed(1)}/10</div></div>`).join("")}

function renderPage(page){
  document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const titles={home:"Dashboard",opportunities:"Opportunità",pipeline:"Pipeline",companies:"Aziende target",preferences:"Preferenze di ricerca"};
  pageTitle.textContent=titles[page]||"Dashboard";

  if(page==="home"){
    const counts={apply:sampleJobs.filter(j=>j.priority==="APPLY").length,applied:sampleJobs.filter(j=>j.status==="APPLIED").length,contacted:sampleJobs.filter(j=>j.status==="CONTACTED").length};
    pageContent.innerHTML=`<div class="grid kpis">
      <div class="card-ui kpi"><div class="muted small">OPPORTUNITÀ ALTO FIT</div><div class="num">${sampleJobs.length}</div></div>
      <div class="card-ui kpi"><div class="muted small">APPLY</div><div class="num">${counts.apply}</div></div>
      <div class="card-ui kpi"><div class="muted small">CANDIDATURE</div><div class="num">${counts.applied}</div></div>
      <div class="card-ui kpi"><div class="muted small">CONTATTI</div><div class="num">${counts.contacted}</div></div>
    </div>
    <div class="grid panel-grid">
      <section class="card-ui"><h2>Top opportunità</h2><div class="job-list">${jobRows()}</div></section>
      <section class="card-ui"><h2>Application Copilot</h2><p class="muted">Priorità di oggi</p>
        <div class="job-list">
          <div class="job"><div><h3>1. Banca Generali</h3><div class="muted">Prepara CV AI/Product + messaggio recruiter.</div></div><div class="fit">9.6</div></div>
          <div class="job"><div><h3>2. Generali</h3><div class="muted">Adatta CV CX/CRM e verifica contatti interni.</div></div><div class="fit">9.5</div></div>
          <div class="job"><div><h3>3. Lutech</h3><div class="muted">Posiziona esperienza transformation + AI.</div></div><div class="fit">9.2</div></div>
        </div>
      </section>
    </div>`;
  } else if(page==="opportunities"){
    pageContent.innerHTML=`<section class="card-ui"><div class="actions" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">Opportunità consigliate</h2><p class="muted">Mostriamo solo ruoli con Fit Score ≥ 7/10.</p></div><button class="btn primary-sm">+ Aggiungi opportunità</button></div><div class="job-list">${jobRows()}</div></section>`;
  } else if(page==="pipeline"){
    pageContent.innerHTML=`<section class="card-ui"><h2>Pipeline candidature</h2><table class="table"><thead><tr><th>Azienda</th><th>Ruolo</th><th>Fit</th><th>Stato</th></tr></thead><tbody>${sampleJobs.map(j=>`<tr><td>${j.company}</td><td>${j.role}</td><td>${j.fit.toFixed(1)}</td><td class="status ${j.status}">${j.status}</td></tr>`).join("")}</tbody></table></section>`;
  } else if(page==="companies"){
    const companies=["Anthropic","Bending Spoons","Salesforce","Docebo","MotorK","DAZN","Banca Generali","Generali","Lutech","Geotab"];
    pageContent.innerHTML=`<div class="grid pref-grid">${companies.map((c,i)=>`<section class="card-ui"><span class="pill">Tier ${i<4?"A":i<8?"B":"C"}</span><h3>${c}</h3><p class="muted">Target company monitorata per ruoli ad alto fit.</p><button class="btn">Apri scheda</button></section>`).join("")}</div>`;
  } else if(page==="preferences"){
    pageContent.innerHTML=`<section class="card-ui"><h2>Preferenze di ricerca</h2><p class="muted">Valori iniziali demo: puoi modificarli direttamente qui. In questa build restano salvati nel browser.</p>
      <div class="grid pref-grid">
        <div><label>Ruoli target</label><textarea id="roles">Customer Experience, Business Strategy, Sales Ops, RevOps, Customer Insights, Business Analytics, AI Strategy, AI Product, AI Project, Customer Success</textarea></div>
        <div><label>Settori</label><textarea id="industries">Tech, AI, Automotive, Motorsport, Motorcycle, Classic Cars, Gaming</textarea></div>
        <div><label>Località</label><textarea id="locations">Milano, Remote Italy, EU</textarea></div>
        <div><label>Modalità di lavoro</label><textarea id="modes">Hybrid, Remote</textarea></div>
        <div><label>Fit Score minimo</label><input id="minfit" type="number" min="0" max="10" step="0.1" value="7.0"></div>
        <div><label>AI learning</label><div class="switchline"><span>Attivo</span><input id="learning" type="checkbox" checked style="width:auto"></div></div>
      </div>
      <div class="actions" style="margin-top:16px"><button class="btn primary-sm" id="save-prefs">Salva preferenze</button><span id="prefs-msg" class="muted"></span></div>
    </section>`;
    const saved=JSON.parse(localStorage.getItem("jobfinder_prefs")||"null");
    if(saved){roles.value=saved.roles;industries.value=saved.industries;locations.value=saved.locations;modes.value=saved.modes;minfit.value=saved.minfit;learning.checked=saved.learning}
    document.getElementById("save-prefs").onclick=()=>{localStorage.setItem("jobfinder_prefs",JSON.stringify({roles:roles.value,industries:industries.value,locations:locations.value,modes:modes.value,minfit:minfit.value,learning:learning.checked}));document.getElementById("prefs-msg").textContent="Preferenze salvate."};
  }
}

async function login(){setMessage(message,"");const email=emailInput.value.trim(),password=passwordInput.value;if(!email||!password){setMessage(message,"Inserisci email e password.","error");return}const{data,error}=await sb.auth.signInWithPassword({email,password});if(error){setMessage(message,error.message==="Invalid login credentials"?"Email o password non corretti. Usa “Password dimenticata?” per reimpostarla.":error.message,"error");return}if(data.user)showDashboard(data.user)}
async function signup(){setMessage(message,"");const email=emailInput.value.trim(),password=passwordInput.value;if(!email||!password){setMessage(message,"Inserisci email e password.","error");return}if(password.length<8){setMessage(message,"La password deve avere almeno 8 caratteri.","error");return}const{data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:cfg.appUrl}});if(error){setMessage(message,error.message,"error");return}if(data.session&&data.user)showDashboard(data.user);else setMessage(message,"Richiesta ricevuta. Se l'account è nuovo, controlla l'email di conferma.","success")}
async function forgotPassword(){setMessage(message,"");const email=emailInput.value.trim();if(!email){setMessage(message,"Inserisci prima l'indirizzo email.","error");return}const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:cfg.appUrl});if(error){setMessage(message,error.message,"error");return}setMessage(message,"Se l'account esiste, riceverai una email per impostare una nuova password.","success")}
async function saveNewPassword(){setMessage(resetMessage,"");const password=document.getElementById("new-password").value;if(!password||password.length<8){setMessage(resetMessage,"La nuova password deve avere almeno 8 caratteri.","error");return}const{error}=await sb.auth.updateUser({password});if(error){setMessage(resetMessage,error.message,"error");return}history.replaceState({},document.title,window.location.pathname);const{data:{user}}=await sb.auth.getUser();if(user)showDashboard(user);else showAuth()}
async function logout(){await sb.auth.signOut();showAuth()}

document.getElementById("login-btn").onclick=login;
document.getElementById("signup-btn").onclick=signup;
document.getElementById("forgot-btn").onclick=forgotPassword;
document.getElementById("save-password-btn").onclick=saveNewPassword;
document.getElementById("logout-btn").onclick=logout;
passwordInput.addEventListener("keydown",e=>{if(e.key==="Enter")login()});
document.querySelectorAll(".nav").forEach(btn=>btn.onclick=()=>renderPage(btn.dataset.page));

let recoveryMode=false;
sb.auth.onAuthStateChange((event,session)=>{if(event==="PASSWORD_RECOVERY"){recoveryMode=true;showReset();return}if(recoveryMode)return;if(session?.user)showDashboard(session.user);else showAuth()});

(async()=>{const hash=new URLSearchParams(location.hash.replace(/^#/,""));const query=new URLSearchParams(location.search);const recoveryHint=hash.get("type")==="recovery"||query.get("type")==="recovery";const{data:{session}}=await sb.auth.getSession();if(recoveryHint&&session?.user){recoveryMode=true;showReset();return}if(session?.user)showDashboard(session.user);else showAuth()})();
