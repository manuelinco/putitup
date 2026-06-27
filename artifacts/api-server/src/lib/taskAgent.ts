import Groq from "groq-sdk";
import { db, datasetsTable, tasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const GROQ_API_KEY = process.env["GROQ_API_KEY"];

const groq = GROQ_API_KEY
  ? new Groq({ apiKey: GROQ_API_KEY })
  : null;

// ── Tipi interni ──────────────────────────────────────────────────────────────

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
  type: "image" | "text";
  imageUrl?: string;
  text?: string;
  sourceUrl: string;
  sourceName: string;
}

// ── Stato in memoria dell'ultimo run ──────────────────────────────────────────

let lastRun: AgentRun | null = null;
let running = false;

export function getLastRun(): AgentRun | null { return lastRun; }
export function isRunning(): boolean { return running; }

// ── Sorgenti di contenuto reale ───────────────────────────────────────────────

/**
 * Wikimedia Commons: immagini con licenza libera indicizzate per categoria.
 * Usiamo l'API MediaWiki — nessuna chiave richiesta.
 */
async function fetchWikimediaImages(
  category: string,
  limit = 20,
): Promise<FetchedContent[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=Category:${encodeURIComponent(category)}&cmtype=file&cmlimit=${limit}` +
    `&cmnamespace=6&prop=imageinfo&iiprop=url&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const members: any[] = json?.query?.categorymembers ?? [];

  // Per ogni file recuperiamo l'URL diretto
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
    .map((p: any) => ({
      type: "image" as const,
      imageUrl: p.imageinfo[0].url as string,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      sourceName: "Wikimedia Commons",
    }));
}

/**
 * Wikipedia: estratti di testo da articoli in italiano o inglese.
 */
async function fetchWikipediaTexts(
  titles: string[],
  lang = "it",
): Promise<FetchedContent[]> {
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
 * Picsum Photos: immagini di alta qualità con seed deterministico.
 * Usiamo seed casuali per variare il contenuto ad ogni run.
 */
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

/**
 * Reddit: post pubblici in JSON (no auth needed per feed pubblici).
 */
async function fetchRedditTexts(
  subreddit: string,
  limit = 15,
): Promise<FetchedContent[]> {
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

// ── Generazione task via Groq LLM ─────────────────────────────────────────────

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
    // Fallback deterministico senza LLM
    return Array.from({ length: count }, () => ({
      question: content.type === "image"
        ? "Quale categoria descrive meglio questo contenuto?"
        : "Classifica questo testo nella categoria corretta.",
      options: labels.slice(0, 4),
      difficulty: "easy" as const,
    }));
  }

  const contentDesc =
    content.type === "image"
      ? `Immagine da: ${content.sourceName} (URL: ${content.imageUrl})`
      : `Testo da ${content.sourceName}: "${content.text}"`;

  const prompt = `You are an AI data labeling expert. Generate ${count} annotation tasks for this content.

CONTENT: ${contentDesc}
DATASET CATEGORY: ${datasetCategory}
AVAILABLE LABELS: ${labels.join(", ")}

Generate varied, realistic classification tasks. For each task:
- Write a clear question in ENGLISH (no accented characters)
- Provide 3-4 answer options (use the provided labels)
- Indicate the correct answer if deducible from the content
- Set difficulty: easy | medium | hard

Reply ONLY with valid JSON, an array of objects with fields: question, options (array), correctAnswer (string or null), difficulty.
Example: [{"question":"...","options":["a","b","c"],"correctAnswer":"a","difficulty":"easy"}]`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    // Estrai JSON anche se il modello aggiunge testo extra
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as GeneratedTask[];
    return parsed.filter(
      (t) => t.question && Array.isArray(t.options) && t.options.length >= 2,
    );
  } catch (err) {
    logger.warn({ err }, "Groq generation failed — using fallback");
    return Array.from({ length: count }, () => ({
      question:
        content.type === "image"
          ? "Quale categoria descrive meglio questo contenuto?"
          : "Classifica questo testo nella categoria corretta.",
      options: labels.slice(0, 4),
      difficulty: "easy" as const,
    }));
  }
}

// ── Configurazione sorgenti per categoria dataset ─────────────────────────────

interface DatasetAgentConfig {
  contentType: "image" | "text" | "mixed";
  sources: Array<
    | { kind: "wikimedia"; category: string }
    | { kind: "wikipedia"; titles: string[]; lang?: string }
    | { kind: "picsum"; count: number }
    | { kind: "reddit"; subreddit: string }
  >;
  labels: string[];
  tasksPerContent: number;
}

const DATASET_AGENT_CONFIG: Record<string, DatasetAgentConfig> = {
  // Classificazione immagini generica
  "image_classification": {
    contentType: "image",
    sources: [
      { kind: "wikimedia", category: "Animals" },
      { kind: "wikimedia", category: "Vehicles" },
      { kind: "picsum", count: 10 },
    ],
    labels: ["animal", "vehicle", "person", "building", "nature", "object"],
    tasksPerContent: 2,
  },
  // Espressioni facciali
  "facial_expression": {
    contentType: "image",
    sources: [
      { kind: "wikimedia", category: "Facial_expressions" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["happy", "sad", "angry", "surprised", "neutral", "fear"],
    tasksPerContent: 1,
  },
  // Controllo qualità prodotti
  "product_quality": {
    contentType: "image",
    sources: [
      { kind: "wikimedia", category: "Product_photography" },
      { kind: "picsum", count: 15 },
    ],
    labels: ["defect", "ok", "uncertain"],
    tasksPerContent: 2,
  },
  // Classificazione testi / sentiment
  "text_classification": {
    contentType: "text",
    sources: [
      { kind: "wikipedia", titles: ["Intelligenza artificiale", "Machine learning", "Big data", "Cloud computing"], lang: "it" },
      { kind: "reddit", subreddit: "technology" },
      { kind: "reddit", subreddit: "science" },
    ],
    labels: ["technology", "science", "business", "health", "politics", "entertainment"],
    tasksPerContent: 3,
  },
  // Sentiment analysis
  "sentiment": {
    contentType: "text",
    sources: [
      { kind: "reddit", subreddit: "worldnews" },
      { kind: "reddit", subreddit: "italy" },
      { kind: "wikipedia", titles: ["Economia italiana", "Innovazione", "Sostenibilità ambientale"], lang: "it" },
    ],
    labels: ["positive", "negative", "neutral"],
    tasksPerContent: 3,
  },
  // Land use / satellite
  "satellite": {
    contentType: "image",
    sources: [
      { kind: "wikimedia", category: "Satellite_images_of_Italy" },
      { kind: "wikimedia", category: "Aerial_photographs" },
      { kind: "picsum", count: 10 },
    ],
    labels: ["urban", "forest", "agriculture", "water", "industrial", "desert"],
    tasksPerContent: 2,
  },
  // Medical / clinical text
  "medical_text": {
    contentType: "text",
    sources: [
      { kind: "wikipedia", titles: ["Medicina", "Farmacologia", "Diagnosi medica", "Emergenza medica"], lang: "it" },
      { kind: "wikipedia", titles: ["Medicine", "Pharmacology", "Clinical trial", "Triage"], lang: "en" },
    ],
    labels: ["urgent", "routine", "administrative", "diagnostic", "therapeutic"],
    tasksPerContent: 3,
  },
  // Default fallback
  "default": {
    contentType: "mixed",
    sources: [
      { kind: "picsum", count: 20 },
      { kind: "wikipedia", titles: ["Tecnologia", "Ambiente", "Arte", "Sport", "Cucina italiana"], lang: "it" },
    ],
    labels: ["relevant", "not_relevant", "uncertain"],
    tasksPerContent: 2,
  },
};

function getConfigForDataset(dataset: { id: number; category: string; name: string }): DatasetAgentConfig {
  const cat = dataset.category.toLowerCase();
  const name = dataset.name.toLowerCase();

  if (name.includes("facial") || name.includes("espression") || name.includes("expression")) return DATASET_AGENT_CONFIG["facial_expression"]!;
  if (name.includes("quality") || name.includes("qualità")) return DATASET_AGENT_CONFIG["product_quality"]!;
  if (name.includes("satellite") || name.includes("land use")) return DATASET_AGENT_CONFIG["satellite"]!;
  if (name.includes("medical") || name.includes("triage")) return DATASET_AGENT_CONFIG["medical_text"]!;
  if (name.includes("sentiment") || name.includes("opinion")) return DATASET_AGENT_CONFIG["sentiment"]!;
  if (cat.includes("text") || name.includes("text") || name.includes("document") || name.includes("ocr")) return DATASET_AGENT_CONFIG["text_classification"]!;
  if (cat.includes("image") || name.includes("image") || name.includes("photo")) return DATASET_AGENT_CONFIG["image_classification"]!;

  return DATASET_AGENT_CONFIG["default"]!;
}

// ── Fetch contenuto da una sorgente ───────────────────────────────────────────

async function fetchFromSource(
  source: DatasetAgentConfig["sources"][number],
): Promise<FetchedContent[]> {
  try {
    switch (source.kind) {
      case "wikimedia":
        return await fetchWikimediaImages(source.category);
      case "wikipedia":
        return await fetchWikipediaTexts(source.titles, source.lang ?? "it");
      case "picsum":
        return fetchPicsumImages(source.count);
      case "reddit":
        return await fetchRedditTexts(source.subreddit);
    }
  } catch (err) {
    logger.warn({ err, source }, "Source fetch failed");
    return [];
  }
}

// ── Runner principale ──────────────────────────────────────────────────────────

export interface AgentRunOptions {
  datasetIds?: number[];        // se vuoto → tutti i dataset attivi
  tasksPerDataset?: number;     // quante task creare per dataset (default 50)
  dryRun?: boolean;             // non scrivere nel DB
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
    log("🤖 Task Agent avviato");

    // 1. Recupera dataset target
    let datasets = await db.select().from(datasetsTable);
    if (options.datasetIds?.length) {
      datasets = datasets.filter((d) => options.datasetIds!.includes(d.id));
    }
    // Solo dataset attivi/pubblicati
    datasets = datasets.filter((d) => ["active", "published", "draft"].includes(d.status));

    log(`📊 Dataset da processare: ${datasets.length}`);

    const tasksPerDataset = options.tasksPerDataset ?? 50;

    for (const dataset of datasets) {
      try {
        log(`\n▶ Dataset #${dataset.id}: ${dataset.name}`);
        const config = getConfigForDataset(dataset);
        const labels = config.labels;

        // 2. Recupera contenuto da tutte le sorgenti
        const allContent: FetchedContent[] = [];
        for (const source of config.sources) {
          const items = await fetchFromSource(source);
          allContent.push(...items);
          log(`  ↳ ${source.kind}: ${items.length} elementi`);
        }

        if (allContent.length === 0) {
          log(`  ⚠ Nessun contenuto recuperato — uso Picsum fallback`);
          allContent.push(...fetchPicsumImages(20, dataset.id * 100));
        }

        // 3. Genera task con Groq
        const taskRows: Parameters<typeof db.insert>[0] extends any ? any[] : never[] = [];
        let created = 0;

        for (const content of allContent) {
          if (created >= tasksPerDataset) break;

          const generated = await generateTasksWithGroq(
            content,
            dataset.category,
            labels,
            Math.min(config.tasksPerContent, tasksPerDataset - created),
          );

          for (const g of generated) {
            if (created >= tasksPerDataset) break;

            const isImage = content.type === "image";
            const isText = content.type === "text";

            const dataPayload: Record<string, unknown> = {
              question: g.question,
              options: g.options,
              source: content.sourceUrl,
              sourceName: content.sourceName,
              agentGenerated: true,
              ...(isImage ? { imageUrl: content.imageUrl } : {}),
              ...(isText ? { text: content.text } : {}),
            };

            taskRows.push({
              datasetId: dataset.id,
              type: isImage ? "image" : "text",
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

        // 4. Insert nel DB (batch da 100)
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

        log(`  ✅ ${taskRows.length} task create${options.dryRun ? " (dry run)" : ""}`);
        run.tasksCreated += taskRows.length;
        run.datasetsProcessed++;

        // Pausa tra dataset per non sovraccaricare le API esterne
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`  ❌ Errore dataset #${dataset.id}: ${msg}`);
        run.errors.push(`Dataset #${dataset.id}: ${msg}`);
      }
    }

    run.status = "done";
    run.finishedAt = new Date();
    const elapsed = Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000);
    log(`\n🏁 Completato in ${elapsed}s — ${run.tasksCreated} task create su ${run.datasetsProcessed} dataset`);
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

// ── Cron interno: ogni ora ─────────────────────────────────────────────────────

let cronTimer: ReturnType<typeof setInterval> | null = null;

export function startAgentCron(intervalMs = 60 * 60 * 1000): void {
  if (cronTimer) return;
  logger.info(`🤖 Task Agent cron avviato (ogni ${intervalMs / 60000} min)`);
  cronTimer = setInterval(async () => {
    if (running) {
      logger.info("Cron: agent già in esecuzione, skip");
      return;
    }
    logger.info("Cron: avvio run automatico");
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
