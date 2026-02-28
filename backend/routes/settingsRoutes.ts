import { Router } from "express";
import { body } from "express-validator";
import settingsController from "../controllers/settingsController";
import { authenticate } from "../middleware/authMiddleware";
import { requireAdmin } from "../middleware/requireAdmin";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

// All settings routes require authentication + admin role
router.use(authenticate);
router.use(requireAdmin);

// -------------------------------------------------------------------------
// App Settings
// -------------------------------------------------------------------------

/**
 * GET /api/settings
 * Get current settings (API keys partially masked).
 */
router.get("/", settingsController.getSettings.bind(settingsController));

/**
 * PUT /api/settings
 * Update application settings.
 */
router.put(
  "/",
  [
    body("googleMapsApiKey").optional().isString(),
    body("smartyAuthId").optional().isString(),
    body("smartyAuthToken").optional().isString(),
    body("appName").optional().isString().isLength({ max: 50 }),
    validateRequest,
  ],
  settingsController.updateSettings.bind(settingsController)
);

/**
 * GET /api/settings/api-keys
 * Get full (unmasked) API keys.
 */
router.get("/api-keys", settingsController.getApiKeys.bind(settingsController));

// -------------------------------------------------------------------------
// User Management
// -------------------------------------------------------------------------

/**
 * GET /api/settings/users
 * List all user accounts.
 */
router.get("/users", settingsController.listUsers.bind(settingsController));

/**
 * POST /api/settings/users
 * Create a new user account.
 */
router.post(
  "/users",
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
    body("role")
      .optional()
      .isIn(["admin", "user"])
      .withMessage("Role must be 'admin' or 'user'"),
    validateRequest,
  ],
  settingsController.createUser.bind(settingsController)
);

/**
 * PUT /api/settings/users/:id
 * Update a user account.
 */
router.put(
  "/users/:id",
  [
    body("username").optional().trim().isLength({ min: 3, max: 30 }),
    body("email").optional().trim().isEmail().normalizeEmail(),
    body("password").optional().isLength({ min: 8 }),
    body("role").optional().isIn(["admin", "user"]),
    validateRequest,
  ],
  settingsController.updateUser.bind(settingsController)
);

/**
 * DELETE /api/settings/users/:id
 * Delete a user account.
 */
router.delete("/users/:id", settingsController.deleteUser.bind(settingsController));

export default router;
