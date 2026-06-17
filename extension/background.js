// Service worker: the single gateway to the Job Tracker backend.
// Content script + popup talk only to this worker (avoids page CORS issues).
// To point at a deployed backend, change API_BASE and the host_permissions in manifest.json.
const API_BASE = "http://localhost:4000/api";
const GOOGLE_CLIENT_ID = "400407178471-aldf00pvmnsbo41lg8sfsvv1eip7mu0o.apps.googleusercontent.com";

async function getToken() {
  const { jt_token } = await chrome.storage.local.get("jt_token");
  return jt_token || null;
}

async function api(method, path, body) {
  const token = await getToken();
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
  return data;
}

async function login(email, password) {
  const data = await api("POST", "/auth/login", { email, password });
  await chrome.storage.local.set({ jt_token: data.token, jt_user: data.user });
  return { user: data.user };
}

async function googleLogin() {
  const redirectUri = chrome.identity.getRedirectURL(); // https://<extension-id>.chromiumapp.org/
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    prompt: "select_account",
    nonce: Math.random().toString(36).slice(2) + Date.now()
  });
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  const redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirect) throw new Error("Google sign-in was cancelled");
  const hash = redirect.split("#")[1] || redirect.split("?")[1] || "";
  const idToken = new URLSearchParams(hash).get("id_token");
  if (!idToken) throw new Error("No Google token returned");
  const data = await api("POST", "/auth/google", { credential: idToken });
  await chrome.storage.local.set({ jt_token: data.token, jt_user: data.user });
  return { user: data.user };
}

async function session() {
  const token = await getToken();
  if (!token) return { user: null };
  try {
    const data = await api("GET", "/auth/me");
    await chrome.storage.local.set({ jt_user: data.user });
    return { user: data.user };
  } catch {
    await chrome.storage.local.remove(["jt_token", "jt_user"]);
    return { user: null };
  }
}

// Fetch a PDF (with auth) and return it as a base64 data URL so the content
// script can build a File and attach it to a page's <input type=file>.
async function resumeDataUrl(path) {
  const token = await getToken();
  const res = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error("Resume download failed (" + res.status + ")");
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  return { dataUrl: "data:application/pdf;base64," + btoa(bin), filename: (m && m[1]) || "resume.pdf" };
}

async function handle(msg) {
  switch (msg.type) {
    case "login": return login(msg.email, msg.password);
    case "google": return googleLogin();
    case "logout": await chrome.storage.local.remove(["jt_token", "jt_user"]); return { ok: true };
    case "session": return session();
    case "api": return api(msg.method, msg.path, msg.body);
    case "resume": return resumeDataUrl(msg.path);
    default: throw new Error("Unknown message: " + msg.type);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse).catch(e => sendResponse({ error: e.message }));
  return true; // async response
});
