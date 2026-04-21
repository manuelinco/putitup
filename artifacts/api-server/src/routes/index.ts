import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import tasksRouter from "./tasks";
import responsesRouter from "./responses";
import datasetsRouter from "./datasets";
import adsRouter from "./ads";
import rewardsRouter from "./rewards";
import leaderboardRouter from "./leaderboard";
import analyticsRouter from "./analytics";
import clientsRouter from "./clients";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(tasksRouter);
router.use(responsesRouter);
router.use(datasetsRouter);
router.use(adsRouter);
router.use(rewardsRouter);
router.use(leaderboardRouter);
router.use(analyticsRouter);
router.use(clientsRouter);

export default router;
