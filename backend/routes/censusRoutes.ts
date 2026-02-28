/**
 * Census API routes for wealth demographics overlay.
 *
 * GET /api/census/income?south=X&west=X&north=X&east=X
 *   Returns census tract income data with geometries for the given bounding box.
 */

import { Router, Request, Response } from "express";
import { getCensusIncomeByBBoxCached } from "../services/censusService";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

/**
 * GET /api/census/income
 * Fetches median household income by census tract within a bounding box.
 * Requires authentication.
 */
router.get("/income", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const south = parseFloat(req.query.south as string);
    const west = parseFloat(req.query.west as string);
    const north = parseFloat(req.query.north as string);
    const east = parseFloat(req.query.east as string);

    if ([south, west, north, east].some(isNaN)) {
      res.status(400).json({
        success: false,
        message: "Missing or invalid bounding box parameters (south, west, north, east)",
      });
      return;
    }

    // Limit the query area to avoid massive requests
    const latSpan = north - south;
    const lngSpan = east - west;
    if (latSpan > 2 || lngSpan > 2) {
      res.status(400).json({
        success: false,
        message:
          "Bounding box too large. Please zoom in to a smaller area (max ~2° span).",
      });
      return;
    }

    const tracts = await getCensusIncomeByBBoxCached(south, west, north, east);

    res.json({
      success: true,
      data: tracts,
      count: tracts.length,
    });
  } catch (error: any) {
    console.error("[Census] Error fetching income data:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch census data",
    });
  }
});

export default router;
