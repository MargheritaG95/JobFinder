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

function setMessage(el, text, type = "") {
  el.textContent = text || "";
  el.className = "message" + (type ? ` ${type}` : "");
  if (!text) el.classList.add("hidden");
}

function showAuth() {
  authCard.classList.remove("hidden");
  resetCard.classList.add("hidden");
  dashboardCard.classList.add("hidden");
}

function showReset() {
  authCard.classList.add("hidden");
  resetCard.classList.remove("hidden");
  dashboardCard.classList.add("hidden");
}

function showDashboard(user) {
  authCard.classList.add("hidden");
  resetCard.classList.add("hidden");
  dashboardCard.classList.remove("hidden");
  welcome.textContent = `Accesso effettuato come ${user.email || "utente"}.`;
}

async function login() {
  setMessage(message, "");
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage(message, "Inserisci email e password.", "error");
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message === "Invalid login credentials") {
      setMessage(
        message,
        "Email o password non corretti. Supabase non specifica quale dei due sia errato. Puoi usare “Password dimenticata?” oppure accedere con Google se il tuo account usa Google.",
        "error"
      );
    } else {
      setMessage(message, error.message, "error");
    }
    return;
  }

  if (data.user) showDashboard(data.user);
}

async function signup() {
  setMessage(message, "");
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage(message, "Inserisci email e password.", "error");
    return;
  }
  if (password.length < 8) {
    setMessage(message, "La password deve avere almeno 8 caratteri.", "error");
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: cfg.appUrl }
  });

  if (error) {
    setMessage(message, error.message, "error");
    return;
  }

  const identities = data?.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    setMessage(
      message,
      "Questo indirizzo potrebbe essere già registrato. Per sicurezza Supabase non conferma se un account esiste. Prova ad accedere, usare “Password dimenticata?” oppure Google.",
      "error"
    );
    return;
  }

  if (data.session && data.user) {
    setMessage(message, "Account creato e accesso effettuato.", "success");
    showDashboard(data.user);
  } else {
    setMessage(
      message,
      "Richiesta ricevuta. Se l'account è nuovo, riceverai una email di conferma. Dopo la conferma potrai accedere con email e password.",
      "success"
    );
  }
}

async function forgotPassword() {
  setMessage(message, "");
  const email = emailInput.value.trim();

  if (!email) {
    setMessage(message, "Inserisci prima l'indirizzo email da recuperare.", "error");
    return;
  }

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: cfg.appUrl
  });

  if (error) {
    setMessage(message, error.message, "error");
    return;
  }

  setMessage(
    message,
    "Se esiste un account associato a questa email, riceverai un messaggio per impostare una nuova password. Usa solo l'email più recente.",
    "success"
  );
}

async function googleLogin() {
  setMessage(message, "");
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: cfg.appUrl,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });

  if (error) {
    setMessage(
      message,
      error.message.includes("provider is not enabled")
        ? "Google non è ancora abilitato nel progetto Supabase. Va attivato una volta in Authentication → Providers → Google."
        : error.message,
      "error"
    );
  }
}

async function saveNewPassword() {
  setMessage(resetMessage, "");
  const password = document.getElementById("new-password").value;

  if (!password || password.length < 8) {
    setMessage(resetMessage, "La nuova password deve avere almeno 8 caratteri.", "error");
    return;
  }

  const { error } = await sb.auth.updateUser({ password });

  if (error) {
    setMessage(resetMessage, error.message, "error");
    return;
  }

  setMessage(resetMessage, "Password aggiornata correttamente.", "success");
  history.replaceState({}, document.title, window.location.pathname);
  setTimeout(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (user) showDashboard(user);
    else showAuth();
  }, 600);
}

async function logout() {
  await sb.auth.signOut();
  showAuth();
}

document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("signup-btn").addEventListener("click", signup);
document.getElementById("forgot-btn").addEventListener("click", forgotPassword);
document.getElementById("google-btn").addEventListener("click", googleLogin);
document.getElementById("save-password-btn").addEventListener("click", saveNewPassword);
document.getElementById("logout-btn").addEventListener("click", logout);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

let recoveryMode = false;

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    showReset();
    return;
  }

  if (recoveryMode) return;

  if (session?.user) showDashboard(session.user);
  else showAuth();
});

(async () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const recoveryHint = hash.get("type") === "recovery" || query.get("type") === "recovery";

  const { data: { session } } = await sb.auth.getSession();

  if (recoveryHint && session?.user) {
    recoveryMode = true;
    showReset();
    return;
  }

  if (session?.user) showDashboard(session.user);
  else showAuth();
})();
