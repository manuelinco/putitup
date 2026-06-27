import Groq from "groq-sdk";
import { db, datasetsTable, tasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const GROQ_API_KEY = process.env["GROQ_API_KEY"];

const groq = GROQ_API_KEY
  ? new Groq({ apiKey: GROQ_API_KEY })
  : null;

// ── Internal types ─────────────────────────────────────────────────────────────

export interface AgentRun {
  runId: string;
  startedAt: Date;
  finishedAt?: Date;
  status: "running" | "done" | "error";
  datasetsProcessed: number;
  tasksCreated: number;
  errors: string[];
  log: string[];
}

interface FetchedContent {
  type: "image" | "text" | "audio" | "video";
  imageUrl?: string;
  text?: string;
  audioUrl?: string;
  videoUrl?: string;
  thumbnail?: string;
  sourceUrl: string;
  sourceName: string;
}

// ── In-memory state ────────────────────────────────────────────────────────────

let lastRun: AgentRun | null = null;
let running = false;

export function getLastRun(): AgentRun | null { return lastRun; }
export function isRunning(): boolean { return running; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ── Multi-angle image questions ────────────────────────────────────────────────
// Each image gets N tasks with DIFFERENT questions — same URL, different angle.

interface ImageAngle {
  question: string;
  optionPool: string[];
  pick: number;
  difficulty: "easy" | "medium" | "hard";
}

const IMAGE_ANGLE_POOL: ImageAngle[] = [
  {
    question: "What emotion does this image primarily evoke?",
    optionPool: ["joy", "calm", "sadness", "fear", "surprise", "disgust", "awe", "nostalgia"],
    pick: 4, difficulty: "medium",
  },
  {
    question: "What is the dominant color in this image?",
    optionPool: ["blue", "green", "red", "yellow", "brown", "grey", "white", "black", "orange", "purple"],
    pick: 4, difficulty: "easy",
  },
  {
    question: "What is the main subject of this image?",
    optionPool: ["person", "animal", "landscape", "building", "object", "food", "vehicle", "abstract"],
    pick: 4, difficulty: "easy",
  },
  {
    question: "What type of scene is depicted?",
    optionPool: ["urban", "rural", "indoor", "outdoor", "underwater", "aerial", "forest", "beach"],
    pick: 4, difficulty: "easy",
  },
  {
    question: "What is the overall mood of this image?",
    optionPool: ["positive", "neutral", "negative", "mixed", "mysterious", "energetic", "peaceful"],
    pick: 4, difficulty: "medium",
  },
  {
    question: "How visually complex is this image?",
    optionPool: ["very simple", "simple", "moderate", "complex", "very complex"],
    pick: 4, difficulty: "easy",
  },
  {
    question: "What time of day does this image suggest?",
    optionPool: ["dawn", "morning", "afternoon", "dusk", "night", "unclear"],
    pick: 4, difficulty: "medium",
  },
  {
    question: "What lighting condition is present in this image?",
    optionPool: ["bright sunlight", "soft daylight", "artificial light", "low light", "dark", "mixed"],
    pick: 4, difficulty: "medium",
  },
  {
    question: "What season does this image suggest?",
    optionPool: ["spring", "summer", "autumn", "winter", "unclear"],
    pick: 4, difficulty: "easy",
  },
  {
    question: "How would you rate the aesthetic quality of this image?",
    optionPool: ["excellent", "good", "average", "poor"],
    pick: 4, difficulty: "easy",
  },
];

function getImageAngles(count: number): Array<{ question: string; options: string[]; difficulty: "easy" | "medium" | "hard" }> {
  const shuffled = pickRandom(IMAGE_ANGLE_POOL, Math.min(count, IMAGE_ANGLE_POOL.length));
  return shuffled.map((a) => ({
    question: a.question,
    options: pickRandom(a.optionPool, a.pick),
    difficulty: a.difficulty,
  }));
}

// ── Content fetchers ───────────────────────────────────────────────────────────

async function fetchWikimediaImages(category: string, limit = 20): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];
  const titles = members.map((m: any) => m.title).join("|");
  if (!titles) return [];

  const imgRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url&format=json&origin=*`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!imgRes.ok) return [];
  const imgJson = (await imgRes.json()) as any;
  const pages = Object.values(imgJson?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => p?.imageinfo?.[0]?.url)
    .filter((p: any) => {
      const url = (p.imageinfo[0].url as string).toLowerCase();
      return url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/);
    })
    .map((p: any) => ({
      type: "image" as const,
      imageUrl: p.imageinfo[0].url as string,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons",
    }));
}

async function fetchWikimediaAudio(category: string, limit = 15): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];
  const titles = members.map((m: any) => m.title).join("|");
  if (!titles) return [];

  const infoRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url|mime&format=json&origin=*`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!infoRes.ok) return [];
  const infoJson = (await infoRes.json()) as any;
  const pages = Object.values(infoJson?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => {
      const fileUrl = (p?.imageinfo?.[0]?.url ?? "").toLowerCase();
      const mime = (p?.imageinfo?.[0]?.mime ?? "").toLowerCase();
      return (
        fileUrl.match(/\.(ogg|mp3|wav|flac|opus)(\?|$)/) ||
        mime.startsWith("audio/")
      );
    })
    .map((p: any) => ({
      type: "audio" as const,
      audioUrl: p.imageinfo[0].url as string,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons Audio",
    }));
}

async function fetchWikimediaVideo(category: string, limit = 10): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];
  const titles = members.map((m: any) => m.title).join("|");
  if (!titles) return [];

  const infoRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
      `&prop=imageinfo&iiprop=url|mime|thumburl&iithumbsize=320&format=json&origin=*`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!infoRes.ok) return [];
  const infoJson = (await infoRes.json()) as any;
  const pages = Object.values(infoJson?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => {
      const fileUrl = (p?.imageinfo?.[0]?.url ?? "").toLowerCase();
      const mime = (p?.imageinfo?.[0]?.mime ?? "").toLowerCase();
      return (
        fileUrl.match(/\.(webm|ogv|mp4|ogg)(\?|$)/) ||
        mime.startsWith("video/")
      );
    })
    .map((p: any) => ({
      type: "video" as const,
      videoUrl: p.imageinfo[0].url as string,
      thumbnail: p.imageinfo[0].thumburl as string | undefined,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons Video",
    }));
}

async function fetchWikipediaTexts(titles: string[], lang = "it"): Promise<FetchedContent[]> {
  const joined = titles.map(encodeURIComponent).join("|");
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${joined}` +
    `&prop=extracts&exintro=true&explaintext=true&exsentences=3&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const pages = Object.values(json?.query?.pages ?? {}) as any[];

  return pages
    .filter((p: any) => p?.extract && p.extract.length > 30)
    .map((p: any) => ({
      type: "text" as const,
      text: (p.extract as string).slice(0, 400).trim(),
      sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: `Wikipedia (${lang})`,
    }));
}

function fetchPicsumImages(count: number, offset = 0): FetchedContent[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = `agent-${Date.now()}-${offset + i}`;
    return {
      type: "image" as const,
      imageUrl: `https://picsum.photos/seed/${seed}/640/480`,
      sourceUrl: `https://picsum.photos`,
      sourceName: "Picsum Photos",
    };
  });
}

async function fetchRedditTexts(subreddit: string, limit = 15): Promise<FetchedContent[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=${limit}&t=week`;
  const res = await fetch(url, {
    headers: { "User-Agent": "putitup-agent/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const posts: any[] = json?.data?.children ?? [];

  return posts
    .filter((p: any) => p?.data?.selftext && p.data.selftext.length > 30)
    .map((p: any) => ({
      type: "text" as const,
      text: (p.data.selftext as string).slice(0, 350).trim(),
      sourceUrl: `https://reddit.com${p.data.permalink}`,
      sourceName: `r/${subreddit}`,
    }));
}

// ── Groq generation (text & audio context only) ────────────────────────────────

interface GeneratedTask {
  question: string;
  options: string[];
  correctAnswer?: string;
  difficulty: "easy" | "medium" | "hard";
}

async function generateTasksWithGroq(
  content: FetchedContent,
  datasetCategory: string,
  labels: string[],
  count = 3,
): Promise<GeneratedTask[]> {
  if (!groq) {
    return Array.from({ length: count }, () => ({
      question: content.type === "audio"
        ? "What is the primary language spoken in this audio?"
        : content.type === "video"
        ? "What action is being performed in this video?"
        : "Classify this content into the correct category.",
      options: labels.slice(0, 4),
      difficulty: "easy" as const,
    }));
  }

  let contentDesc: string;
  if (content.type === "audio") {
    contentDesc = `Audio clip from: ${content.sourceName} (URL: ${content.audioUrl})`;
  } else if (content.type === "video") {
    contentDesc = `Video clip from: ${content.sourceName} (URL: ${content.videoUrl})`;
  } else {
    contentDesc = `Text from ${content.sourceName}: "${content.text}"`;
  }

  const prompt = `You are an AI data labeling expert. Generate ${count} annotation tasks for this content.

CONTENT TYPE: ${content.type.toUpperCase()}
CONTENT: ${contentDesc}
DATASET CATEGORY: ${datasetCategory}
AVAILABLE LABELS: ${labels.join(", ")}

Generate varied, realistic classification tasks. For each task:
- Write a clear question in ENGLISH (no accented characters, no special symbols)
- Provide 3-4 answer options using the provided labels
- Indicate the correct answer if deducible
- Set difficulty: easy | medium | hard

For AUDIO tasks: ask about language, emotion, tone, content type, speaker gender, noise level.
For VIDEO tasks: ask about action, scene type, subject count, motion speed, environment.
For TEXT tasks: ask about sentiment, topic, intent, formality, language.

Reply ONLY with valid JSON array:
[{"question":"...","options":["a","b","c"],"correctAnswer":"a","difficulty":"easy"}]`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as GeneratedTask[];
    return parsed.filter(
      (t) => t.question && Array.isArray(t.options) && t.options.length >= 2,
    );
  } catch (err) {
    logger.warn({ err }, "Groq generation failed — using fallback");
    return Array.from({ length: count }, () => ({
      question: "Classify this content into the correct category.",
      options: labels.slice(0, 4),
      difficulty: "easy" as const,
    }));
  }
}

// ── Dataset source configurations ──────────────────────────────────────────────

interface DatasetAgentConfig {
  contentType: "image" | "text" | "audio" | "video" | "mixed";
  sources: Array<
    | { kind: "wikimedia_image"; category: string }
    | { kind: "wikimedia_audio"; category: string }
    | { kind: "wikimedia_video"; category: string }
    | { kind: "wikipedia"; titles: string[]; lang?: string }
    | { kind: "picsum"; count: number }
    | { kind: "reddit"; subreddit: string }
  >;
  labels: string[];
  tasksPerContent: number;
  useAngles?: boolean; // Use multi-angle system instead of Groq for images
}

const DATASET_AGENT_CONFIG: Record<string, DatasetAgentConfig> = {
  // ── IMAGE DATASETS ────────────────────────────────────────────────────────
  "image_classification": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Animals" },
      { kind: "wikimedia_image", category: "Vehicles" },
      { kind: "picsum", count: 10 },
    ],
    labels: ["animal", "vehicle", "person", "building", "nature", "object"],
    tasksPerContent: 4,
    useAngles: true,
  },
  "facial_expression": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Facial_expressions" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["happy", "sad", "angry", "surprised", "neutral", "fear"],
    tasksPerContent: 3,
    useAngles: true,
  },
  "product_quality": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Product_photography" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["defect", "ok", "uncertain"],
    tasksPerContent: 3,
    useAngles: true,
  },
  "satellite": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Satellite_images_of_Italy" },
      { kind: "wikimedia_image", category: "Aerial_photographs" },
      { kind: "picsum", count: 10 },
    ],
    labels: ["urban", "forest", "agriculture", "water", "industrial", "desert"],
    tasksPerContent: 3,
    useAngles: true,
  },

  // ── TEXT DATASETS ─────────────────────────────────────────────────────────
  "text_classification": {
    contentType: "text",
    sources: [
      { kind: "wikipedia", titles: ["Artificial intelligence", "Machine learning", "Big data", "Cloud computing"], lang: "en" },
      { kind: "reddit", subreddit: "technology" },
      { kind: "reddit", subreddit: "science" },
    ],
    labels: ["technology", "science", "business", "health", "politics", "entertainment"],
    tasksPerContent: 3,
  },
  "sentiment": {
    contentType: "text",
    sources: [
      { kind: "reddit", subreddit: "worldnews" },
      { kind: "reddit", subreddit: "italy" },
      { kind: "wikipedia", titles: ["Italian economy", "Innovation", "Environmental sustainability"], lang: "en" },
    ],
    labels: ["positive", "negative", "neutral"],
    tasksPerContent: 3,
  },
  "medical_text": {
    contentType: "text",
    sources: [
      { kind: "wikipedia", titles: ["Medicine", "Pharmacology", "Clinical trial", "Triage", "Emergency medicine"], lang: "en" },
      { kind: "wikipedia", titles: ["Diagnosis", "Therapy", "Medical imaging", "Patient care"], lang: "en" },
    ],
    labels: ["urgent", "routine", "administrative", "diagnostic", "therapeutic"],
    tasksPerContent: 3,
  },
  "document_ocr": {
    contentType: "image",
    sources: [
      { kind: "wikimedia_image", category: "Handwritten_documents" },
      { kind: "wikimedia_image", category: "Historical_documents" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["legible", "partially_legible", "illegible", "printed", "handwritten"],
    tasksPerContent: 3,
    useAngles: true,
  },

  // ── AUDIO DATASETS ────────────────────────────────────────────────────────
  "speech_transcription_en": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "English_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_English" },
      { kind: "wikimedia_audio", category: "Audio_recordings_of_speeches" },
    ],
    labels: ["clear", "unclear", "background_noise", "multiple_speakers", "accent_strong", "accent_neutral"],
    tasksPerContent: 2,
  },
  "speech_transcription_it": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "Italian_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_Italian" },
    ],
    labels: ["clear", "unclear", "background_noise", "multiple_speakers", "dialect", "standard"],
    tasksPerContent: 2,
  },
  "speech_transcription_fr": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "French_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_French" },
    ],
    labels: ["clear", "unclear", "background_noise", "multiple_speakers", "accent_strong", "accent_neutral"],
    tasksPerContent: 2,
  },
  "audio_language": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "English_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Italian_language_pronunciation" },
      { kind: "wikimedia_audio", category: "French_language_pronunciation" },
      { kind: "wikimedia_audio", category: "Spanish_language_pronunciation" },
      { kind: "wikimedia_audio", category: "German_language_pronunciation" },
    ],
    labels: ["english", "italian", "french", "spanish", "german", "other"],
    tasksPerContent: 1,
  },
  "audio_emotion": {
    contentType: "audio",
    sources: [
      { kind: "wikimedia_audio", category: "Audio_recordings_of_speeches" },
      { kind: "wikimedia_audio", category: "Sound_recordings" },
      { kind: "wikimedia_audio", category: "Spoken_Wikipedia_in_English" },
    ],
    labels: ["happy", "sad", "angry", "neutral", "excited", "calm", "fearful"],
    tasksPerContent: 2,
  },

  // ── VIDEO DATASETS ────────────────────────────────────────────────────────
  "video_action": {
    contentType: "video",
    sources: [
      { kind: "wikimedia_video", category: "Videos_of_animals" },
      { kind: "wikimedia_video", category: "Sports_videos" },
      { kind: "wikimedia_video", category: "Nature_videos" },
      { kind: "wikimedia_video", category: "Videos" },
    ],
    labels: ["running", "walking", "jumping", "swimming", "flying", "eating", "playing", "working", "idle"],
    tasksPerContent: 3,
  },

  // ── DEFAULT FALLBACK ──────────────────────────────────────────────────────
  "default": {
    contentType: "mixed",
    sources: [
      { kind: "picsum", count: 20 },
      { kind: "wikipedia", titles: ["Technology", "Environment", "Art", "Sport", "Italian cuisine"], lang: "en" },
    ],
    labels: ["relevant", "not_relevant", "uncertain"],
    tasksPerContent: 3,
    useAngles: true,
  },
};

function getConfigForDataset(dataset: { id: number; category: string; name: string }): DatasetAgentConfig {
  const name = dataset.name.toLowerCase();

  // Audio
  if (name.includes("speech") && name.includes("en")) return DATASET_AGENT_CONFIG["speech_transcription_en"]!;
  if (name.includes("speech") && name.includes("it")) return DATASET_AGENT_CONFIG["speech_transcription_it"]!;
  if (name.includes("speech") && name.includes("fr")) return DATASET_AGENT_CONFIG["speech_transcription_fr"]!;
  if (name.includes("speech") || name.includes("transcription")) return DATASET_AGENT_CONFIG["speech_transcription_en"]!;
  if (name.includes("language") && (name.includes("audio") || name.includes("detect"))) return DATASET_AGENT_CONFIG["audio_language"]!;
  if (name.includes("emotion") && name.includes("audio")) return DATASET_AGENT_CONFIG["audio_emotion"]!;
  if (name.includes("audio")) return DATASET_AGENT_CONFIG["audio_emotion"]!;

  // Video
  if (name.includes("video") || name.includes("action")) return DATASET_AGENT_CONFIG["video_action"]!;

  // Images
  if (name.includes("facial") || name.includes("expression")) return DATASET_AGENT_CONFIG["facial_expression"]!;
  if (name.includes("quality") || name.includes("qualità")) return DATASET_AGENT_CONFIG["product_quality"]!;
  if (name.includes("satellite") || name.includes("land use")) return DATASET_AGENT_CONFIG["satellite"]!;
  if (name.includes("ocr") || name.includes("document")) return DATASET_AGENT_CONFIG["document_ocr"]!;
  if (name.includes("object") && name.includes("classif")) return DATASET_AGENT_CONFIG["image_classification"]!;

  // Text
  if (name.includes("medical") || name.includes("triage")) return DATASET_AGENT_CONFIG["medical_text"]!;
  if (name.includes("sentiment") || name.includes("opinion")) return DATASET_AGENT_CONFIG["sentiment"]!;

  // Category-based fallback
  const cat = dataset.category.toLowerCase();
  if (cat.includes("text") || name.includes("text")) return DATASET_AGENT_CONFIG["text_classification"]!;
  if (cat.includes("image") || name.includes("image") || name.includes("photo")) return DATASET_AGENT_CONFIG["image_classification"]!;

  return DATASET_AGENT_CONFIG["default"]!;
}

// ── Fetch from a single source ─────────────────────────────────────────────────

async function fetchFromSource(source: DatasetAgentConfig["sources"][number]): Promise<FetchedContent[]> {
  try {
    switch (source.kind) {
      case "wikimedia_image":  return await fetchWikimediaImages(source.category);
      case "wikimedia_audio":  return await fetchWikimediaAudio(source.category);
      case "wikimedia_video":  return await fetchWikimediaVideo(source.category);
      case "wikipedia":        return await fetchWikipediaTexts(source.titles, source.lang ?? "en");
      case "picsum":           return fetchPicsumImages(source.count);
      case "reddit":           return await fetchRedditTexts(source.subreddit);
    }
  } catch (err) {
    logger.warn({ err, source }, "Source fetch failed");
    return [];
  }
}

// ── Main runner ────────────────────────────────────────────────────────────────

export interface AgentRunOptions {
  datasetIds?: number[];
  tasksPerDataset?: number;
  dryRun?: boolean;
}

export async function runTaskAgent(options: AgentRunOptions = {}): Promise<AgentRun> {
  if (running) throw new Error("Agent already running");

  const run: AgentRun = {
    runId: `run-${Date.now()}`,
    startedAt: new Date(),
    status: "running",
    datasetsProcessed: 0,
    tasksCreated: 0,
    errors: [],
    log: [],
  };

  lastRun = run;
  running = true;

  const log = (msg: string) => {
    run.log.push(`[${new Date().toISOString()}] ${msg}`);
    logger.info(msg);
  };

  try {
    log("🤖 Task Agent started");

    let datasets = await db.select().from(datasetsTable);
    if (options.datasetIds?.length) {
      datasets = datasets.filter((d) => options.datasetIds!.includes(d.id));
    }
    datasets = datasets.filter((d) => ["active", "published", "draft"].includes(d.status));
    log(`📊 Datasets to process: ${datasets.length}`);

    const tasksPerDataset = options.tasksPerDataset ?? 50;

    for (const dataset of datasets) {
      try {
        log(`\n▶ Dataset #${dataset.id}: ${dataset.name}`);
        const config = getConfigForDataset(dataset);

        // Fetch content from all sources
        const allContent: FetchedContent[] = [];
        for (const source of config.sources) {
          const items = await fetchFromSource(source);
          allContent.push(...items);
          log(`  ↳ ${source.kind}: ${items.length} items`);
        }

        // Fallback if nothing fetched
        if (allContent.length === 0) {
          log(`  ⚠ No content — using Picsum fallback`);
          allContent.push(...fetchPicsumImages(20, dataset.id * 100));
        }

        const taskRows: any[] = [];
        let created = 0;

        for (const content of allContent) {
          if (created >= tasksPerDataset) break;

          const remaining = tasksPerDataset - created;
          const wantCount = Math.min(config.tasksPerContent, remaining);

          // ── IMAGE: multi-angle system (no Groq needed) ──────────────────
          if (content.type === "image" && config.useAngles) {
            const angles = getImageAngles(wantCount);
            for (const angle of angles) {
              if (created >= tasksPerDataset) break;
              taskRows.push({
                datasetId: dataset.id,
                type: "image",
                dataPayload: {
                  question: angle.question,
                  options: angle.options,
                  imageUrl: content.imageUrl,
                  source: content.sourceUrl,
                  sourceName: content.sourceName,
                  agentGenerated: true,
                  angleTask: true,
                },
                correctAnswer: null,
                difficulty: angle.difficulty,
                pointsReward: angle.difficulty === "hard" ? 15 : angle.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }

          // ── AUDIO / VIDEO / TEXT: Groq-based generation ─────────────────
          else if (content.type === "audio" || content.type === "video" || content.type === "text") {
            const generated = await generateTasksWithGroq(
              content, dataset.category, config.labels, wantCount,
            );

            for (const g of generated) {
              if (created >= tasksPerDataset) break;

              const dataPayload: Record<string, unknown> = {
                question: g.question,
                options: g.options,
                source: content.sourceUrl,
                sourceName: content.sourceName,
                agentGenerated: true,
                ...(content.type === "audio" ? { audioUrl: content.audioUrl } : {}),
                ...(content.type === "video" ? { videoUrl: content.videoUrl, thumbnail: content.thumbnail } : {}),
                ...(content.type === "text"  ? { text: content.text } : {}),
              };

              taskRows.push({
                datasetId: dataset.id,
                type: content.type,
                dataPayload,
                correctAnswer: g.correctAnswer ?? null,
                difficulty: g.difficulty,
                pointsReward: g.difficulty === "hard" ? 15 : g.difficulty === "medium" ? 12 : 10,
                requiredVotes: dataset.votesRequired,
                consensusThreshold: dataset.consensusThreshold,
                supervisorId: dataset.supervisorId ?? null,
                taskValuePoints: 10,
                operatorRewardTon: 0.00004,
                supervisorRewardTon: 0.0001,
                rawSource: content.sourceUrl,
              });
              created++;
            }
          }
        }

        // Insert into DB in batches of 100
        if (!options.dryRun && taskRows.length > 0) {
          const BATCH = 100;
          for (let i = 0; i < taskRows.length; i += BATCH) {
            await db.insert(tasksTable).values(taskRows.slice(i, i + BATCH));
          }
          await db
            .update(datasetsTable)
            .set({
              requestedTaskCount: dataset.requestedTaskCount + taskRows.length,
              recordCount: (dataset.recordCount ?? 0) + taskRows.length,
            })
            .where(eq(datasetsTable.id, dataset.id));
        }

        log(`  ✅ ${taskRows.length} tasks created${options.dryRun ? " (dry run)" : ""}`);
        run.tasksCreated += taskRows.length;
        run.datasetsProcessed++;

        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`  ❌ Dataset #${dataset.id} error: ${msg}`);
        run.errors.push(`Dataset #${dataset.id}: ${msg}`);
      }
    }

    run.status = "done";
    run.finishedAt = new Date();
    const elapsed = Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000);
    log(`\n🏁 Done in ${elapsed}s — ${run.tasksCreated} tasks across ${run.datasetsProcessed} datasets`);
  } catch (err) {
    run.status = "error";
    run.finishedAt = new Date();
    const msg = err instanceof Error ? err.message : String(err);
    run.errors.push(msg);
    logger.error({ err }, "Task agent fatal error");
  } finally {
    running = false;
  }

  return run;
}

// ── Cron: every hour ───────────────────────────────────────────────────────────

let cronTimer: ReturnType<typeof setInterval> | null = null;

export function startAgentCron(intervalMs = 60 * 60 * 1000): void {
  if (cronTimer) return;
  logger.info(`🤖 Task Agent cron started (every ${intervalMs / 60000} min)`);
  cronTimer = setInterval(async () => {
    if (running) {
      logger.info("Cron: agent already running, skip");
      return;
    }
    logger.info("Cron: starting automatic run");
    try {
      await runTaskAgent({ tasksPerDataset: 30 });
    } catch (err) {
      logger.error({ err }, "Cron agent error");
    }
  }, intervalMs);
}

export function stopAgentCron(): void {
  if (cronTimer) { clearInterval(cronTimer); cronTimer = null; }
}
