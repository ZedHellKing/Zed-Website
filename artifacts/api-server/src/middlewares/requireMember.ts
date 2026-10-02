import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireMember: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  res.locals.userId = userId;
  next();
};