// Structured base resume. Tailoring changes ONLY the experience bullets;
// every other section is rendered verbatim from here.
export const BASE_RESUME = {
  name: "SAI NITHIN P",
  contact: "Sunnyvale, CA | (804) 484-5154 | mailmenithin1317@gmail.com | linkedin.com/in/nithin-1317-p",
  experience: [
    {
      company: "WALMART",
      location: "Sunnyvale, CA",
      title: "Software Engineer III (Android)",
      dates: "Aug 2024 - Present",
      bullets: [
        "Led development of Walmart's Android Cart and Checkout experience across the busiest purchase paths serving millions of daily users, applying lifecycle-aware MVVM and explicit UI state handling that stays correct through process death and low-memory conditions.",
        "Reduced cart and payment state-corruption defects by isolating durable transaction state from transient UI events and making every checkout mutation idempotent and safe to retry across the multi-step flow.",
        "Migrated core checkout and order-review screens to Jetpack Compose on a shared Material 3 design system, cutting UI boilerplate and accelerating feature delivery across multiple product squads.",
        "Integrated Apollo GraphQL with narrowly scoped queries, cursor-based pagination, and graceful handling of partial backend failures, improving checkout latency and resilience on the critical purchase path.",
        "Applied Kotlin Coroutines and StateFlow for structured concurrency across cart, pricing, tax, and payment updates, eliminating race conditions and flaky UI under slow or unreliable network conditions.",
        "Profiled CPU, memory, and rendering with Android Studio Profiler to cut dropped frames and jank, delivering a measurably smoother experience on the lower-end devices common across our customer base.",
        "Modularized the checkout codebase into Gradle feature modules with Hilt dependency injection, parallelizing builds and shortening CI feedback loops for the wider mobile organization, with JUnit, Espresso, and Mockito tests and Firebase Crashlytics monitoring catching regressions before production."
      ]
    },
    {
      company: "CVS HEALTH",
      location: "Arlington, VA",
      title: "Android Developer",
      dates: "Aug 2023 - Jul 2024",
      bullets: [
        "Owned the Android Prescription Refill and Order Placement flows in the member app, keeping order and prescription state reliable through process death, background execution limits, and app restarts.",
        "Prevented duplicate refills, inconsistent order status, and payment mismatches by making submissions idempotent and restoring screen state predictably with ViewModel-scoped state holders.",
        "Integrated REST APIs with Retrofit and OkHttp for eligibility, pricing, insurance validation, and order confirmation, validating responses and error paths to stay stable under latency and partial backend failures.",
        "Built secure authentication with OAuth 2.0 and JWT, persisting tokens in EncryptedSharedPreferences and handling silent refresh and expiry to protect member sessions across sensitive healthcare workflows.",
        "Structured features into clean data, domain, and presentation layers with Hilt dependency injection, improving testability and making the codebase far easier for new engineers to navigate.",
        "Implemented offline-first behavior with Room and WorkManager to cache prescriptions and schedule reliable background sync of refills and reminders even on poor connectivity.",
        "Raised release confidence with JUnit, Espresso, and Mockito coverage in continuous integration and Crashlytics monitoring, reducing crash rate and regressions on production builds."
      ]
    },
    {
      company: "COGNIZANT TECHNOLOGY SOLUTIONS",
      location: "Hyderabad, India",
      title: "Java Developer",
      dates: "Jun 2019 - Aug 2021",
      bullets: [
        "Built Spring Boot microservices secured with Spring Security for authentication and authorization, improving reliability across regulated healthcare applications running in production.",
        "Established Maven and Jenkins CI/CD pipelines and containerized services with Docker and Kubernetes, enabling faster, safer releases and noticeably higher service availability.",
        "Implemented Apache Kafka for event-driven messaging and decoupled processing, and tuned SQL queries and indexes to keep databases responsive under heavy, sustained production load.",
        "Designed RESTful APIs with request validation, pagination, and centralized error handling to deliver reliable, well-documented services consumed by multiple teams across the platform.",
        "Modeled persistence with Hibernate and JPA on PostgreSQL, optimizing transactions, connection pooling, and lazy loading to raise throughput on high-volume endpoints.",
        "Wrote JUnit and Mockito unit and integration tests and participated in peer code reviews within an Agile/Scrum team, increasing coverage and reducing production defects."
      ]
    }
  ],
  projects: [
    { title: "Transaction-Safe Android Checkout", text: "Built a Kotlin checkout flow using state-driven MVVM to handle process death, background limits, and safe-to-retry backend calls without duplicate submissions or lost cart data." },
    { title: "Low-Latency Adaptive Streaming Player", text: "Built an ExoPlayer-based HLS/DASH player, tuning decoding, buffering, and adaptive-bitrate logic to start playback faster and avoid rebuffering on unstable networks." }
  ],
  skills: [
    { label: "Languages", value: "Kotlin, Java, TypeScript, JavaScript, SQL, C++, Go" },
    { label: "Android & Jetpack", value: "Jetpack Compose, ViewModel, StateFlow/LiveData, Room, DataStore, WorkManager, Navigation, Hilt/Dagger, Coroutines/Flow, MVVM, MVI, ExoPlayer, Material 3" },
    { label: "Architecture, APIs & Testing", value: "Clean Architecture, modularization, Apollo GraphQL, REST/Retrofit/OkHttp, offline-first design, JUnit, Espresso, Mockito, Android Studio Profiler" },
    { label: "Security, Cloud & DevOps", value: "OAuth 2.0, JWT, EncryptedSharedPreferences, biometric auth, AWS (ECS/EKS), Docker, Kubernetes, Gradle, Jenkins, GitHub Actions, Firebase, PostgreSQL, Kafka" }
  ],
  certifications: "Google Generative AI; GCP Professional Machine Learning Engineer; AWS Cloud Practitioner; Oracle Certified Java Programmer; HackerRank Problem Solving (Advanced) and Data Structures (Advanced)",
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
