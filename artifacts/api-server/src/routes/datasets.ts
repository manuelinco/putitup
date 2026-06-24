import { Router, type IRouter } from "express";
import { eq, desc, ilike, and } from "drizzle-orm";
import { db, datasetsTable, activityEventsTable, usersTable, tasksTable } from "@workspace/db";
import {
  ListDatasetsQueryParams,
  CreateDatasetBody,
  GetDatasetParams,
  UpdateDatasetParams,
  UpdateDatasetBody,
  DownloadDatasetParams,
  DownloadDatasetBody,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/datasets/featured", async (_req, res): Promise<void> => {
  const datasets = await db
    .select()
    .from(datasetsTable)
    .orderBy(desc(datasetsTable.downloadCount))
    .limit(6);
  res.json(datasets);
});

router.get("/datasets/categories", async (_req, res): Promise<void> => {
  const results = await db
    .select({
      category: datasetsTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(datasetsTable)
    .groupBy(datasetsTable.category)
    .orderBy(desc(sql`count(*)`));
  res.json(results);
});

router.get("/datasets", async (req, res): Promise<void> => {
  const parsed = ListDatasetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, accessType, search, limit, offset } = parsed.data;

  let query = db.select().from(datasetsTable).$dynamic();
  const conditions = [];
  if (category) conditions.push(eq(datasetsTable.category, category));
  if (accessType) conditions.push(eq(datasetsTable.accessType, accessType));
  if (search) conditions.push(ilike(datasetsTable.name, `%${search}%`));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const datasets = await query
    .orderBy(desc(datasetsTable.downloadCount))
    .limit(limit ?? 20)
    .offset(offset ?? 0);
  res.json(datasets);
});

router.post("/datasets", async (req, res): Promise<void> => {
  const {
    name,
    description,
    category,
    accessType = "ads",
    qualityScore = 0,
    price = null,
    adsRequired = 5,
    tokenCost = 10,
    workflowMode = "consensus",
    votesRequired = 3,
    consensusThreshold = 0.8,
    supervisorId = null,
    importMode = "manual",
    requestedTaskCount = 0,
    tags = [],
  } = req.body ?? {};

  if (!name || !description || !category) {
    res.status(400).json({ error: "name, description and category are required" });
    return;
  }

  const [dataset] = await db
    .insert(datasetsTable)
    .values({
      name: String(name),
      description: String(description),
      category: String(category),
      accessType,
      qualityScore: Number(qualityScore),
      price: price === null || price === "" ? null : Number(price),
      adsRequired: Number(adsRequired),
      tokenCost: Number(tokenCost),
      workflowMode: String(workflowMode),
      status: "active",
      votesRequired: Number(votesRequired),
      consensusThreshold: Number(consensusThreshold),
      supervisorId: supervisorId ? Number(supervisorId) : null,
      importMode: String(importMode),
      requestedTaskCount: Number(requestedTaskCount),
      tags: Array.isArray(tags) ? tags.map(String) : [],
    })
    .returning();
  res.status(201).json(dataset);
});

// ─── Contenuti reali per tipo di task ─────────────────────────────────────
const REAL_TEXT_SAMPLES: Record<string, string[]> = {
  spam: [
    "Congratulazioni! Hai vinto un iPhone 15. Clicca qui per ritirare il premio: bit.ly/claim99",
    "URGENTE: Il tuo account è stato compromesso. Accedi subito: secure-bank-verify.net",
    "Offerta esclusiva solo per te! Guadagna €500 al giorno da casa. Iscriviti gratis ora.",
    "Il tuo pacco è in attesa. Paga €1,99 di spese di giacenza: dhl-delivery-update.com",
    "Sei stato selezionato per un rimborso fiscale di €840. Compila il modulo: irs-refund-it.net",
  ],
  not_spam: [
    "Ciao Marco, ti confermo la riunione di domani alle 10:00 in sala conferenze B.",
    "La tua fattura n. 2024-0123 è disponibile nell'area clienti. Scadenza: 30 giorni.",
    "Newsletter mensile: le novità di ottobre dalla redazione di TechReview Italia.",
    "Promemoria: il tuo abbonamento premium scade il 15 del mese. Puoi rinnovarlo quando vuoi.",
    "Grazie per il tuo ordine! La spedizione è prevista entro 2-3 giorni lavorativi.",
  ],
  positive: [
    "Il prodotto è arrivato in perfette condizioni, spedizione rapida e imballaggio curato. Consigliatissimo!",
    "Servizio clienti eccellente, hanno risolto il mio problema in pochi minuti. Esperienza fantastica.",
    "Qualità superiore alle aspettative, il materiale è robusto e ben rifinito. Acquisto da rifare.",
  ],
  negative: [
    "Spedizione arrivata in ritardo di 10 giorni senza alcuna comunicazione. Molto deluso.",
    "Il prodotto non corrisponde alla descrizione: dimensioni diverse e colore sbagliato. Rimborso richiesto.",
    "Servizio clienti irraggiungibile, 3 email senza risposta. Non acquisterò mai più qui.",
  ],
  complaint: [
    "Buongiorno, vorrei segnalare che l'articolo ricevuto presenta un difetto nella cucitura laterale.",
    "Sono molto insoddisfatto del servizio: l'ordine è arrivato incompleto e nessuno risponde.",
    "Richiedere un reso è stato un percorso a ostacoli durato tre settimane. Inaccettabile.",
  ],
  question: [
    "Salve, è possibile effettuare il reso entro 60 giorni anziché 30 per i prodotti tech?",
    "Avete disponibilità del modello blu nella taglia M? Non riesco a trovarlo sul sito.",
    "Come posso modificare l'indirizzo di spedizione dopo aver completato l'ordine?",
  ],
  compliment: [
    "Volevo solo ringraziarvi: l'assistenza di ieri è stata straordinaria, operatore molto professionale.",
    "Il nuovo packaging è fantastico e sostenibile. Ottima scelta per l'ambiente!",
  ],
  return: [
    "Vorrei avviare la procedura di reso per l'ordine #IT-2024-88761, prodotto non conforme.",
    "Il prodotto ricevuto è danneggiato. Allego foto e chiedo sostituzione immediata.",
  ],
  billing: [
    "Ho ricevuto una doppia addebito sulla carta per l'ordine del 12 maggio. Chiedo rimborso.",
    "La fattura n. 2024-441 riporta un importo errato: €89 anziché €69 come concordato.",
  ],
};

const AUDIO_EMOTION_SAMPLES = ["joy", "sadness", "anger", "fear", "surprise", "neutral"];
const AUDIO_LANG_SAMPLES = ["it", "en", "fr", "de", "es", "pt"];
const VIDEO_ACTION_SAMPLES = ["running", "jumping", "walking", "cycling", "swimming", "dancing", "cooking", "reading"];
const LAND_USE_SAMPLES = ["urban", "forest", "agriculture", "water", "desert", "wetland"];

function buildTaskPayload(type: string, label: string, datasetId: number, index: number): Record<string, unknown> {
  const seed = `${datasetId}-${index}`;
  const imgUrl = `https://picsum.photos/seed/${seed}/640/420`;
  const faceUrl = `https://picsum.photos/seed/face-${seed}/480/480`;
  const satUrl  = `https://picsum.photos/seed/sat-${seed}/640/480`;

  if (type === "image") {
    return {
      question: "Che cosa è visibile nell'immagine?",
      imageUrl: imgUrl,
      options: label.split(","),
      source: "generator",
    };
  }
  if (type === "audio") {
    const audioType = label.startsWith("lang") ? "language" : label.startsWith("emo") ? "emotion" : "transcription";
    return {
      question: audioType === "transcription" ? "Trascrivi ciò che senti in questo audio." :
                audioType === "language"      ? "Che lingua viene parlata in questo audio?" :
                                               "Che emozione trasmette questa voce?",
      audioUrl: `https://samples.putitup.io/audio/${audioType}/${seed}.mp3`,
      options: audioType === "emotion" ? AUDIO_EMOTION_SAMPLES :
               audioType === "language" ? AUDIO_LANG_SAMPLES : undefined,
      source: "generator",
    };
  }
  if (type === "video") {
    return {
      question: "Quale azione viene eseguita in questo video?",
      videoUrl: `https://samples.putitup.io/video/action/${seed}.mp4`,
      options: VIDEO_ACTION_SAMPLES,
      source: "generator",
    };
  }
  // text — usa veri campioni di testo, mai placeholder
  const category = Object.keys(REAL_TEXT_SAMPLES).find(k => label.includes(k)) ?? "spam";
  const pool = REAL_TEXT_SAMPLES[category] ?? REAL_TEXT_SAMPLES.spam;
  const text = pool[index % pool.length];
  const allCategories = Array.from(new Set([...Object.keys(REAL_TEXT_SAMPLES).slice(0, 5), label]));
  return {
    question: "Classifica questo testo nella categoria più appropriata.",
    text,
    options: allCategories,
    source: "generator",
  };
}

// ─── Dataset metadata per tipo automatico ─────────────────────────────────
const DATASET_TYPE_MAP: Record<number, { type: string; labels: string[] }> = {
  10: { type: "image",  labels: ["spam,not_spam"] },
  11: { type: "image",  labels: ["positive", "negative", "neutral"] },
  12: { type: "image",  labels: ["cat", "dog", "car", "person", "bike"] },
  13: { type: "image",  labels: ["complaint", "question", "return", "compliment", "billing"] },
  14: { type: "image",  labels: ["satellite_urban", "satellite_forest"] },
  15: { type: "image",  labels: ["urban", "rural", "industrial"] },
  16: { type: "audio",  labels: ["transcription"] },
  17: { type: "audio",  labels: ["emo_joy", "emo_sadness", "emo_anger", "emo_neutral"] },
  18: { type: "audio",  labels: ["lang_it", "lang_en", "lang_fr", "lang_de"] },
  19: { type: "video",  labels: ["running", "walking", "jumping", "cycling"] },
  20: { type: "image",  labels: ["cat", "dog", "car", "person", "tree", "building"] },
  21: { type: "image",  labels: ["happy", "sad", "angry", "surprised", "neutral", "fear"] },
  22: { type: "image",  labels: ["defect", "ok", "uncertain"] },
  23: { type: "audio",  labels: ["transcription_en"] },
  24: { type: "audio",  labels: ["transcription_it"] },
  25: { type: "audio",  labels: ["transcription_fr"] },
  26: { type: "audio",  labels: ["lang_it", "lang_en", "lang_fr", "lang_de", "lang_es"] },
  27: { type: "audio",  labels: ["emo_joy", "emo_sadness", "emo_anger", "emo_fear", "emo_neutral"] },
  28: { type: "video",  labels: ["running", "jumping", "walking", "cycling", "swimming", "dancing"] },
  29: { type: "image",  labels: [LAND_USE_SAMPLES.join(",satellite")] },
};

router.post("/datasets/:id/generate-tasks", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { count = 25, type: reqType, prompt, options: reqOptions } = req.body ?? {};
  const safeCount = Math.min(Math.max(Number(count) || 1, 1), 1000);

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, id));
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  // Deduce type and labels from dataset ID if not provided
  const meta = DATASET_TYPE_MAP[id];
  const type   = reqType ?? meta?.type ?? "image";
  const labels: string[] = Array.isArray(reqOptions) && reqOptions.length > 1
    ? reqOptions.map(String)
    : (meta?.labels ?? ["cat", "dog", "car", "person"]);

  const rows = Array.from({ length: safeCount }, (_, index) => {
    const label = labels[index % labels.length];
    const question = prompt ?? undefined;
    const payload = buildTaskPayload(type, label, dataset.id, index);
    if (question) payload.question = question;
    return {
      datasetId: dataset.id,
      type,
      dataPayload: payload,
      difficulty: "easy" as const,
      pointsReward: 10,
      requiredVotes: dataset.votesRequired,
      consensusThreshold: dataset.consensusThreshold,
      supervisorId: dataset.supervisorId,
      taskValuePoints: 10,
      operatorRewardTon: 0.002,
      supervisorRewardTon: 0.0001,
      rawSource: "admin_generator",
    };
  });

  const created = await db.insert(tasksTable).values(rows).returning();
  await db.update(datasetsTable).set({
    requestedTaskCount: dataset.requestedTaskCount + safeCount,
    recordCount: (dataset.recordCount ?? 0) + safeCount,
  }).where(eq(datasetsTable.id, dataset.id));

  res.status(201).json({ created: created.length, requested: Number(count), cappedAt: safeCount, datasetId: dataset.id });
});

router.post("/datasets/nightly-publish", async (_req, res): Promise<void> => {
  const datasets = await db.select().from(datasetsTable);
  const now = new Date();
  const results = [];

  for (const dataset of datasets) {
    const approved = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.datasetId, dataset.id), eq(tasksTable.status, "approved")));

    const qualityScore = dataset.requestedTaskCount > 0
      ? Math.min(99.9, Math.round((approved.length / dataset.requestedTaskCount) * 1000) / 10)
      : dataset.qualityScore;

    const [updated] = await db.update(datasetsTable).set({
      approvedRecordCount: approved.length,
      qualityScore,
      status: approved.length > 0 ? "published" : dataset.status,
      nightlyPublishedAt: now,
    }).where(eq(datasetsTable.id, dataset.id)).returning();

    results.push({ datasetId: dataset.id, approvedRecords: approved.length, status: updated.status });
  }

  res.json({ publishedAt: now, results });
});

router.get("/datasets/:id", async (req, res): Promise<void> => {
  const params = GetDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [dataset] = await db
    .select()
    .from(datasetsTable)
    .where(eq(datasetsTable.id, params.data.id));

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  res.json(dataset);
});

router.patch("/datasets/:id", async (req, res): Promise<void> => {
  const params = UpdateDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dataset] = await db
    .update(datasetsTable)
    .set(parsed.data)
    .where(eq(datasetsTable.id, params.data.id))
    .returning();

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  res.json(dataset);
});

router.post("/datasets/:id/download", async (req, res): Promise<void> => {
  const params = DownloadDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = DownloadDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dataset] = await db
    .update(datasetsTable)
    .set({ downloadCount: sql`${datasetsTable.downloadCount} + 1` })
    .where(eq(datasetsTable.id, params.data.id))
    .returning();

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  if (parsed.data.userId) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.userId));

    if (user) {
      await db.insert(activityEventsTable).values({
        type: "dataset_downloaded",
        userId: user.id,
        username: user.username,
        description: `${user.username} downloaded "${dataset.name}"`,
        metadata: { datasetId: dataset.id, paymentMethod: parsed.data.paymentMethod },
      });
    }
  }

  res.json(dataset);
});

export default router;
