import { Router, type IRouter } from "express";
import { eq, and, notInArray, desc, gte, lt, sql } from "drizzle-orm";
import { db, tasksTable, taskResponsesTable, rewardLedgerTable, usersTable, taskReportsTable } from "@workspace/db";
import { sendTonPayout } from "../lib/ton-payout";
import { requireUser } from "../middleware/requireUser";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  GetNextTaskQueryParams,
} from "@workspace/api-zod";
import {
  generateVirtualTask,
  VIRTUAL_DATASET_IDS,
  VIRTUAL_SLOT_COUNT,
} from "../lib/virtualTasks";

const router: IRouter = Router();

router.get("/tasks/stats", async (_req, res): Promise<void> => {
  const [
    [totalRow],
    [responseCountRow],
    byTypeRows,
    byDifficultyRows,
    [goldenRow],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(tasksTable),
    db.select({ count: sql<number>`count(*)::int` }).from(taskResponsesTable),
    db.select({ type: tasksTable.type, count: sql<number>`count(*)::int` })
      .from(tasksTable).groupBy(tasksTable.type),
    db.select({ difficulty: tasksTable.difficulty, count: sql<number>`count(*)::int` })
      .from(tasksTable).groupBy(tasksTable.difficulty),
    db.select({ count: sql<number>`count(*)::int` }).from(tasksTable).where(eq(tasksTable.isGolden, true)),
  ]);

  const total = totalRow?.count ?? 0;
  const totalResponses = responseCountRow?.count ?? 0;
  const goldenCount = goldenRow?.count ?? 0;

  const byType = { image: 0, text: 0, classification: 0 } as Record<string, number>;
  for (const r of byTypeRows) byType[r.type] = r.count;

  const byDifficulty = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
  for (const r of byDifficultyRows) byDifficulty[r.difficulty] = r.count;

  const completionRate = total > 0 ? Math.min((totalResponses / (total * 3)) * 100, 100) : 0;

  res.json({
    total,
    byType,
    byDifficulty,
    goldenCount,
    completionRate: Math.round(completionRate * 10) / 10,
  });
});

const DATASET_OPTIONS: Record<number, string[]> = {
  // Text / NLP datasets
  10: ["positive", "negative", "neutral", "Other"],
  11: ["purchase", "browse", "return", "complaint", "inquiry", "Other"],
  13: ["Person", "Organization", "Location", "Date", "Product", "Other"],
  14: ["Response A is better", "Response B is better", "Both are equally good", "Both are poor", "Other"],
  15: ["Correct", "Minor errors", "Major errors", "Completely wrong", "Other"],
  16: ["Cardiology", "Neurology", "Oncology", "Emergency", "General Practice", "Orthopedics", "Other specialty"],
  17: ["Complaint", "Question", "Return request", "Compliment", "Billing issue", "Other"],
  18: ["Sincere", "Sarcastic", "Neutral", "Ambiguous", "Other"],
  // Image datasets — options cover ANY photo (no impossible answers)
  12: ["Person or people", "Animal or wildlife", "Vehicle or transport", "Building or architecture", "Nature or landscape", "Food or drink", "Electronics or technology", "Furniture or interior", "Other / Mixed"],
  19: ["Excellent", "Good", "Fair", "Poor", "Other"],
  20: ["Person or people", "Animal or wildlife", "Vehicle or transport", "Building or architecture", "Nature or landscape", "Food or drink", "Urban or street scene", "Abstract or texture", "Other"],
  21: ["Happy or joyful", "Sad or upset", "Angry or frustrated", "Surprised or shocked", "Neutral or calm", "No person or face visible", "Other"],
  22: ["Excellent — sharp, well-lit, professional", "Good — minor issues but usable", "Fair — noticeable blur or lighting problems", "Poor — very low quality or unusable", "Other / Cannot assess"],
  29: ["Urban or city environment", "Forest or woodland", "Countryside or farmland", "Coastal or water", "Desert or arid landscape", "Indoor or built interior", "Industrial or commercial site", "Other natural scene"],
  // Audio datasets
  23: ["Correct", "Minor word errors", "Missing words", "Completely wrong", "Other / Cannot assess"],
  24: ["Correct", "Minor errors", "Missing content", "Incorrect", "Other / Cannot assess"],
  25: ["Correct", "Minor errors", "Missing content", "Incorrect", "Other / Cannot assess"],
  26: ["English", "Italian", "French", "Spanish", "German", "Portuguese", "Other"],
  27: ["Happy", "Sad", "Angry", "Calm", "Excited", "Fearful", "Neutral", "Other"],
  // Video
  28: ["Running", "Cooking", "Driving", "Playing sports", "Working", "Dancing", "Reading", "Other"],
};

const AUDIO_TRANSCRIPTION_OPTIONS = [
  "Correct",
  "Incorrect - Word Error",
  "Incorrect - Missing Words",
  "Incorrect - Extra Words",
];

const SENTIMENT_OPTIONS = ["positive", "negative", "neutral"];
const BINARY_OPTIONS = ["Yes", "No"];

// ── Question variety ──────────────────────────────────────────────────────────
// Bug fix: tasks within a dataset used to repeat the SAME question while only the
// image/text changed. We diversify the QUESTION/PROMPT deterministically from the
// task seed (slot for virtual tasks, id for real ones) so consecutive tasks cycle
// through genuinely different phrasings/subtypes WITHOUT changing the meaning or
// the answer options (consensus stays intact). All phrasings are English-only to
// satisfy the englishOnly serving filter.
const QUESTION_VARIANTS: Record<number, string[]> = {
  10: [
    "What is the overall sentiment of this customer review?",
    "How would you classify the emotion expressed in this text?",
    "Rate the general sentiment of the following message:",
    "Does this review lean positive, negative, or neutral?",
    "What feeling best matches the tone of this comment?",
    "How does the author of this text seem to feel?",
    "Judge the sentiment conveyed by these words:",
    "Overall, is the writer happy, unhappy, or neutral here?",
  ],
  11: [
    "What is the customer's primary intent in this message?",
    "Classify the intent behind this support request:",
    "What action does the customer want to take?",
    "What is this customer mainly trying to do?",
    "Identify the goal of the customer in this message:",
    "Which category best captures this customer's request?",
    "What outcome is the customer looking for?",
    "Based on the text, what does the customer intend?",
  ],
  12: [
    "What is the primary subject in this image?",
    "Identify the main category of this photograph:",
    "What category best describes what you see in this image?",
    "Which single category fits the MAIN subject of this photo?",
    "Ignore the background — what is the dominant subject here?",
    "What is the most prominent thing shown in this image?",
    "Choose the category that best matches the focal subject:",
    "What does this picture mainly show?",
  ],
  13: [
    "What type of named entity is highlighted in this text?",
    "Classify the key entity mentioned in this sentence:",
    "What category does the main term in this text belong to?",
    "Which entity type best fits the highlighted name?",
    "Identify the type of the most important entity here:",
    "What kind of entity is referenced in this passage?",
    "Label the main proper noun in this sentence:",
    "Which named-entity category applies to this text?",
  ],
  14: [
    "Which AI response better answers the question?",
    "Compare these two responses and select the better one:",
    "Which answer is more helpful and accurate?",
    "Between Response A and Response B, which is stronger?",
    "Which reply best addresses the user's question?",
    "Pick the response that is more correct and useful:",
    "Which of the two answers would you prefer?",
    "Judge which response is of higher quality:",
  ],
  15: [
    "How accurate is this machine translation?",
    "Rate the quality of this translated text:",
    "Does this translation preserve the original meaning?",
    "How faithful is the translation to the source text?",
    "Assess how well this translation conveys the original:",
    "What is the quality level of this translation?",
    "Judge whether this translation is correct:",
    "How many errors does this translation contain?",
  ],
  16: [
    "Which medical specialty is most relevant for this case?",
    "Classify the medical department for this patient note:",
    "What specialty should review this medical record?",
    "To which medical field does this case best belong?",
    "Which department should handle this patient?",
    "Identify the most appropriate medical specialty here:",
    "What kind of specialist is needed for this case?",
    "Route this clinical note to the correct specialty:",
  ],
  17: [
    "What type of customer support ticket is this?",
    "Classify this support request:",
    "How should this customer message be routed?",
    "Which support category fits this message best?",
    "What kind of ticket should this be filed as?",
    "Identify the nature of this support request:",
    "How would you tag this customer message?",
    "What is the main type of this support contact?",
  ],
  18: [
    "Is this text sarcastic or sincere?",
    "Detect the tone of this online comment:",
    "How would you classify the writing style of this post?",
    "Does this message sound genuine or sarcastic?",
    "What is the underlying tone of these words?",
    "Judge whether the author means this literally:",
    "Is there sarcasm in this statement?",
    "Classify the intent behind the tone of this text:",
  ],
  19: [
    "Rate the overall quality of this image:",
    "How would you assess the visual quality?",
    "What is the quality tier of this photograph?",
    "How good is the overall quality of this picture?",
    "Grade the visual quality you see here:",
    "What quality level best describes this image?",
    "Judge the overall production quality of this photo:",
    "How would you rank the quality of this image?",
  ],
  20: [
    "What is the main subject or scene shown in this image?",
    "Which category best describes what you see in this photo?",
    "How would you classify the content of this image?",
    "What does this image primarily depict?",
    "Choose the scene type that best matches this picture:",
    "What is happening or shown in this image?",
    "Which content category fits this photo best?",
    "Identify the main scene captured here:",
  ],
  21: [
    "If a person's face is visible, what expression do they show? If not, select 'No face visible'.",
    "Identify the mood or expression visible in this image:",
    "What is the dominant human emotion visible, if any?",
    "What facial expression is shown, if a face is present?",
    "Which emotion best matches the person's expression here?",
    "If someone is pictured, how do they appear to feel?",
    "What expression does the subject of this photo convey?",
    "Read the emotion on the face in this image (or pick 'No person or face visible'):",
  ],
  22: [
    "Rate the overall visual quality and clarity of this image:",
    "How would you assess the technical quality of this photograph?",
    "Is this image suitable for professional or commercial use?",
    "Judge the sharpness, lighting and clarity of this photo:",
    "What is the technical quality level of this image?",
    "How usable is this image in terms of quality?",
    "Assess whether this photo meets professional standards:",
    "Grade the clarity and lighting of this picture:",
  ],
  23: [
    "Is this English transcription accurate?",
    "Rate the quality of this speech-to-text output:",
    "Does this transcription correctly capture the spoken words?",
    "How well does the transcript match the English audio?",
    "Judge the accuracy of this English transcription:",
    "Are the spoken words correctly written in this transcript?",
    "How faithful is this transcription to the audio?",
    "Assess whether this English transcript is correct:",
  ],
  24: [
    "Is this Italian transcription accurate?",
    "Rate the quality of this Italian speech-to-text:",
    "How well does this transcription match the audio?",
    "Does the transcript correctly capture the Italian speech?",
    "Judge the accuracy of this Italian transcription:",
    "Are the spoken Italian words written correctly here?",
    "How faithful is this transcript to the Italian audio?",
    "Assess whether this Italian transcription is correct:",
  ],
  25: [
    "Is this French transcription accurate?",
    "Rate the quality of this French speech-to-text output:",
    "Does the transcription match the spoken French?",
    "How well does the transcript capture the French audio?",
    "Judge the accuracy of this French transcription:",
    "Are the spoken French words written correctly here?",
    "How faithful is this transcript to the French audio?",
    "Assess whether this French transcription is correct:",
  ],
  26: [
    "What language is spoken in this audio clip?",
    "Identify the spoken language:",
    "Which language does this speaker use?",
    "In what language is this clip spoken?",
    "Detect the language of this recording:",
    "Which language can you hear in this audio?",
    "Name the language used by the speaker:",
    "What language is being spoken here?",
  ],
  27: [
    "What emotion does the speaker express?",
    "Classify the emotional tone of this voice:",
    "What is the speaker's primary emotion?",
    "How does the speaker seem to feel?",
    "Which emotion best matches this voice?",
    "Read the mood conveyed by the speaker:",
    "What feeling does the speaker's tone convey?",
    "Identify the dominant emotion in this audio:",
  ],
  28: [
    "What action is performed in this video clip?",
    "Classify the activity shown:",
    "What is the person doing in this scene?",
    "Which activity best describes this clip?",
    "Identify the main action taking place here:",
    "What is happening in this video?",
    "Choose the action that matches this scene:",
    "What activity is depicted in this clip?",
  ],
  29: [
    "What type of environment or setting is shown in this image?",
    "Classify the scene or location visible in this photo:",
    "Which environment best describes what this image shows?",
    "What kind of place is depicted in this picture?",
    "Identify the setting captured in this image:",
    "What environment does this photo represent?",
    "Choose the location type that fits this scene:",
    "Where does this image appear to be taken?",
  ],
};

function diversifyQuestion(
  datasetId: number | null | undefined,
  seed: number,
  fallback: string,
): string {
  if (!datasetId) return fallback;
  const variants = QUESTION_VARIANTS[datasetId];
  if (!variants || variants.length === 0) return fallback;
  const idx = Math.abs(Math.trunc(seed)) % variants.length;
  return variants[idx] ?? fallback;
}

function enrichTask(task: typeof tasksTable.$inferSelect) {
  const payload = (task.dataPayload ?? {}) as Record<string, unknown>;

  // Always prefer DATASET_OPTIONS over stale dataPayload options from old admin-generated tasks
  let options: string[] | undefined;
  if (task.datasetId && DATASET_OPTIONS[task.datasetId]) {
    options = DATASET_OPTIONS[task.datasetId];
  } else if (Array.isArray(payload.options)) {
    options = payload.options as string[];
  }

  if (!options) {
    const category = String(payload.category ?? "").toLowerCase();
    const correctAnswer = String(task.correctAnswer ?? "").toLowerCase();
    if (
      payload.audioUrl ||
      payload.transcript ||
      category.includes("speech") ||
      category.includes("transcription")
    ) {
      options = AUDIO_TRANSCRIPTION_OPTIONS;
    } else if (
      category.includes("sentiment") ||
      correctAnswer === "positive" ||
      correctAnswer === "negative" ||
      correctAnswer === "neutral"
    ) {
      options = SENTIMENT_OPTIONS;
    } else {
      options = BINARY_OPTIONS;
    }
  }

  const question = diversifyQuestion(
    task.datasetId,
    task.id,
    String(payload.question ?? ""),
  );

  return { ...task, dataPayload: { ...payload, options, question } };
}

router.get("/tasks/next", async (req, res): Promise<void> => {
  const parsed = GetNextTaskQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = parsed.data;

  // Fetch answered task IDs for this user
  const answeredRows = await db
    .select({ taskId: taskResponsesTable.taskId })
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, userId));
  const answeredTaskIds = answeredRows.map((r) => r.taskId);

  // Get max ID for random pivot (index scan — fast on 11M rows)
  const [maxRow] = await db
    .select({ maxId: sql<number>`max(id)`, minId: sql<number>`min(id)` })
    .from(tasksTable)
    .where(eq(tasksTable.status, "active"));

  if (!maxRow?.maxId) {
    res.status(404).json({ error: "No tasks available" });
    return;
  }

  const minId = Number(maxRow.minId);
  const maxId = Number(maxRow.maxId);
  const pivotId = Math.floor(Math.random() * (maxId - minId + 1)) + minId;

  // Only serve tasks from known/configured datasets (skip old Italian datasets like ds=9)
  const knownDatasetIds = Object.keys(DATASET_OPTIONS).map(Number);
  const knownDatasets = sql`${tasksTable.datasetId} = ANY(ARRAY[${sql.raw(knownDatasetIds.join(","))}]::int[])`;

  // Also filter out tasks with non-English questions (Italian accented chars)
  const englishOnly = sql`(${tasksTable.dataPayload}->>'question') !~ '[àèéìòùÀÈÉÌÒÙáãâäåæçñøœ]'`;

  // Exclude tasks pending relabeling by a supervisor
  const notPendingRelabel = eq(tasksTable.needsRelabeling, false);

  const baseFilter =
    answeredTaskIds.length > 0
      ? and(eq(tasksTable.status, "active"), notInArray(tasksTable.id, answeredTaskIds), knownDatasets, englishOnly, notPendingRelabel)
      : and(eq(tasksTable.status, "active"), knownDatasets, englishOnly, notPendingRelabel);

  // Try from random pivot forward (index scan)
  let [task] = await db
    .select()
    .from(tasksTable)
    .where(and(baseFilter, gte(tasksTable.id, pivotId)))
    .orderBy(tasksTable.id)
    .limit(1);

  // Wrap around: try from the beginning if nothing found after pivot
  if (!task) {
    [task] = await db
      .select()
      .from(tasksTable)
      .where(and(baseFilter, lt(tasksTable.id, pivotId)))
      .orderBy(tasksTable.id)
      .limit(1);
  }

  if (!task) {
    // ── Virtual task fallback ──────────────────────────────────────────────
    // Count how many virtual-task responses this user already has so we pick
    // an unseen slot. We identify virtual responses by taskId > 1e10.
    const [vcRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskResponsesTable)
      .where(
        and(
          eq(taskResponsesTable.userId, userId),
          sql`${taskResponsesTable.taskId} > 10000000000`,
        ),
      );
    const virtualDoneCount = Number(vcRow?.n ?? 0);

    // Pick a random dataset from the virtual set and a slot
    const datasetId = VIRTUAL_DATASET_IDS[
      Math.floor(Math.random() * VIRTUAL_DATASET_IDS.length)
    ]!;
    const slot = virtualDoneCount % VIRTUAL_SLOT_COUNT;

    const vtask = generateVirtualTask(datasetId, slot);
    // Diversify the question deterministically from the slot so consecutive
    // virtual tasks within a dataset show genuinely different prompts.
    vtask.dataPayload.question = diversifyQuestion(
      datasetId,
      slot,
      vtask.dataPayload.question,
    );
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.json(vtask);
    return;
  }

  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.json(enrichTask(task));
});

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type, difficulty, limit, offset } = parsed.data;

  let query = db.select().from(tasksTable).$dynamic();
  const conditions = [];
  if (type) conditions.push(eq(tasksTable.type, type));
  if (difficulty) conditions.push(eq(tasksTable.difficulty, difficulty));
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const tasks = await query.limit(limit ?? 10).offset(offset ?? 0);
  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const {
    type,
    dataPayload,
    correctAnswer,
    difficulty = "easy",
    pointsReward = 10,
    isGolden = false,
    datasetId = null,
    requiredVotes = 3,
    consensusThreshold = 0.8,
    supervisorId = null,
  } = req.body ?? {};

  if (!type || !dataPayload) {
    res.status(400).json({ error: "type and dataPayload are required" });
    return;
  }

  const [task] = await db.insert(tasksTable).values({
    type,
    dataPayload,
    correctAnswer: correctAnswer ?? null,
    difficulty,
    pointsReward: Number(pointsReward),
    isGolden: Boolean(isGolden),
    datasetId: datasetId ? Number(datasetId) : null,
    requiredVotes: Number(requiredVotes),
    consensusThreshold: Number(consensusThreshold),
    supervisorId: supervisorId ? Number(supervisorId) : null,
  }).returning();
  res.status(201).json(task);
});

router.get("/tasks/review", async (req, res): Promise<void> => {
  const stage = String(req.query.stage ?? "controller_review");
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.reviewStage, stage))
    .orderBy(desc(tasksTable.consensusCount))
    .limit(100);
  res.json(tasks);
});

router.patch("/tasks/:id/supervisor-approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const supervisorId = Number(req.body?.supervisorId);
  if (!Number.isFinite(id) || !Number.isFinite(supervisorId)) {
    res.status(400).json({ error: "Invalid task or supervisor" });
    return;
  }

  const [supervisor] = await db.select({ id: usersTable.id, isSupervisor: usersTable.isSupervisor, isAdmin: usersTable.isAdmin })
    .from(usersTable).where(eq(usersTable.id, supervisorId));
  if (!supervisor || (!supervisor.isSupervisor && !supervisor.isAdmin)) {
    res.status(403).json({ error: "Forbidden: supervisorId is not a supervisor" });
    return;
  }

  const [task] = await db.update(tasksTable).set({
    status: "pending_admin",
    reviewStage: "admin_review",
    supervisorId,
    supervisorApprovedAt: new Date(),
  }).where(and(eq(tasksTable.id, id), eq(tasksTable.reviewStage, "controller_review"))).returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(task);
});

router.patch("/tasks/:id/admin-approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const adminId = Number(req.body?.adminId);
  if (!Number.isFinite(id) || !Number.isFinite(adminId)) {
    res.status(400).json({ error: "Invalid task or admin" });
    return;
  }

  const [admin] = await db.select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable).where(eq(usersTable.id, adminId));
  if (!admin?.isAdmin) {
    res.status(403).json({ error: "Forbidden: adminId is not an admin" });
    return;
  }

  const [task] = await db.update(tasksTable).set({
    status: "approved",
    reviewStage: "published",
    adminApprovedAt: new Date(),
    approvedAt: new Date(),
    rewardReleased: true,
  }).where(and(eq(tasksTable.id, id), eq(tasksTable.rewardReleased, false))).returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const responses = await db.select().from(taskResponsesTable).where(eq(taskResponsesTable.taskId, id));
  const correctResponses = responses.filter((response) => response.answer === task.finalLabel || response.isCorrect === true);

  const payoutResults: { userId: number; result: Awaited<ReturnType<typeof sendTonPayout>> }[] = [];

  for (const response of correctResponses) {
    // Fetch wallet address for on-chain payout
    const [respUser] = await db.select({ walletAddress: usersTable.walletAddress }).from(usersTable).where(eq(usersTable.id, response.userId));
    const tonResult = respUser?.walletAddress
      ? await sendTonPayout(respUser.walletAddress, Number(task.operatorRewardTon ?? 0), `PUTITUP task #${task.id}`)
      : { success: false, dryRun: true, error: "no wallet" };
    payoutResults.push({ userId: response.userId, result: tonResult });

    const ledgerStatus = tonResult.success ? "paid" : "approved";
    await db.insert(rewardLedgerTable).values({
      userId: response.userId,
      taskId: task.id,
      role: "operator",
      amountTon: task.operatorRewardTon,
      pointsValue: task.taskValuePoints,
      status: ledgerStatus,
    });
    await db.update(taskResponsesTable).set({
      rewardTon: task.operatorRewardTon,
      rewardStatus: ledgerStatus,
    }).where(eq(taskResponsesTable.id, response.id));
  }

  if (task.supervisorId) {
    const [svUser] = await db.select({ walletAddress: usersTable.walletAddress }).from(usersTable).where(eq(usersTable.id, task.supervisorId));
    const svResult = svUser?.walletAddress
      ? await sendTonPayout(svUser.walletAddress, Number(task.supervisorRewardTon ?? 0), `PUTITUP supervisor #${task.id}`)
      : { success: false, dryRun: true };
    payoutResults.push({ userId: task.supervisorId, result: svResult });

    await db.insert(rewardLedgerTable).values({
      userId: task.supervisorId,
      taskId: task.id,
      role: "supervisor",
      amountTon: task.supervisorRewardTon,
      pointsValue: task.taskValuePoints,
      status: svResult.success ? "paid" : "approved",
    });
  }

  const [approver] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
  res.json({
    task,
    rewardsReleased: correctResponses.length + (task.supervisorId ? 1 : 0),
    approvedBy: approver?.username ?? null,
    payouts: payoutResults.map(({ userId, result }) => ({ userId, ...result })),
  });
});

// ── Relabeling Basket ─────────────────────────────────────────────────────────
// Lists tasks where consensus landed on "Other" / vague answer.
// Supervisors inject custom labels so the task re-enters the labeling queue.

router.get("/tasks/relabel-basket", async (_req, res): Promise<void> => {
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.needsRelabeling, true))
    .orderBy(desc(tasksTable.consensusCount))
    .limit(100);
  res.json(tasks);
});

router.post("/tasks/:id/relabel", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid task ID" });
    return;
  }

  const { newOptions, notes } = req.body ?? {};
  if (!Array.isArray(newOptions) || newOptions.length < 2) {
    res.status(400).json({ error: "newOptions must be an array of at least 2 strings" });
    return;
  }

  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const updatedPayload = { ...(existing.dataPayload as Record<string, unknown>), options: newOptions };

  const [updated] = await db
    .update(tasksTable)
    .set({
      dataPayload: updatedPayload,
      needsRelabeling: false,
      relabelOptions: newOptions,
      consensusCount: 0,
      finalLabel: null,
      reviewStage: "labeling",
      status: "active",
      rawSource: notes ?? existing.rawSource,
    })
    .where(eq(tasksTable.id, id))
    .returning();

  // Delete old responses so labelers can vote fresh with the new options
  await db.delete(taskResponsesTable).where(eq(taskResponsesTable.taskId, id));

  res.json({ task: updated, responsesDeleted: true });
});

// ── Wrong-question reports ────────────────────────────────────────────────────
// A labeler can flag a bad/wrong question. Admins & supervisors review the basket.

const INT4_MAX = 2_147_483_647;
const VIRTUAL_ID_BASE = 10_000_000_000;

// Fold synthetic virtual-task ids (>= 10e9) into the int4 range used by the
// task_reports.task_id column. Virtual ids encode datasetId*10M + slot which is
// well under int4 once the base offset is removed.
function toReportTaskId(raw: number): number {
  let id = Math.trunc(raw);
  if (id >= VIRTUAL_ID_BASE) id = id - VIRTUAL_ID_BASE;
  if (id > INT4_MAX) id = id % INT4_MAX;
  if (id < 0) id = Math.abs(id) % INT4_MAX;
  return id;
}

// User reports a wrong/bad question for a task.
router.post("/tasks/:id/report", requireUser, async (req, res): Promise<void> => {
  const rawId = Number(req.params.id);
  if (!Number.isFinite(rawId)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const reporterUserId = req.userId ?? Number(body.userId);
  if (!Number.isFinite(reporterUserId) || reporterUserId <= 0) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const taskId = toReportTaskId(rawId);
  const datasetId = body.datasetId != null && Number.isFinite(Number(body.datasetId))
    ? Number(body.datasetId)
    : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
  const questionSnapshot = typeof body.questionSnapshot === "string"
    ? body.questionSnapshot.trim().slice(0, 2000) || null
    : null;
  const reason = typeof body.reason === "string" && body.reason.trim()
    ? body.reason.trim().slice(0, 64)
    : "wrong_question";

  try {
    const [report] = await db.insert(taskReportsTable).values({
      taskId,
      datasetId,
      reporterUserId,
      reason,
      note,
      questionSnapshot,
    }).returning();
    res.status(201).json({ report });
  } catch (err) {
    req.log?.error({ err }, "tasks: failed to insert task report");
    res.status(503).json({ error: "Could not submit report" });
  }
});

// Admin/supervisor: list reports (default status=pending).
router.get("/tasks/reports", requireUser, async (req, res): Promise<void> => {
  // Identity comes from requireUser (Bearer session token when present; soft
  // fallback to the supplied id during the AUTH_ENFORCE rollout). We never trust
  // a reviewer id read straight from query/body for authorization.
  const reviewerId = req.userId ?? NaN;
  if (!Number.isFinite(reviewerId) || reviewerId <= 0) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [actor] = await db
    .select({ isAdmin: usersTable.isAdmin, isSupervisor: usersTable.isSupervisor })
    .from(usersTable).where(eq(usersTable.id, reviewerId)).limit(1);
  if (!actor || (!actor.isAdmin && !actor.isSupervisor)) {
    res.status(403).json({ error: "Forbidden: admin or supervisor only" });
    return;
  }

  const status = String(req.query["status"] ?? "pending");
  const reports = await db
    .select()
    .from(taskReportsTable)
    .where(eq(taskReportsTable.status, status))
    .orderBy(desc(taskReportsTable.createdAt))
    .limit(200);
  res.json({ reports });
});

// Admin/supervisor: resolve a report (approve / reject).
router.patch("/tasks/reports/:id", requireUser, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid report id" });
    return;
  }
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (status !== "approved" && status !== "rejected") {
    res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    return;
  }
  // Authenticated reviewer (token-bound when present; soft fallback otherwise).
  const reviewerId = req.userId ?? NaN;
  if (!Number.isFinite(reviewerId) || reviewerId <= 0) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [actor] = await db
    .select({ isAdmin: usersTable.isAdmin, isSupervisor: usersTable.isSupervisor })
    .from(usersTable).where(eq(usersTable.id, reviewerId)).limit(1);
  if (!actor || (!actor.isAdmin && !actor.isSupervisor)) {
    res.status(403).json({ error: "Forbidden: admin or supervisor only" });
    return;
  }

  const [updated] = await db
    .update(taskReportsTable)
    .set({ status, reviewedByUserId: reviewerId, reviewedAt: new Date() })
    .where(eq(taskReportsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json({ report: updated });
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid task ID" });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id));

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(task);
});

export default router;
