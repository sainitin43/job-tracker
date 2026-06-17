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
        "Owned Android Cart and Checkout flows on high-traffic purchase paths, modeling UI state to survive process death, configuration changes, background execution limits, and low-memory conditions without corrupting cart or payment state.",
        "Modeled durable checkout state separately from transient UI events, preventing duplicate charges, lost cart data, and inconsistent pricing during lifecycle recreation and task re-launch scenarios.",
        "Implemented lifecycle-safe navigation using ViewModel-scoped state and explicit UI state machines, eliminating side effects caused by Fragment reattachment and back-stack restoration.",
        "Integrated GraphQL backend APIs into checkout with Apollo GraphQL, shaping queries to minimize payload size, stabilize pagination, and tolerate partial backend failures without breaking client-side state.",
        "Built UI with Jetpack Compose and a shared design-system layer, standardizing styling, accessibility semantics, and state hoisting across cart and checkout to accelerate feature delivery.",
        "Applied structured concurrency with Kotlin Coroutines and StateFlow to coordinate asynchronous cart, pricing, and payment updates, preventing race conditions and inconsistent UI state.",
        "Profiled cart and checkout with the Android Studio Profiler and memory analysis to cut dropped frames and improve UI responsiveness on low-memory devices.",
        "Wrote ViewModel and UI tests in Kotlin (JUnit, Espresso) covering state transitions and lifecycle edge cases, integrated into CI to catch regressions before release."
      ]
    },
    {
      company: "CVS HEALTH",
      location: "Arlington, VA",
      title: "Full Stack Developer",
      dates: "Aug 2023 - Jul 2024",
      bullets: [
        "Built responsive, accessible front-end features in React and TypeScript, implementing component-driven UI, client-side routing, and state management (Redux / React Query) for the member prescription and orders portal.",
        "Developed back-end REST and GraphQL APIs with Node.js and Java/Spring Boot for eligibility, pricing, insurance validation, and order confirmation, with strong request validation and well-defined error contracts.",
        "Designed and optimized relational schemas in PostgreSQL with indexing, query tuning, and Redis caching, reducing API latency and improving page-load times under load.",
        "Implemented secure authentication and authorization across the stack using OAuth 2.0, JWT, and role-based access control, with refresh/expiry handling for uninterrupted sessions.",
        "Integrated third-party payment and insurance services via APIs and webhooks, building idempotent, fault-tolerant workflows resilient to partial failures and retries.",
        "Wrote unit and end-to-end tests with Jest, React Testing Library, and JUnit, wiring them into CI/CD pipelines for reliable, frequent releases.",
        "Containerized services with Docker and deployed on AWS (ECS/EKS), adding structured logging, metrics, and health checks for full-stack observability.",
        "Collaborated cross-functionally with design and product in Agile sprints, turning requirements into shipped, well-documented full-stack features."
      ]
    },
    {
      company: "COGNIZANT TECHNOLOGY SOLUTIONS",
      location: "Hyderabad, India",
      title: "Java Developer",
      dates: "Jun 2019 - Aug 2021",
      bullets: [
        "Implemented Java services with Spring Boot and added authentication and authorization via Spring Security, improving system reliability and reducing error rates in healthcare applications.",
        "Designed and implemented a continuous-integration pipeline using Maven and Jenkins, improving software quality and consistency.",
        "Deployed Java microservices in Docker containers orchestrated by Kubernetes for faster rollout and higher availability, automating build, test, and delivery.",
        "Integrated Apache Kafka for event-driven architectures, enabling real-time data streaming across microservices.",
        "Designed RESTful Spring Boot microservice APIs with input validation, pagination, and centralized exception handling for reliable, well-documented service contracts.",
        "Analyzed database performance and implemented indexing strategies to optimize query response times, reducing database latency by 20%."
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
