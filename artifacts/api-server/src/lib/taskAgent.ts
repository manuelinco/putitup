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

// ── Multi-angle image question system ─────────────────────────────────────────
//
// MATH: 1,000,000 unique Picsum seeds × 26 angles × (C(pool,4) option combos)
//       → theoretically BILLIONS of unique (image, question, options) combinations.
//
// Each angle has a large option pool. We pick a random subset each time,
// so even the SAME image + SAME question produces different answer options.

interface ImageAngle {
  category: string;      // shown as badge in the UI: "COLOR", "EMOTION", etc.
  emoji: string;         // UI decoration
  question: string;
  optionPool: string[];
  pick: number;
  difficulty: "easy" | "medium" | "hard";
}

const IMAGE_ANGLE_POOL: ImageAngle[] = [
  // ── COLOR / PALETTE ───────────────────────────────────────────────────────
  {
    category: "COLOR", emoji: "🎨",
    question: "What is the dominant color in this image?",
    optionPool: ["red","blue","green","yellow","orange","purple","brown","grey","white","black","pink","cyan","teal","gold","silver","beige","navy","olive","maroon","magenta"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "COLOR", emoji: "🎨",
    question: "How would you describe the color palette of this image?",
    optionPool: ["warm tones","cool tones","monochromatic","complementary","pastel","saturated","desaturated","earthy","neon","metallic"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "COLOR", emoji: "🎨",
    question: "What percentage of this image appears to be dark-colored?",
    optionPool: ["0–20%","20–40%","40–60%","60–80%","80–100%"],
    pick: 4, difficulty: "easy",
  },

  // ── EMOTION / SENSATION ───────────────────────────────────────────────────
  {
    category: "EMOTION", emoji: "💭",
    question: "What emotion does this image primarily evoke?",
    optionPool: ["joy","calm","sadness","fear","surprise","disgust","awe","nostalgia","excitement","melancholy","serenity","unease","admiration","loneliness","hope","anxiety"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "EMOTION", emoji: "💭",
    question: "What sensation does this image evoke?",
    optionPool: ["warm","cold","wet","dry","soft","rough","light","heavy","fresh","stale","sharp","gentle","spacious","claustrophobic","energizing","relaxing"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "EMOTION", emoji: "💭",
    question: "What mood best describes the atmosphere of this image?",
    optionPool: ["cheerful","melancholic","tense","peaceful","mysterious","romantic","dramatic","whimsical","gloomy","vibrant","solemn","playful","nostalgic","surreal"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "EMOTION", emoji: "💭",
    question: "If this image were music, which genre would it be?",
    optionPool: ["classical","jazz","rock","electronic","folk","hip-hop","ambient","opera","blues","pop","metal","country"],
    pick: 4, difficulty: "hard",
  },

  // ── SCALE / DIMENSION ─────────────────────────────────────────────────────
  {
    category: "SCALE", emoji: "📐",
    question: "How large does the main subject appear relative to the frame?",
    optionPool: ["very small (< 10%)","small (10–30%)","medium (30–60%)","large (60–80%)","fills the frame (> 80%)"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "SCALE", emoji: "📐",
    question: "What is the estimated depth of field in this image?",
    optionPool: ["very shallow","shallow","moderate","deep","infinite / flat"],
    pick: 4, difficulty: "hard",
  },
  {
    category: "SCALE", emoji: "📐",
    question: "How would you describe the spatial composition?",
    optionPool: ["centered","rule of thirds","symmetrical","diagonal","asymmetrical","panoramic","close-up","wide shot","bird's eye","worm's eye"],
    pick: 4, difficulty: "hard",
  },

  // ── ENVIRONMENT / SCENE ───────────────────────────────────────────────────
  {
    category: "SCENE", emoji: "🌍",
    question: "What type of scene is depicted in this image?",
    optionPool: ["urban street","natural landscape","indoor room","underwater","aerial view","forest","beach","desert","mountain","city skyline","rural field","arctic","jungle","cave","space"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "SCENE", emoji: "🌍",
    question: "What is the primary setting of this image?",
    optionPool: ["home","office","restaurant","park","beach","forest","stadium","museum","school","hospital","factory","market","airport","church","lab"],
    pick: 4, difficulty: "easy",
  },

  // ── TIME / SEASON ─────────────────────────────────────────────────────────
  {
    category: "TIME", emoji: "⏰",
    question: "What time of day does this image suggest?",
    optionPool: ["dawn (4–7am)","morning (7–11am)","midday (11am–2pm)","afternoon (2–6pm)","sunset (6–8pm)","dusk (8–9pm)","night (9pm–4am)","unclear"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "TIME", emoji: "⏰",
    question: "What season does this image most closely suggest?",
    optionPool: ["early spring","late spring","early summer","late summer","early autumn","late autumn","winter","unclear / no season"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "TIME", emoji: "⏰",
    question: "What historical era does this image suggest?",
    optionPool: ["ancient (pre-500 AD)","medieval (500–1400)","early modern (1400–1800)","19th century","early 20th century","mid 20th century","modern (1980–2010)","contemporary (2010+)"],
    pick: 4, difficulty: "hard",
  },

  // ── LIGHT / ATMOSPHERE ────────────────────────────────────────────────────
  {
    category: "LIGHT", emoji: "💡",
    question: "How would you describe the lighting in this image?",
    optionPool: ["bright sunlight","soft diffused light","artificial fluorescent","warm incandescent","candlelight","moonlight","neon","flash","backlit (silhouette)","overcast","fog","golden hour","blue hour"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "LIGHT", emoji: "💡",
    question: "What is the contrast level in this image?",
    optionPool: ["very low (flat)","low","medium","high","very high (dramatic)"],
    pick: 4, difficulty: "medium",
  },

  // ── SUBJECT & FOCUS ───────────────────────────────────────────────────────
  {
    category: "SUBJECT", emoji: "🎯",
    question: "What is the main subject of this image?",
    optionPool: ["person","animal","plant","building","vehicle","food","object / product","text / sign","landscape","abstract pattern","water","sky","crowd","face"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "SUBJECT", emoji: "🎯",
    question: "How many distinct subjects can you identify in this image?",
    optionPool: ["none","1","2–3","4–5","6–10","more than 10","unclear"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "SUBJECT", emoji: "🎯",
    question: "What action or state is the main subject in?",
    optionPool: ["still / static","moving slowly","moving quickly","falling","flying","interacting","resting","working","eating","playing","fighting","observing"],
    pick: 4, difficulty: "medium",
  },

  // ── MOTION / ENERGY ───────────────────────────────────────────────────────
  {
    category: "ENERGY", emoji: "⚡",
    question: "How much visual energy or dynamism does this image convey?",
    optionPool: ["very calm (0)","calm (2)","moderate (5)","dynamic (7)","very dynamic (9)","chaotic (10)"],
    pick: 4, difficulty: "medium",
  },
  {
    category: "ENERGY", emoji: "⚡",
    question: "Does this image suggest movement or stillness?",
    optionPool: ["complete stillness","slight movement","moderate movement","fast movement","blurred motion","frozen motion","cyclical / repetitive"],
    pick: 4, difficulty: "medium",
  },

  // ── TEXTURE / MATERIAL ────────────────────────────────────────────────────
  {
    category: "TEXTURE", emoji: "💎",
    question: "What texture is most prominent in this image?",
    optionPool: ["smooth","rough","glossy","matte","grainy","metallic","wooden","fabric","stone","liquid","sandy","organic","geometric"],
    pick: 4, difficulty: "medium",
  },

  // ── STYLE / AESTHETIC ─────────────────────────────────────────────────────
  {
    category: "STYLE", emoji: "✨",
    question: "Which visual style best describes this image?",
    optionPool: ["photorealistic","cinematic","minimalist","maximalist","abstract","vintage / retro","futuristic","documentary","artistic","commercial / advertising","editorial","street photography"],
    pick: 4, difficulty: "hard",
  },
  {
    category: "STYLE", emoji: "✨",
    question: "How would you classify this image's aesthetic?",
    optionPool: ["elegant","raw","playful","serious","surreal","ordinary","luxurious","industrial","natural","urban","spiritual","scientific"],
    pick: 4, difficulty: "hard",
  },

  // ── NATURE / ORGANIC ─────────────────────────────────────────────────────
  {
    category: "NATURE", emoji: "🌿",
    question: "How much of this image contains natural elements?",
    optionPool: ["0% (fully man-made)","1–25%","25–50%","50–75%","75–99%","100% (fully natural)"],
    pick: 4, difficulty: "easy",
  },
  {
    category: "NATURE", emoji: "🌿",
    question: "What is the primary natural element in this image?",
    optionPool: ["water","trees","sky","grass","rocks","flowers","animals","mountains","clouds","fire","ice","sand","none (artificial)"],
    pick: 4, difficulty: "easy",
  },

  // ── GEOGRAPHY ─────────────────────────────────────────────────────────────
  {
    category: "GEOGRAPHY", emoji: "🗺️",
    question: "In which continent or region does this image appear to be set?",
    optionPool: ["Europe","North America","South America","Africa","Middle East","East Asia","South Asia","Southeast Asia","Oceania","Arctic / Antarctic","unclear"],
    pick: 4, difficulty: "hard",
  },
];

function getImageAngles(
  count: number,
  preferredCategories?: string[],
): Array<{ category: string; emoji: string; question: string; options: string[]; difficulty: "easy" | "medium" | "hard" }> {
  let pool = IMAGE_ANGLE_POOL;
  if (preferredCategories?.length) {
    const preferred = pool.filter((a) => preferredCategories.includes(a.category));
    const rest = pool.filter((a) => !preferredCategories.includes(a.category));
    pool = [...preferred, ...rest];
  }
  const shuffled = pickRandom(pool, Math.min(count, pool.length));
  return shuffled.map((a) => ({
    category: a.category,
    emoji: a.emoji,
    question: a.question,
    // Randomise option subset every time → same image + same question = different options
    options: pickRandom(a.optionPool, Math.min(a.pick, a.optionPool.length)),
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

/**
 * Picsum Photos — accepts any integer seed 0–999999.
 * Using a large random range gives near-infinite unique image URLs,
 * each returning a deterministic photo from Picsum's library.
 * Combined with 26 question angles and randomised option subsets,
 * the theoretical task space is in the billions.
 */
function fetchPicsumImages(count: number, seedOffset = 0): FetchedContent[] {
  return Array.from({ length: count }, (_, i) => {
    // Use large random seed from the full 0–999999 space
    const seed = seedOffset > 0
      ? seedOffset + i
      : Math.floor(Math.random() * 1_000_000);
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
                  angleCategory: angle.category,
                  angleEmoji: angle.emoji,
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
