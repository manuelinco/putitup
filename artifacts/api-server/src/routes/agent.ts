import { Router, type IRouter, type Request, type Response } from "express";
import { runTaskAgent, getLastRun, isRunning } from "../lib/taskAgent";

const router: IRouter = Router();

/**
 * GET /agent/status
 * Stato dell'agente e dell'ultimo run.
 */
router.get("/agent/status", (_req: Request, res: Response): void => {
  res.json({
    running: isRunning(),
    groqEnabled: !!process.env["GROQ_API_KEY"],
    lastRun: getLastRun(),
  });
});

/**
 * POST /agent/run
 * Avvia manualmente un run dell'agente.
 * Body opzionale: { datasetIds?: number[], tasksPerDataset?: number, dryRun?: boolean }
 */
router.post("/agent/run", async (req: Request, res: Response): Promise<void> => {
  if (isRunning()) {
    res.status(409).json({ error: "Agent already running. Check /agent/status." });
    return;
  }

  const { datasetIds, tasksPerDataset, dryRun } = req.body ?? {};

  // Avvio asincrono: risponde subito con 202, il run va in background
  res.status(202).json({
    ok: true,
    message: "Agent run started",
    dryRun: !!dryRun,
    datasetIds: datasetIds ?? "all",
    tasksPerDataset: tasksPerDataset ?? 50,
  });

  // Non await — gira in background
  runTaskAgent({
    datasetIds: Array.isArray(datasetIds) ? datasetIds.map(Number) : undefined,
    tasksPerDataset: Number(tasksPerDataset) || 50,
    dryRun: !!dryRun,
  }).catch((err) => {
    console.error("Agent run error:", err);
  });
});

/**
 * POST /agent/run/sync
 * Run sincrono (aspetta il completamento). Utile per test o dataset piccoli.
 */
router.post("/agent/run/sync", async (req: Request, res: Response): Promise<void> => {
  if (isRunning()) {
    res.status(409).json({ error: "Agent already running." });
    return;
  }

  const { datasetIds, tasksPerDataset, dryRun } = req.body ?? {};

  try {
    const result = await runTaskAgent({
      datasetIds: Array.isArray(datasetIds) ? datasetIds.map(Number) : undefined,
      tasksPerDataset: Number(tasksPerDataset) || 20,
      dryRun: !!dryRun,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
