import { Router } from "express";
import { body } from "express-validator";
import authController from "../controllers/authController";
import { validateRequest } from "../middleware/validateRequest";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

/**
 * POST /api/auth/login
 */
router.post(
  "/login",
  [
    body("identifier")
      .trim()
      .notEmpty()
      .withMessage("Username or email is required"),
    body("password").notEmpty().withMessage("Password is required"),
    validateRequest,
  ],
  authController.login.bind(authController)
);

/**
 * GET /api/auth/profile
 */
router.get("/profile", authenticate, authController.getProfile.bind(authController));

export default router;
