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
      header: "Wynbit Inc | Software Engineer",
      dates: "Aug 2023 - Jan 2025",
      bullets: [
        "Owned Android Prescription Refill and Order Placement flows in Kotlin, modeling UI state to survive process death, configuration changes, background execution limits, and low-memory conditions without duplicating refill requests or corrupting order state.",
        "Modeled durable prescription and order state separately from transient UI events, preventing duplicate submissions, inconsistent refill status, and payment mismatches during lifecycle recreation and task re-launch.",
        "Implemented lifecycle-safe navigation and state restoration with ViewModel-scoped state, eliminating side effects from Fragment reattachment and interrupted background execution across refill and checkout steps.",
        "Integrated REST backend APIs over Retrofit/OkHttp for prescription eligibility, pricing, insurance validation, and order confirmation, validating response schemas and error contracts to prevent client-side corruption under latency or partial failures.",
        "Built secure authentication with OAuth 2.0 and JWT, persisting tokens in EncryptedSharedPreferences with refresh and expiration handling to keep user sessions secure and uninterrupted.",
        "Engineered offline-tolerant refill flows with Room, rendering cached prescription data instantly and reconciling backend responses asynchronously without UI flicker or invalid order state.",
        "Adopted Jetpack Compose with state-driven MVVM/MVI and Hilt dependency injection, isolating business logic behind use cases to improve testability and reduce coupling across feature modules.",
        "Optimized RecyclerView and Compose rendering with the Android Profiler by stabilizing item IDs, minimizing layout invalidations, and cutting unnecessary recompositions for smoother scrolling and faster UI response."
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
