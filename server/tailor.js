import { BASE_RESUME, resumeToText } from "./resumeTemplate.js";

// ---- Strict ATS scoring -------------------------------------------------
const ATS_KEYWORDS = [
  "Java", "Kotlin", "JavaScript", "TypeScript", "Python", "Go", "C++", "C#", "Swift",
  "Android", "iOS", "Jetpack Compose", "MVVM", "MVI", "Coroutines", "Flow", "RxJava",
  "React", "Redux", "Angular", "Vue", "Node.js", "Spring Boot", "Express", "GraphQL", "REST",
  "Retrofit", "OkHttp", "Hilt", "Dagger", "Room", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "Kafka", "RabbitMQ", "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD",
  "Jenkins", "Maven", "Gradle", "Git", "Agile", "Scrum", "Microservices", "OAuth", "JWT",
  "JUnit", "Espresso", "Mockito", "Jest", "Cypress", "Playwright", "Selenium",
  "TensorFlow", "PyTorch", "Machine Learning", "LLM", "GenAI", "MediaPipe", "ML Kit", "CameraX",
  "Kotlin Multiplatform", "Compose Multiplatform", "WebSocket", "gRPC"
];

// Strict ATS score = % of keywords the JD asks for that actually appear in the resume.
export function atsScore(jobText, resumeText) {
  const jd = (jobText || "").toLowerCase();
  const asked = ATS_KEYWORDS.filter(k => jd.includes(k.toLowerCase()));
  if (asked.length === 0) return { score: null, matched: [], missing: [] };
  const rt = (resumeText || "").toLowerCase();
  const matched = asked.filter(k => rt.includes(k.toLowerCase()));
  const missing = asked.filter(k => !rt.includes(k.toLowerCase()));
  return { score: Math.round((matched.length / asked.length) * 100), matched, missing };
}

// ---- ATS gap analysis + fixer ------------------------------------------
function jobText(job) { return `${job.title || ""} ${job.description || ""}`; }

// What keywords the JD asks for that the resume is missing / already has.
export function analyzeGap(job, resumeText) {
  const r = atsScore(jobText(job), resumeText || "");
  return { ats: r.score, present: r.matched, missing: r.missing };
}

// Map each ATS keyword to the best-fitting skills line label.
const SKILL_BUCKETS = [
  { label: "Programming Languages", kws: ["Java", "Kotlin", "JavaScript", "TypeScript", "Python", "Go", "C++", "C#", "Swift"] },
  { label: "Android & Jetpack", kws: ["Android", "iOS", "Jetpack Compose", "MVVM", "MVI", "Coroutines", "Flow", "RxJava", "Retrofit", "OkHttp", "Hilt", "Dagger", "Room", "CameraX", "ML Kit", "MediaPipe", "Kotlin Multiplatform", "Compose Multiplatform"] },
  { label: "Full Stack & Web", kws: ["React", "Redux", "Angular", "Vue", "Node.js", "Spring Boot", "Express", "GraphQL", "REST", "WebSocket", "gRPC"] },
  { label: "Testing & Performance", kws: ["JUnit", "Espresso", "Mockito", "Jest", "Cypress", "Playwright", "Selenium"] },
  { label: "Security & Auth", kws: ["OAuth", "JWT"] },
  { label: "Cloud & DevOps", kws: ["AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD", "Jenkins", "Maven", "Gradle", "Git", "Microservices", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "Agile", "Scrum"] },
  { label: "AI & ML", kws: ["TensorFlow", "PyTorch", "Machine Learning", "LLM", "GenAI"] }
];

// Add missing keywords into the matching skills line (deterministic ATS win).
function injectSkills(skills, missing) {
  const next = (skills || []).map(s => ({ ...s }));
  const findLine = label => next.find(s => (s.label || "").toLowerCase() === label.toLowerCase());
  const leftovers = [];
  for (const kw of missing) {
    const bucket = SKILL_BUCKETS.find(b => b.kws.some(k => k.toLowerCase() === kw.toLowerCase()));
    let line = bucket ? findLine(bucket.label) : null;
    if (!line && bucket) { line = { label: bucket.label, value: "" }; next.push(line); }
    if (line) {
      if (!line.value.toLowerCase().includes(kw.toLowerCase())) line.value = line.value ? `${line.value}, ${kw}` : kw;
    } else leftovers.push(kw);
  }
  if (leftovers.length) {
    let extra = findLine("Additional Tools");
    if (!extra) { extra = { label: "Additional Tools", value: "" }; next.push(extra); }
    for (const kw of leftovers) if (!extra.value.toLowerCase().includes(kw.toLowerCase())) extra.value = extra.value ? `${extra.value}, ${kw}` : kw;
  }
  return next;
}

// LLM bullet-weave: rewrite experience bullets to truthfully incorporate the
// specific missing keywords where they genuinely fit. Falls back to heuristic.
async function weaveKeywords(experience, job, missing) {
  const prompt =
`Rewrite ONLY the bullet points of each experience entry so they truthfully incorporate as many of these MISSING ATS keywords as genuinely fit the candidate's existing work: ${missing.join(", ")}.
Rules:
- Keep the SAME company, location, title, dates, and the SAME number of bullets per entry.
- Stay 100% truthful: only re-word/re-emphasize the candidate's existing facts and technologies. Do NOT invent employers, tools, or experience that isn't already implied.
- Only add a keyword to a bullet where it is plausibly part of that work; never force-fit.
Return ONLY a JSON array: [{"company":"","location":"","title":"","dates":"","bullets":["",...]}]

TARGET JOB: ${job.title} @ ${job.company}
JOB DESCRIPTION:
${(job.description || "").slice(0, 4000)}

CURRENT EXPERIENCE (JSON):
${JSON.stringify(experience)}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error("Anthropic " + res.status + ": " + (await res.text()).slice(0, 140));
  const data = await res.json();
  let text = (data.content || []).map(c => c.text || "").join("").trim();
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a !== -1 && b !== -1) text = text.slice(a, b + 1);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.length || !parsed.every(e => Array.isArray(e.bullets) && e.bullets.length)) throw new Error("bad LLM shape");
  return experience.map((base, i) => ({ ...base, bullets: (parsed[i]?.bullets?.length ? parsed[i].bullets : base.bullets).map(String) }));
}

// Repair a possibly-malformed saved resume: guarantee each experience entry
// has company/location/title/dates (some older tailoring runs dropped them).
// Structural fields come from BASE_RESUME (by index); bullets/skills/contact
// are kept from the saved resume when present.
export function normalizeResume(rd) {
  if (!rd || !Array.isArray(rd.experience)) return rd || BASE_RESUME;
  // Structural fields (company/location/title/dates) are always taken from the
  // canonical BASE_RESUME by index, so corrections like employment dates apply
  // everywhere. Only the tailored bullets are carried over from the saved resume.
  const experience = BASE_RESUME.experience.map((b, i) => {
    const s = rd.experience[i] || {};
    return {
      company: b.company,
      location: b.location,
      title: b.title,
      dates: b.dates,
      bullets: (Array.isArray(s.bullets) && s.bullets.length ? s.bullets : b.bullets).map(String)
    };
  });
  return { ...BASE_RESUME, ...rd, experience };
}

// Fill ATS gaps: weave missing keywords into the resume (LLM if available,
// else deterministic skills-injection + relevance reorder), then re-score.
// Does NOT persist — client previews and confirms.
export async function fillGap(job, resumeData) {
  const base = normalizeResume(resumeData || BASE_RESUME);
  const before = atsScore(jobText(job), resumeToText(base)).score;
  const { missing } = analyzeGap(job, resumeToText(base));
  let experience = heuristicTailor(base.experience, job);
  let llm = false;
  if (process.env.ANTHROPIC_API_KEY && missing.length) {
    try { experience = await weaveKeywords(base.experience, job, missing); llm = true; }
    catch (e) { console.error("[gapfix] LLM weave failed, using heuristic:", e.message); experience = heuristicTailor(base.experience, job); }
  }
  const skills = injectSkills(base.skills, missing);
  const struct = { ...base, experience, skills };
  const text = resumeToText(struct);
  const after = atsScore(jobText(job), text);
  return { struct, text, before, ats: after.score, present: after.matched, missingRemaining: after.missing, llm };
}

// ---- Cold outreach to recruiters ---------------------------------------
function firstName(name) { return (name || "there").trim().split(/\s+/)[0]; }
function topSkills(profile, n = 4) {
  const s = (profile?.skills && profile.skills.length) ? profile.skills : ["Kotlin", "Android", "Java", "Spring Boot"];
  return s.slice(0, n).join(", ");
}
function outreachTemplate(ctx, profile, channel) {
  const fn = firstName(ctx.recruiter);
  const role = ctx.role || "the open role";
  const company = ctx.company || "your team";
  const me = profile?.name || "Candidate";
  const skills = topSkills(profile);
  if (channel === "linkedin") {
    return `Hi ${fn}, I saw your post about hiring for ${role}${ctx.company ? " at " + company : ""}. I'm a software engineer with hands-on experience in ${skills}, and it looks like a strong match. I'd love to be considered — happy to share my resume. Thanks for your time!`;
  }
  return `Subject: ${role} — ${me}

Hi ${fn},

I came across your post about hiring for ${role}${ctx.company ? " at " + company : ""} and wanted to reach out directly. I'm a software engineer with hands-on experience in ${skills}, and my background lines up closely with what you're looking for.

I'd welcome the chance to be considered — I've attached a tailored resume and would be glad to share more or set up a quick call.

Best regards,
${me}`;
}
export async function coldOutreach(ctx, profile, channel) {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await coldWithClaude(ctx, profile, channel); }
    catch (e) { console.error("[outreach] LLM failed, using template:", e.message); }
  }
  return outreachTemplate(ctx, profile, channel);
}
async function coldWithClaude(ctx, profile, channel) {
  const kind = channel === "linkedin" ? "a concise LinkedIn connection message (max 90 words, no subject line)" : "a short cold email (with a Subject: line, under 160 words)";
  const prompt =
`Write ${kind} from a job seeker to a recruiter who posted that they are hiring. Be warm, specific, and confident — not generic. Reference the role and company. Highlight 2-3 of the candidate's most relevant skills. End with a clear ask to be considered. Output ONLY the message text.

RECRUITER: ${ctx.recruiter || ""}
COMPANY: ${ctx.company || ""}
ROLE: ${ctx.role || ""}
POST: ${(ctx.text || "").slice(0, 800)}

CANDIDATE NAME: ${profile?.name || ""}
CANDIDATE SKILLS: ${(profile?.skills || []).join(", ")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: 500, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error("Anthropic " + res.status);
  const data = await res.json();
  const text = (data.content || []).map(c => c.text || "").join("").trim();
  if (!text) throw new Error("empty");
  return text;
}

// ---- Cover letter -------------------------------------------------------
function coverLetterTemplate(job, profile) {
  const me = profile?.name || "Candidate";
  const role = job.title || "the open role";
  const company = job.company || "your company";
  const skills = topSkills(profile, 4);
  return `Dear Hiring Team,

I'm writing to apply for the ${role} position at ${company}. The role aligns closely with my background, and I'm confident I can contribute from day one.

In my recent work I have delivered production software using ${skills}, focusing on reliability, performance, and clean, well-tested code. I take ownership of features end to end — from design through deployment — and consistently ship measurable improvements such as reduced latency, higher test coverage, and fewer production defects.

What draws me to ${company} is the chance to apply this experience to ${role}, and I'm excited by the opportunity to help your team build software that scales. I'd welcome the chance to discuss how my skills map to your needs.

Thank you for your time and consideration.

Sincerely,
${me}`;
}

async function coverLetterWithClaude(job, profile) {
  const prompt =
`Write a concise, professional cover letter (180-240 words) from a job seeker applying to the role below. Be specific and confident, not generic. Reference the role and company, highlight 2-3 of the candidate's most relevant skills/achievements, and stay 100% truthful (do not invent employers or experience). Use the format: "Dear Hiring Team," ... "Sincerely," then the candidate's name. Output ONLY the letter text.

ROLE: ${job.title} @ ${job.company}
LOCATION: ${job.location || ""}
JOB DESCRIPTION:
${(job.description || "").slice(0, 3500)}

CANDIDATE NAME: ${profile?.name || ""}
CANDIDATE SKILLS: ${(profile?.skills || []).join(", ")}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: 700, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error("Anthropic " + res.status + ": " + (await res.text()).slice(0, 140));
  const data = await res.json();
  const text = (data.content || []).map(c => c.text || "").join("").trim();
  if (!text) throw new Error("empty");
  return text;
}

export async function coverLetter(job, profile) {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return { text: await coverLetterWithClaude(job, profile), llm: true }; }
    catch (e) { console.error("[coverletter] LLM failed, using template:", e.message); }
  }
  return { text: coverLetterTemplate(job, profile), llm: false };
}

// Match scoring + template-based ATS resume tailoring (no external LLM).

const DEFAULT_SKILLS = [
  "Java", "Kotlin", "Android", "Jetpack Compose", "Coroutines", "Flow", "MVVM", "MVI",
  "REST", "GraphQL", "Retrofit", "OkHttp", "Room", "SQL", "Spring Boot",
  "Microservices", "Docker", "Kubernetes", "AWS", "CI/CD", "JUnit", "Espresso", "Mockito",
  "OAuth", "JWT", "Kafka", "Redis", "Git", "Agile", "Scrum"
];

function skillsFor(profile) {
  if (profile?.skills?.length) return profile.skills;
  // derive from a base resume if present (capitalized tech words), else defaults
  return DEFAULT_SKILLS;
}

export function scoreMatch(job, profile) {
  const skills = skillsFor(profile);
  const hay = `${job.title} ${job.description}`.toLowerCase();
  const matched = skills.filter(s => hay.includes(s.toLowerCase()));
  const titleHit = (profile?.searchTerm || "").toLowerCase()
    ? job.title.toLowerCase().includes((profile.searchTerm || "").toLowerCase()) : false;
  let score = skills.length ? Math.round((matched.length / skills.length) * 100) : 0;
  if (titleHit) score = Math.min(100, score + 10);
  // floor a little so partial matches still read sensibly
  score = Math.max(score, matched.length ? 35 : 10);
  return { score: Math.min(score, 100), matched, missing: skills.filter(s => !matched.includes(s)) };
}

export function tailorResume(job, profile, match) {
  const name = profile?.name || "YOUR NAME";
  const matched = (match?.matched || []).join(", ");
  const base = profile?.baseResume?.trim();

  const header = `${name}
Target: ${job.title} — ${job.company}${job.location ? " (" + job.location + ")" : ""}

PROFESSIONAL SUMMARY
Engineer aligned to ${job.company}'s ${job.title} role. Strengths matched to this posting: ${matched || "core engineering skills"}.

ATS KEYWORDS (from this job description)
${matched || "Add the job's key skills here."}
`;

  if (base) return header + "\n" + base;

  return header + `
EXPERIENCE
- Add your most relevant, quantified achievements here, emphasizing the matched keywords above.

SKILLS
${(match?.matched || []).concat(match?.missing || []).join(", ")}

EDUCATION
Your education here.`;
}

// LLM-tailored resume via Anthropic (Claude). Falls back to template if no key/error.
export async function tailorResumeSmart(job, profile, match) {
  if (!process.env.ANTHROPIC_API_KEY) return tailorResume(job, profile, match);
  try {
    return await tailorWithClaude(job, profile, match);
  } catch (e) {
    console.error("[tailor] LLM failed, using template:", e.message);
    return tailorResume(job, profile, match);
  }
}

// Build a full structured resume = base template with ONLY the experience
// bullets tailored to the job. Other sections stay verbatim. Returns { struct, text }.
export async function buildTailoredResume(job, profile, match, opts = {}) {
  const struct = { ...BASE_RESUME, experience: await tailorExperience(job, match, opts.strong) };
  return { struct, text: resumeToText(struct) };
}

// Keywords this specific JD cares about (from the ATS dictionary).
function jdKeywords(job) {
  const text = `${job.title || ""} ${job.description || ""}`.toLowerCase();
  return ATS_KEYWORDS.filter(k => text.includes(k.toLowerCase()));
}
// No-LLM tailoring: reorder each role's bullets so the ones matching THIS job's
// keywords surface first. Honest (no fabrication) and genuinely different per job.
function heuristicTailor(experience, job) {
  const kws = jdKeywords(job);
  if (!kws.length) return experience;
  const score = b => kws.reduce((n, k) => n + (b.toLowerCase().includes(k.toLowerCase()) ? 1 : 0), 0);
  return experience.map(e => ({
    ...e,
    bullets: e.bullets
      .map((b, i) => ({ b, i, s: score(b) }))
      .sort((a, z) => z.s - a.s || a.i - z.i)   // most-relevant first, stable otherwise
      .map(x => x.b)
  }));
}

async function tailorExperience(job, match, strong = false) {
  if (!process.env.ANTHROPIC_API_KEY) return heuristicTailor(BASE_RESUME.experience, job);
  try {
    const strongLine = strong
      ? "\n- Make every bullet HIGHLY TECHNICAL and dense: lead with a strong action verb, name concrete tools/frameworks/protocols, and include a quantified impact (%, latency, scale) where the candidate's facts support it. Maximize ATS keyword coverage aggressively while staying truthful."
      : "";
    const prompt =
`Tailor ONLY the bullet points of each experience entry to the target job below, to maximize ATS keyword match. Rules:
- Keep the SAME company, location, title, and dates for each entry.
- Keep the SAME number of bullets per entry.
- Stay 100% truthful: only re-emphasize, reorder, and re-word the candidate's existing facts/technologies; do NOT invent employers, tools, or experience not already present.
- Mirror the job's terminology where it genuinely overlaps with the candidate's work.${strongLine}
Return ONLY a JSON array with this exact shape: [{"company":"","location":"","title":"","dates":"","bullets":["",...]}]

TARGET JOB TITLE: ${job.title} @ ${job.company}
TARGET JOB DESCRIPTION:
${(job.description || "").slice(0, 4500)}

CURRENT EXPERIENCE (JSON):
${JSON.stringify(BASE_RESUME.experience)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
    });
    if (!res.ok) throw new Error("Anthropic " + res.status + ": " + (await res.text()).slice(0, 140));
    const data = await res.json();
    let text = (data.content || []).map(c => c.text || "").join("").trim();
    const a = text.indexOf("["), b = text.lastIndexOf("]");
    if (a !== -1 && b !== -1) text = text.slice(a, b + 1);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(e => Array.isArray(e.bullets) && e.bullets.length)) {
      throw new Error("bad LLM shape");
    }
    // keep base company/title/dates, take tailored bullets
    return BASE_RESUME.experience.map((base, i) => ({
      ...base,
      bullets: (parsed[i] && parsed[i].bullets && parsed[i].bullets.length ? parsed[i].bullets : base.bullets).map(String)
    }));
  } catch (e) {
    console.error("[tailor] experience LLM failed, using heuristic reorder:", e.message);
    return heuristicTailor(BASE_RESUME.experience, job);
  }
}

async function tailorWithClaude(job, profile, match) {
  const base = (profile?.baseResume || "").trim() || "(No base resume on file — write a strong, truthful resume from the matched skills.)";
  const prompt =
`You are an expert ATS resume writer. Tailor the candidate's resume to this specific job to MAXIMIZE ATS keyword match while staying 100% truthful (never invent employers, titles, or experience the candidate doesn't have). Mirror the job's terminology. Output ONLY the final resume as clean plain text (no markdown tables, no commentary).

=== JOB ===
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || ""}
Description:
${(job.description || "").slice(0, 5000)}

=== CANDIDATE BASE RESUME ===
${base.slice(0, 5000)}

=== SKILLS TO EMPHASIZE (already present in candidate background) ===
${(match?.matched || []).join(", ") || "core engineering skills"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map(c => c.text || "").join("\n").trim();
  if (!text) throw new Error("empty LLM response");
  return text;
}
