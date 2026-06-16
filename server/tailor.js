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
