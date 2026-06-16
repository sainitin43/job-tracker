// Fetch live jobs via an Apify actor (multi job board scraper).
// Requires APIFY_TOKEN in the environment. Without it, fetching is disabled.
import crypto from "crypto";

const ACTOR = process.env.APIFY_ACTOR || "openclawai/job-board-scraper";
const ACTOR_PATH = ACTOR.replace("/", "~");

export function apifyEnabled() {
  return !!process.env.APIFY_TOKEN;
}

function pick(obj, keys) {
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return obj[k];
  return "";
}

function moneySymbol(cur) {
  if (!cur || cur === "USD") return "$";
  if (cur === "GBP") return "£";
  if (cur === "EUR") return "€";
  return cur + " ";
}
function normalize(item) {
  const sym = moneySymbol(item.salary_currency);
  let pay = pick(item, ["salary", "salary_text", "compensation"]);
  if (!pay && (item.salary_min || item.salary_max)) {
    pay =
      `${sym}${item.salary_min || ""}` +
      (item.salary_max ? ` - ${sym}${item.salary_max}` : "") +
      (item.salary_interval ? ` / ${item.salary_interval}` : "");
  }
  const remote = item.is_remote ? "Remote · " : "";
  return {
    company: pick(item, ["company", "company_name", "companyName"]) || "Unknown",
    title: pick(item, ["title", "job_title", "position"]) || "Untitled role",
    url: pick(item, ["job_url_direct", "job_url", "url", "link", "apply_url"]),
    location: remote + (pick(item, ["location", "job_location", "city"]) || (item.is_remote ? "" : "")),
    type: pick(item, ["job_type", "employment_type", "jobType"]) || "Full-time",
    pay: pay || "",
    description: pick(item, ["description", "job_description", "descriptionText"]),
    source: pick(item, ["site", "source", "board"]) || "job board",
    datePosted: pick(item, ["date_posted", "posted_at", "datePosted"])
  };
}

export async function fetchJobs(prefs) {
  if (!apifyEnabled()) throw new Error("APIFY_TOKEN not configured");
  const input = {
    searchTerm: prefs.searchTerm || "Software Engineer",
    location: prefs.location || "United States",
    sites: prefs.sites && prefs.sites.length ? prefs.sites : ["linkedin", "indeed", "glassdoor"],
    maxResults: Math.min(Math.max(prefs.maxResults || 10, 1), 50),
    isRemote: !!prefs.isRemote,
    descriptionFormat: "markdown",
    linkedinFetchDescription: true
  };
  const url =
    `https://api.apify.com/v2/acts/${ACTOR_PATH}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(process.env.APIFY_TOKEN)}&timeout=290&memory=1024`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify run failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  // normalize + dedupe by company+title+url
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (it.__hint || !it.title || !it.company) continue; // skip status/no-result objects
    const n = normalize(it);
    const key = (n.company + "|" + n.title + "|" + n.url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: crypto.randomUUID(), ...n });
  }
  return out;
}
