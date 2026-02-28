import { Router } from "express";
import { body } from "express-validator";
import propertyController from "../controllers/propertyController";
import { validateRequest } from "../middleware/validateRequest";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// All property routes require authentication
router.use(authenticate);

/**
 * POST /api/properties/lookup
 * Look up property owner by address via Smarty API.
 */
router.post(
  "/lookup",
  [
    body("street").trim().notEmpty().withMessage("Street address is required"),
    body("city").trim().notEmpty().withMessage("City is required"),
    body("state").trim().notEmpty().withMessage("State is required"),
    body("zipCode").trim().notEmpty().withMessage("ZIP code is required"),
    body("waterFeatureId").optional().isMongoId(),
    validateRequest,
  ],
  propertyController.lookupByAddress.bind(propertyController)
);

/**
 * POST /api/properties/lookup-coordinates
 * Look up property owner by lat/lng via Smarty reverse geocoding.
 */
router.post(
  "/lookup-coordinates",
  [
    body("latitude").isFloat({ min: -90, max: 90 }).withMessage("Valid latitude required"),
    body("longitude")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Valid longitude required"),
    body("waterFeatureId").optional().isMongoId(),
    validateRequest,
  ],
  propertyController.lookupByCoordinates.bind(propertyController)
);

/**
 * GET /api/properties
 */
router.get("/", propertyController.getAll.bind(propertyController));

/**
 * GET /api/properties/:id
 */
router.get("/:id", propertyController.getById.bind(propertyController));

/**
 * PUT /api/properties/:id
 */
router.put("/:id", propertyController.update.bind(propertyController));

/**
 * DELETE /api/properties/:id
 */
router.delete("/:id", propertyController.delete.bind(propertyController));

export default router;
