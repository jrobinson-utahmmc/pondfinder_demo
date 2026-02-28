import { Router } from "express";
import { body } from "express-validator";
import setupController from "../controllers/setupController";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

/**
 * GET /api/setup/status
 * Check if initial setup is needed (unauthenticated).
 */
router.get("/status", setupController.getStatus.bind(setupController));

/**
 * POST /api/setup/init
 * Create the initial admin account (only works when no users exist).
 */
router.post(
  "/init",
  [
    body("username")
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage("Username must be 3-30 characters"),
    body("email")
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/\d/)
      .withMessage("Password must contain a number"),
    body("googleMapsApiKey").optional().isString(),
    body("smartyAuthId").optional().isString(),
    body("smartyAuthToken").optional().isString(),
    validateRequest,
  ],
  setupController.initialize.bind(setupController)
);

export default router;
