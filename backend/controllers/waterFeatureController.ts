import { Request, Response } from "express";
import WaterFeature from "../models/WaterFeature";

/**
 * Controller for CRUD operations on water features (ponds, lakes, etc.).
 */
export class WaterFeatureController {
  /**
   * POST /api/water-features
   * Create a new water feature with bounding polygon.
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const {
        name,
        description,
        featureType,
        bounds,
        center,
        area,
        address,
        city,
        state,
        zipCode,
        notes,
        tags,
      } = req.body;

      const waterFeature = await WaterFeature.create({
        name,
        description,
        featureType,
        bounds,
        center,
        area,
        address,
        city,
        state,
        zipCode,
        notes,
        tags,
        createdBy: userId,
      });

      res.status(201).json({
        success: true,
        message: "Water feature created",
        data: waterFeature,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create water feature",
      });
    }
  }

  /**
   * GET /api/water-features
   * List all water features, with optional filtering.
   */
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const {
        featureType,
        state,
        page = "1",
        limit = "50",
        search,
      } = req.query;

      const filter: any = {};

      if (featureType) filter.featureType = featureType;
      if (state) filter.state = state;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { address: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const [features, total] = await Promise.all([
        WaterFeature.find(filter)
          .populate("propertyOwner", "firstName lastName companyName")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        WaterFeature.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: features,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch water features",
      });
    }
  }

  /**
   * GET /api/water-features/:id
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const feature = await WaterFeature.findById(req.params.id)
        .populate("propertyOwner")
        .populate("createdBy", "username");

      if (!feature) {
        res.status(404).json({ success: false, message: "Water feature not found" });
        return;
      }

      res.status(200).json({ success: true, data: feature });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch water feature",
      });
    }
  }

  /**
   * PUT /api/water-features/:id
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const feature = await WaterFeature.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!feature) {
        res.status(404).json({ success: false, message: "Water feature not found" });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Water feature updated",
        data: feature,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update water feature",
      });
    }
  }

  /**
   * DELETE /api/water-features/:id
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const feature = await WaterFeature.findByIdAndDelete(req.params.id);

      if (!feature) {
        res.status(404).json({ success: false, message: "Water feature not found" });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Water feature deleted",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete water feature",
      });
    }
  }

  /**
   * GET /api/water-features/nearby
   * Find water features near a given lat/lng within a radius (meters).
   */
  async findNearby(req: Request, res: Response): Promise<void> {
    try {
      const { lat, lng, radius = "5000" } = req.query;

      if (!lat || !lng) {
        res.status(400).json({
          success: false,
          message: "lat and lng query parameters are required",
        });
        return;
      }

      const features = await WaterFeature.find({
        center: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng as string), parseFloat(lat as string)],
            },
            $maxDistance: parseInt(radius as string, 10),
          },
        },
      }).populate("propertyOwner", "firstName lastName companyName");

      res.status(200).json({
        success: true,
        data: features,
        count: features.length,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to find nearby water features",
      });
    }
  }
}

export default new WaterFeatureController();
