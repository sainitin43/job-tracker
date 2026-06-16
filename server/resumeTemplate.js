// Structured base resume (the user's real resume). Tailoring changes ONLY the
// experience bullets; every other section is rendered verbatim from here.
export const BASE_RESUME = {
  name: "SAI NITHIN PILLI",
  contact: "(804) 484-5154 | saireddy.dev17@gmail.com | linkedin.com/in/nithin-1317-p",
  experience: [
    {
      header: "West Coast Consulting | Client – Walmart | Software Engineer",
      dates: "Feb 2025 - Present",
      bullets: [
        "Owned Android Cart and Checkout flows on high-traffic purchase paths, modeling UI state to survive process death, configuration changes, background execution limits, and low-memory conditions without corrupting cart or payment state.",
        "Modeled durable checkout state separately from transient UI events, preventing duplicate charges, lost cart data, and inconsistent pricing during lifecycle recreation and task re-launch scenarios.",
        "Implemented lifecycle-safe navigation using ViewModel-scoped state and explicit UI state machines, eliminating side effects caused by Fragment reattachment and back-stack restoration.",
        "Integrated GraphQL backend APIs into checkout with Apollo GraphQL, shaping queries to minimize payload size, stabilize pagination, and tolerate partial backend failures without breaking client-side state.",
        "Built media components with ExoPlayer in Kotlin, managing adaptive bitrate, buffering, audio focus, and lifecycle-bound cleanup to lower buffering delays and improve playback stability.",
        "Applied structured concurrency with Kotlin Coroutines and StateFlow to coordinate asynchronous cart, pricing, and payment updates, preventing race conditions and inconsistent UI state.",
        "Wrote ViewModel and UI tests in Kotlin with Espresso covering state transitions and lifecycle edge cases, increasing coverage and catching regressions before release."
      ]
    },
    {
      header: "Wynbit Inc | Java Developer",
      dates: "Aug 2023 - Jan 2025",
      bullets: [
        "Built and maintained Java backend services with Spring Boot, designing RESTful APIs with request validation, pagination, idempotency, and centralized exception handling for reliable, versioned, well-documented service contracts.",
        "Implemented authentication and authorization with Spring Security using OAuth 2.0 and JWT, securing endpoints and standardizing role-based access control across services.",
        "Designed event-driven workflows with Apache Kafka, enabling real-time data streaming and decoupled, fault-tolerant processing across microservices.",
        "Modeled relational schemas and optimized SQL queries through indexing and query tuning, reducing database latency by ~20% and improving throughput under peak load.",
        "Introduced Redis caching for frequently accessed data, cutting read latency and offloading the primary database during high-traffic periods.",
        "Containerized services with Docker and deployed on Kubernetes, configuring CI/CD pipelines with Maven and Jenkins to automate build, test, and delivery for faster, safer releases.",
        "Wrote unit and integration tests with JUnit and Mockito, raising coverage and catching regressions early in the continuous-integration pipeline.",
        "Instrumented services with structured logging, health checks, and metrics, improving observability and shortening incident diagnosis during on-call support."
      ]
    }
  ],
  projects: [
    { title: "On-Device GenAI Assistant (Gemini Nano · MediaPipe LLM)", text: "Built a privacy-first Android assistant running an on-device LLM via the MediaPipe LLM Inference API and Gemini Nano, with streaming token output and retrieval-augmented answers over local data — no network round-trips or data leaving the device." },
    { title: "Kotlin & Compose Multiplatform App", text: "Shipped a shared Kotlin Multiplatform codebase with Compose Multiplatform UI across Android, iOS, and Desktop, reusing business logic and a single design system to eliminate duplicate work and keep platforms in sync." },
    { title: "AI Smart-Camera (On-Device ML)", text: "Real-time object and text recognition on Android using TensorFlow Lite and ML Kit with CameraX, tuned for low-latency on-device inference with GPU delegation and frame throttling." },
    { title: "Transaction-Safe Android Checkout System", text: "Built a lifecycle-safe Android checkout flow in Kotlin using state-driven MVVM to handle process death, background execution limits, and idempotent backend interactions without duplicate submissions." },
    { title: "Low-Latency Adaptive Video Streaming Engine", text: "Implemented an Android video player using ExoPlayer with HLS/DASH, tuning MediaCodec decoding, buffering, and adaptive-bitrate logic to reduce startup latency and rebuffering under unstable networks." }
  ],
  skills: [
    { label: "Programming Languages", value: "Java, Kotlin, C, C#, C++, Go" },
    { label: "Android & Jetpack", value: "Activities, Fragments, Jetpack Compose, ViewModel, LiveData/StateFlow, Room, DataStore, WorkManager, MVVM, MVI, Hilt, Coroutines/Flow, Lifecycle-aware Architecture, ExoPlayer" },
    { label: "On-Device AI / ML", value: "MediaPipe LLM Inference, Gemini Nano, TensorFlow Lite, ML Kit, CameraX, Kotlin Multiplatform, Compose Multiplatform" },
    { label: "Networking & APIs", value: "REST, Apollo GraphQL, Retrofit, OkHttp, JSON, pagination, partial-failure handling" },
    { label: "Testing & Performance", value: "JUnit, Espresso, Mockito, UI/instrumentation testing, Android Profiler, Memory Analysis, Jank diagnosis" },
    { label: "Security, Backend & DevOps", value: "OAuth 2.0, JWT, EncryptedSharedPreferences, Spring Boot, Kafka, Redis, Docker, Kubernetes, Maven, Jenkins, CI/CD" }
  ],
  certifications: "Google Generative AI; GCP - Professional Machine Learning Engineer; AWS Cloud Practitioner; HackerRank - Data Structures (Advanced), Problem Solving (Advanced), Python Programming; Oracle - Java Programming; EPAM - Introduction to Front-end Technology, Database & Testing",
  education: [
    { left: "George Mason University | Master of Science, Computer Science (GPA: 3.6)", right: "Fairfax, VA, USA" },
    { left: "Vardhaman College of Engineering | Bachelor of Technology, Computer Science", right: "Hyderabad, India" }
  ]
};

// Flatten the structured resume into plain text (for copy / TXT / on-screen view).
export function resumeToText(r) {
  const out = [r.name, r.contact, ""];
  if (r.summary) { out.push("PROFESSIONAL SUMMARY"); out.push(r.summary); out.push(""); }
  out.push("PROFESSIONAL EXPERIENCE");
  for (const e of r.experience) {
    out.push(`${e.header}  |  ${e.dates}`);
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
  for (const ed of r.education) out.push(`${ed.left}  |  ${ed.right}`);
  return out.join("\n");
}
