import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botsRouter from "./bots";
import communityRouter from "./community";
import profileRouter from "./profile";
import { requireMember } from "../middlewares/requireMember";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireMember);
router.use(botsRouter);
router.use(profileRouter);
router.use(communityRouter);

export default router;
