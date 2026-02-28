import { Request, Response } from "express";
import PropertyOwner from "../models/PropertyOwner";
import WaterFeature from "../models/WaterFeature";
import smartyService from "../services/smartyService";

/**
 * Controller for property owner lookups and management.
 * Integrates with Smarty API for address/owner resolution.
 */
export class PropertyController {
  /**
   * POST /api/properties/lookup
   * Look up property owner by address using Smarty API, save result to DB.
   */
  async lookupByAddress(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { street, city, state, zipCode, waterFeatureId } = req.body;

      if (!(await smartyService.isConfigured())) {
        res.status(503).json({
          success: false,
          message:
            "Smarty API is not configured. Set your Smarty credentials in the Settings panel.",
        });
        return;
      }

      const result = await smartyService.lookupPropertyOwner(
        street,
        city,
        state,
        zipCode
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: "Could not find property information for this address",
        });
        return;
      }

      // Upsert: update if smartyLookupId already exists, create otherwise
      const owner = await PropertyOwner.findOneAndUpdate(
        { smartyLookupId: result.smartyLookupId },
        {
          firstName: result.firstName,
          lastName: result.lastName,
          companyName: result.companyName,
          mailingAddress: result.mailingAddress,
          propertyAddress: result.propertyAddress,
          parcelId: result.parcelId,
          propertyType: result.propertyType,
          lotSizeAcres: result.lotSizeAcres,
          marketValue: result.marketValue,
          coordinates: {
            type: "Point",
            coordinates: [result.longitude, result.latitude],
          },
          smartyLookupId: result.smartyLookupId,
          lastVerified: new Date(),
          createdBy: userId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Link to water feature if provided
      if (waterFeatureId) {
        await WaterFeature.findByIdAndUpdate(waterFeatureId, {
          propertyOwner: owner._id,
          address: result.propertyAddress.street,
          city: result.propertyAddress.city,
          state: result.propertyAddress.state,
          zipCode: result.propertyAddress.zipCode,
        });

        // Add water feature to owner's list if not already there
        if (!owner.waterFeatures.includes(waterFeatureId)) {
          owner.waterFeatures.push(waterFeatureId);
          await owner.save();
        }
      }

      res.status(200).json({
        success: true,
        message: "Property owner found",
        data: owner,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Property lookup failed",
      });
    }
  }

  /**
   * POST /api/properties/lookup-coordinates
   * Look up property owner by lat/lng coordinates via Smarty reverse geocoding.
   */
  async lookupByCoordinates(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { latitude, longitude, waterFeatureId } = req.body;

      if (!(await smartyService.isConfigured())) {
        res.status(503).json({
          success: false,
          message: "Smarty API is not configured. Set your Smarty credentials in the Settings panel.",
        });
        return;
      }

      const result = await smartyService.lookupPropertyByCoordinates(
        latitude,
        longitude
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: "Could not find property at these coordinates",
        });
        return;
      }

      const owner = await PropertyOwner.findOneAndUpdate(
        { smartyLookupId: result.smartyLookupId },
        {
          firstName: result.firstName,
          lastName: result.lastName,
          companyName: result.companyName,
          mailingAddress: result.mailingAddress,
          propertyAddress: result.propertyAddress,
          parcelId: result.parcelId,
          propertyType: result.propertyType,
          lotSizeAcres: result.lotSizeAcres,
          marketValue: result.marketValue,
          coordinates: {
            type: "Point",
            coordinates: [result.longitude, result.latitude],
          },
          smartyLookupId: result.smartyLookupId,
          lastVerified: new Date(),
          createdBy: userId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (waterFeatureId) {
        await WaterFeature.findByIdAndUpdate(waterFeatureId, {
          propertyOwner: owner._id,
        });

        if (!owner.waterFeatures.includes(waterFeatureId)) {
          owner.waterFeatures.push(waterFeatureId);
          await owner.save();
        }
      }

      res.status(200).json({
        success: true,
        message: "Property owner found",
        data: owner,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Coordinate lookup failed",
      });
    }
  }

  /**
   * GET /api/properties
   * List all saved property owners.
   */
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { page = "1", limit = "50", search } = req.query;

      const filter: any = {};
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { companyName: { $regex: search, $options: "i" } },
          { "propertyAddress.street": { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      const [owners, total] = await Promise.all([
        PropertyOwner.find(filter)
          .populate("waterFeatures", "name featureType")
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum),
        PropertyOwner.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: owners,
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
        message: error.message || "Failed to fetch property owners",
      });
    }
  }

  /**
   * GET /api/properties/:id
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const owner = await PropertyOwner.findById(req.params.id).populate(
        "waterFeatures"
      );

      if (!owner) {
        res
          .status(404)
          .json({ success: false, message: "Property owner not found" });
        return;
      }

      res.status(200).json({ success: true, data: owner });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch property owner",
      });
    }
  }

  /**
   * PUT /api/properties/:id
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const owner = await PropertyOwner.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!owner) {
        res
          .status(404)
          .json({ success: false, message: "Property owner not found" });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Property owner updated",
        data: owner,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update property owner",
      });
    }
  }

  /**
   * DELETE /api/properties/:id
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const owner = await PropertyOwner.findByIdAndDelete(req.params.id);

      if (!owner) {
        res
          .status(404)
          .json({ success: false, message: "Property owner not found" });
        return;
      }

      // Unlink from any water features
      await WaterFeature.updateMany(
        { propertyOwner: owner._id },
        { $set: { propertyOwner: null } }
      );

      res.status(200).json({
        success: true,
        message: "Property owner deleted",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete property owner",
      });
    }
  }
}

export default new PropertyController();
