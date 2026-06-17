const DASHBOARD_URL = "http://localhost:5173/";
const $ = id => document.getElementById(id);
const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, res));

function show(loggedIn, user) {
  $("loggedOut").classList.toggle("hidden", loggedIn);
  $("loggedIn").classList.toggle("hidden", !loggedIn);
  if (loggedIn && user) $("whoEmail").textContent = user.email;
}

async function refresh() {
  const { user } = await send({ type: "session" });
  show(!!user, user);
  const r = await send({ type: "redirectUri" });
  if (r && r.uri) {
    const c = $("redirUri");
    c.textContent = r.uri;
    c.addEventListener("click", () => navigator.clipboard?.writeText(r.uri).then(() => { c.dataset.copied = "1"; c.textContent = r.uri + "  ✓ copied"; }));
  }
}

$("loginBtn").addEventListener("click", async () => {
  $("err").textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) { $("err").textContent = "Enter email and password."; return; }
  $("loginBtn").textContent = "Signing in…";
  const r = await send({ type: "login", email, password });
  $("loginBtn").textContent = "Log in";
  if (r.error) { $("err").textContent = r.error; return; }
  show(true, r.user);
});

$("googleBtn").addEventListener("click", async () => {
  $("err").textContent = "";
  $("googleBtn").disabled = true;
  const prev = $("googleBtn").innerHTML;
  $("googleBtn").textContent = "Opening Google…";
  const r = await send({ type: "google" });
  $("googleBtn").disabled = false;
  $("googleBtn").innerHTML = prev;
  if (r.error) { $("err").textContent = r.error; return; }
  show(true, r.user);
});

$("password").addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
$("logoutBtn").addEventListener("click", async () => { await send({ type: "logout" }); show(false); });
$("dashBtn").addEventListener("click", () => chrome.tabs.create({ url: DASHBOARD_URL }));

refresh();
