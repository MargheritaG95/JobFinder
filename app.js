const cfg = window.JOBFINDER_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

const authCard = document.getElementById("auth-card");
const dashboardCard = document.getElementById("dashboard-card");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const welcome = document.getElementById("welcome");

function showMessage(text) {
  message.textContent = text || "";
}

function showLoggedIn(user) {
  authCard.classList.add("hidden");
  dashboardCard.classList.remove("hidden");
  welcome.textContent = `Accesso effettuato come ${user.email}.`;
}

function showLoggedOut() {
  dashboardCard.classList.add("hidden");
  authCard.classList.remove("hidden");
}

async function login() {
  showMessage("");
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Inserisci email e password.");
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(error.message === "Invalid login credentials"
      ? "Email o password non corretti."
      : error.message);
    return;
  }

  if (data.user) showLoggedIn(data.user);
}

async function signup() {
  showMessage("");
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Inserisci email e password.");
    return;
  }

  if (password.length < 8) {
    showMessage("La password deve avere almeno 8 caratteri.");
    return;
  }

  const { data, error } = await sb.auth.signUp({ email, password });

  if (error) {
    showMessage(error.message);
    return;
  }

  if (data.session && data.user) {
    showLoggedIn(data.user);
  } else {
    showMessage("Account creato. Se Supabase richiede conferma email, completa la conferma e poi accedi.");
  }
}

async function logout() {
  await sb.auth.signOut();
  showLoggedOut();
}

document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("signup-btn").addEventListener("click", signup);
document.getElementById("logout-btn").addEventListener("click", logout);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session?.user) showLoggedIn(session.user);
  else showLoggedOut();
});

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) showLoggedIn(session.user);
  else showLoggedOut();
})();
