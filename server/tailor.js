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
