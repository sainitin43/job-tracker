// Fetch recruiter "we're hiring" posts via an Apify actor.
// Requires APIFY_TOKEN. Actor: apt_marble/linkedin-hiring-posts-scraper
import crypto from "crypto";

const ACTOR = process.env.RECRUITER_ACTOR || "apt_marble/linkedin-hiring-posts-scraper";
const ACTOR_PATH = ACTOR.replace("/", "~");

export function recruitersEnabled() {
  return !!process.env.APIFY_TOKEN;
}

function pick(o, keys) {
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return "";
}

function normalize(item) {
  return {
    recruiter: pick(item, ["recruiterName", "authorName", "author", "name", "posterName"]) || "Recruiter",
    recruiterUrl: pick(item, ["authorUrl", "profileUrl", "recruiterUrl", "authorProfileUrl"]),
    company: pick(item, ["company", "companyName", "hiringCompany"]) || "",
    role: pick(item, ["role", "jobRole", "targetRole", "title"]) || "",
    location: pick(item, ["location", "jobLocation", "city"]) || "",
    text: pick(item, ["postText", "text", "content", "description", "post"]) || "",
    url: pick(item, ["postUrl", "url", "link", "post_url"]),
    postedDate: pick(item, ["postedDate", "date", "postedAt", "time"]) || "",
    score: Number(pick(item, ["hiringScore", "hiringIntentScore", "intentScore", "score"])) || null
  };
}

export async function fetchRecruiterPosts(prefs) {
  if (!recruitersEnabled()) throw new Error("APIFY_TOKEN not configured");
  const input = {
    hiringKeywords: ["we are hiring", "looking for", "join our team", "now hiring", "open position"],
    jobRoles: prefs.jobRoles && prefs.jobRoles.length ? prefs.jobRoles : ["Software Engineer"],
    keywords: prefs.keywords || [],
    locations: prefs.locations && prefs.locations.length ? prefs.locations : ["United States"],
    maxResults: Math.min(Math.max(prefs.maxResults || 10, 1), 25),
    language: "en",
    deduplicateResults: true
  };
  const url =
    `https://api.apify.com/v2/acts/${ACTOR_PATH}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(process.env.APIFY_TOKEN)}&timeout=290&memory=1024`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Apify run failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (it.__hint) continue;
    const n = normalize(it);
    if (!n.url && !n.text) continue;
    const key = (n.url || n.recruiter + n.company + n.role).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: crypto.randomUUID(), ...n });
  }
  return out;
}
