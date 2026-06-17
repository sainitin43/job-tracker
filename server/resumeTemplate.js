// Structured base resume. Tailoring changes ONLY the experience bullets;
// every other section is rendered verbatim from here.
export const BASE_RESUME = {
  name: "SAI NITHIN P",
  contact: "Sunnyvale, CA | (804) 484-5154 | mailmenithin1317@gmail.com | linkedin.com/in/nithin-1317-p",
  experience: [
    {
      company: "WALMART",
      location: "Sunnyvale, CA",
      title: "Software Engineer III",
      dates: "Aug 2024 - Feb 2026",
      bullets: [
        "Owned Android Cart and Checkout on high-traffic purchase paths serving millions of daily users, modeling lifecycle-safe UI state that survives process death, configuration changes, and low-memory conditions, eliminating ~90% of cart and payment state-corruption defects.",
        "Re-architected checkout with state-driven MVVM and explicit UI state machines, preventing duplicate charges and lost-cart data and cutting lifecycle-related crashes by 40%.",
        "Migrated core checkout screens to Jetpack Compose with a shared design system, reducing UI code by ~30% and accelerating feature delivery across squads.",
        "Integrated Apollo GraphQL APIs, shaping queries to minimize payload and stabilize pagination, lowering checkout API latency by 25% while tolerating partial backend failures.",
        "Applied Kotlin Coroutines and StateFlow for structured concurrency across cart, pricing, and payment updates, eliminating race conditions and flaky UI states.",
        "Profiled with the Android Studio Profiler and memory analysis, cutting dropped frames and improving checkout render time by 35% on low-memory devices.",
        "Raised automated coverage to 80%+ with JUnit and Espresso ViewModel/UI tests wired into CI, catching regressions before release."
      ]
    },
    {
      company: "CVS HEALTH",
      location: "Arlington, VA",
      title: "Full Stack Developer",
      dates: "Aug 2023 - Jul 2024",
      bullets: [
        "Built a responsive React + TypeScript front-end for the member prescription and orders portal with Redux and React Query, improving Lighthouse performance scores by ~30%.",
        "Developed Node.js and Java/Spring Boot REST and GraphQL APIs for eligibility, pricing, and insurance validation, reducing average response time by 25% via caching and query tuning.",
        "Optimized PostgreSQL schemas and queries with indexing and Redis caching, cutting database latency ~20% under peak load.",
        "Implemented OAuth 2.0 / JWT authentication with role-based access control and refresh handling, securing 100% of member-facing endpoints.",
        "Integrated payment and insurance webhooks with idempotent, fault-tolerant workflows, reducing failed-order retries by 40%.",
        "Established Jest, React Testing Library, and JUnit test suites in CI/CD, raising coverage and enabling 2x more frequent releases.",
        "Containerized services with Docker on AWS (ECS/EKS) and added structured logging, metrics, and health checks, improving deployment reliability and MTTR.",
        "Partnered with design and product in Agile sprints to ship well-documented, accessible full-stack features on schedule."
      ]
    },
    {
      company: "COGNIZANT TECHNOLOGY SOLUTIONS",
      location: "Hyderabad, India",
      title: "Java Developer",
      dates: "Jun 2019 - Aug 2021",
      bullets: [
        "Built Spring Boot Java microservices with Spring Security authentication and authorization, improving system reliability and reducing error rates by ~30% in healthcare applications.",
        "Designed Maven and Jenkins CI/CD pipelines, cutting release-cycle time and standardizing build quality across teams.",
        "Containerized microservices with Docker and Kubernetes, increasing availability and enabling faster, safer rollouts.",
        "Integrated Apache Kafka for event-driven architectures, enabling real-time data streaming and decoupled processing across services.",
        "Designed RESTful APIs with request validation, pagination, and centralized exception handling for reliable, well-documented service contracts.",
        "Tuned SQL with indexing strategies and query optimization, reducing database latency by 20% under load."
      ]
    }
  ],
  projects: [
    { title: "Transaction-Safe Android Checkout System", text: "Built a lifecycle-safe Android checkout flow in Kotlin using state-driven MVVM to handle process death, background execution limits, and idempotent backend interactions without duplicate submissions." },
    { title: "Low-Latency Adaptive Video Streaming Engine", text: "Implemented an Android video player using ExoPlayer with HLS/DASH, tuning MediaCodec decoding, buffering, and adaptive-bitrate logic to reduce startup latency and rebuffering under unstable networks." },
    { title: "Full Stack Web Application - \"Yummy\" Recipe Platform", text: "Developed a recipe discovery and sharing site with a responsive front-end (HTML, CSS, Bootstrap, JavaScript, jQuery) backed by Oracle DB for efficient storage and retrieval. mason.gmu.edu/~spore2/Yummy" }
  ],
  skills: [
    { label: "Programming Languages", value: "Java, Kotlin, JavaScript, TypeScript, C, C++, Go" },
    { label: "Android & Jetpack", value: "Jetpack Compose, ViewModel, LiveData/StateFlow, Room, DataStore, WorkManager, MVVM, MVI, Hilt, Coroutines/Flow, Lifecycle-aware Architecture, ExoPlayer" },
    { label: "Full Stack & Web", value: "React, Redux, React Query, Node.js, Spring Boot, REST, Apollo GraphQL, HTML, CSS, Bootstrap" },
    { label: "Testing & Performance", value: "JUnit, Espresso, Mockito, Jest, React Testing Library, Android Profiler, Memory Analysis, Jank diagnosis" },
    { label: "Security & Auth", value: "OAuth 2.0, JWT, EncryptedSharedPreferences, Spring Security, role-based access control" },
    { label: "Cloud & DevOps", value: "AWS (ECS/EKS), Docker, Kubernetes, Maven, Jenkins, CI/CD, PostgreSQL, Redis, Apache Kafka" }
  ],
  certifications: "Google Generative AI; GCP - Professional Machine Learning Engineer; AWS Cloud Practitioner; HackerRank - Data Structures (Advanced), Problem Solving (Advanced), Python Programming; Oracle - Java Programming; EPAM - Introduction to Front-end Technology, Database & Testing",
  education: [
    { left: "George Mason University | Master of Science, Computer Science", right: "Fairfax, VA, USA" }
  ]
};

// Flatten the structured resume into plain text (for copy / TXT / on-screen view).
export function resumeToText(r) {
  const out = [r.name, r.contact, ""];
  if (r.summary) { out.push("PROFESSIONAL SUMMARY"); out.push(r.summary); out.push(""); }
  out.push("PROFESSIONAL EXPERIENCE");
  for (const e of r.experience) {
    out.push(`${e.company}  |  ${e.location}`);
    out.push(`${e.title}  |  ${e.dates}`);
    for (const b of e.bullets) out.push("- " + b);
    out.push("");
  }
  out.push("PROJECTS");
  for (const p of r.projects) out.push(`- ${p.title}: ${p.text}`);
  out.push("");
  out.push("SKILLS");
  for (const s of r.skills) out.push(`${s.label}: ${s.value}`);
  out.push("");
  out.push("CERTIFICATIONS");
  out.push("- " + r.certifications);
  out.push("");
  out.push("EDUCATION");
  for (const ed of (Array.isArray(r.education) ? r.education : [r.education])) out.push(`${ed.left}  |  ${ed.right}`);
  return out.join("\n");
}
