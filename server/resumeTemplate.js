// Structured base resume (the user's real resume). Tailoring changes ONLY the
// experience bullets; every other section is rendered verbatim from here.
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
        "Integrated GraphQL backend APIs into checkout features, shaping queries to minimize payload size, stabilize pagination, and tolerate partial backend failures without breaking client-side state.",
        "Built Android components with ExoPlayer in Kotlin, managing adaptive bitrate, buffering, audio focus, and lifecycle-bound cleanup, lowering buffering delays and improving playback stability.",
        "Applied structured concurrency with Kotlin Coroutines and StateFlow to coordinate asynchronous cart, pricing, and payment updates, preventing race conditions and inconsistent UI state.",
        "Profiled cart and checkout using the Android Studio Profiler and memory analysis to diagnose jank, cut dropped frames, and improve UI responsiveness on low-memory devices.",
        "Wrote ViewModel and UI tests in Kotlin for cart and checkout flows, covering state transitions and lifecycle edge cases, increasing coverage and catching bugs before release."
      ]
    },
    {
      company: "CVS HEALTH",
      location: "Arlington, VA",
      title: "Android Developer",
      dates: "Aug 2023 - Jul 2024",
      bullets: [
        "Owned Android Prescription Refill and Order Placement flows, modeling UI state to survive process death, configuration changes, background execution limits, and low-memory conditions without duplicating refill requests or corrupting order state.",
        "Modeled durable prescription order state separately from transient UI events, preventing duplicate submissions, inconsistent refill status, and payment mismatches during lifecycle recreation and task re-launch scenarios.",
        "Implemented lifecycle-safe navigation and state restoration using ViewModel-scoped state, eliminating side effects caused by Fragment reattachment and interrupted background execution during refill and checkout steps.",
        "Integrated REST backend APIs for prescription eligibility, pricing, insurance validation, and order confirmation, validating response schemas and error contracts to prevent client-side corruption under latency or partial failures.",
        "Implemented Android authentication flows using OAuth 2.0 and JWT, storing tokens in EncryptedSharedPreferences and handling refresh and expiration, keeping user sessions secure across prescription and order workflows.",
        "Structured prescription and order features into clean data, domain, and presentation layers with dependency injection, improving testability and reducing coupling across flows.",
        "Optimized RecyclerView and screen rendering for prescription lists and order summaries by stabilizing item IDs and minimizing layout invalidations, delivering smoother scrolling and faster UI response."
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
        "Deployed Java microservices in Docker containers orchestrated by Kubernetes for faster rollout and higher availability, automating build, test, and delivery via Maven and Jenkins.",
        "Integrated Apache Kafka for event-driven architectures, enabling real-time data streaming across microservices and supporting RTSP and WebRTC video-streaming use cases.",
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
    { label: "Programming Languages", value: "Java, Kotlin, C, C#, C++, Go" },
    { label: "Android & Jetpack", value: "Activities, Fragments, Jetpack Compose, ViewModel, LiveData/StateFlow, Room, DataStore, WorkManager, MVVM, MVI, state-driven UI, Lifecycle-aware Architecture, ExoPlayer" },
    { label: "Networking & APIs", value: "REST, Apollo GraphQL, Retrofit, OkHttp, JSON, pagination, partial-failure handling" },
    { label: "Testing & Performance", value: "JUnit, Espresso, Mockito, UI/instrumentation testing, Android Profiler, Memory Analysis, Jank diagnosis" },
    { label: "Security & Auth", value: "OAuth 2.0, JWT, EncryptedSharedPreferences, Spring Security" },
    { label: "Backend, Messaging & DevOps", value: "Spring Boot, Microservices, Apache Kafka, Redis, RTSP/WebRTC, Docker, Kubernetes, Maven, Jenkins, CI/CD, database indexing & query optimization" }
  ],
  certifications: "Google Generative AI; GCP - Professional Machine Learning Engineer; AWS Cloud Practitioner; HackerRank - Data Structures (Advanced), Problem Solving (Advanced), Python Programming; Oracle - Java Programming; EPAM - Introduction to Front-end Technology, Database & Testing",
  education: { left: "George Mason University | Master of Science, Computer Science", right: "Fairfax, VA, USA" }
};

// Flatten the structured resume into plain text (for copy / TXT / on-screen view).
export function resumeToText(r) {
  const out = [r.name, r.contact, ""];
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
  out.push(`${r.education.left}  |  ${r.education.right}`);
  return out.join("\n");
}
