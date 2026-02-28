import { Router } from "express";
import { body, query } from "express-validator";
import waterFeatureController from "../controllers/waterFeatureController";
import { validateRequest } from "../middleware/validateRequest";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// All water feature routes require authentication
router.use(authenticate);

/**
 * GET /api/water-features/nearby?lat=&lng=&radius=
 * Must be defined before /:id to avoid conflicts.
 */
router.get(
  "/nearby",
  [
    query("lat").isFloat().withMessage("Valid latitude is required"),
    query("lng").isFloat().withMessage("Valid longitude is required"),
    query("radius").optional().isInt({ min: 100, max: 50000 }),
    validateRequest,
  ],
  waterFeatureController.findNearby.bind(waterFeatureController)
);

/**
 * POST /api/water-features
 */
router.post(
  "/",
  [
    body("name")
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Name is required (max 100 chars)"),
    body("featureType")
      .optional()
      .isIn(["pond", "lake", "stream", "river", "wetland", "reservoir", "other"]),
    body("bounds").notEmpty().withMessage("Bounding polygon is required"),
    body("bounds.type").equals("Polygon"),
    body("bounds.coordinates").isArray(),
    body("center").notEmpty().withMessage("Center point is required"),
    body("center.type").equals("Point"),
    body("center.coordinates").isArray({ min: 2, max: 2 }),
    validateRequest,
  ],
  waterFeatureController.create.bind(waterFeatureController)
);

/**
 * GET /api/water-features
 */
router.get("/", waterFeatureController.getAll.bind(waterFeatureController));

/**
 * GET /api/water-features/:id
 */
router.get("/:id", waterFeatureController.getById.bind(waterFeatureController));

/**
 * PUT /api/water-features/:id
 */
router.put("/:id", waterFeatureController.update.bind(waterFeatureController));

/**
 * DELETE /api/water-features/:id
 */
router.delete("/:id", waterFeatureController.delete.bind(waterFeatureController));

export default router;
