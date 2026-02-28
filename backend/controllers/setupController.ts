import { Request, Response } from "express";
import User from "../models/User";
import Settings from "../models/Settings";
import authService from "../services/authService";

/**
 * Handles initial application setup.
 * Only works when no users exist in the database.
 */
class SetupController {
  /**
   * GET /api/setup/status
   * Check if initial setup has been completed.
   * This is an unauthenticated endpoint.
   */
  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const userCount = await User.countDocuments();
      const settings = await Settings.getInstance();

      res.json({
        success: true,
        data: {
          needsSetup: userCount === 0 || !settings.setupCompleted,
          hasUsers: userCount > 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to check setup status",
      });
    }
  }

  /**
   * POST /api/setup/init
   * Create the initial admin account and mark setup as complete.
   * Only works when no users exist.
   *
   * Body: { username, email, password, googleMapsApiKey?, smartyAuthId?, smartyAuthToken? }
   */
  async initialize(req: Request, res: Response): Promise<void> {
    try {
      const userCount = await User.countDocuments();
      if (userCount > 0) {
        res.status(403).json({
          success: false,
          message: "Setup has already been completed. An admin account exists.",
        });
        return;
      }

      const { username, email, password } = req.body;

      // Create admin user
      const admin = await User.create({
        username,
        email,
        password,
        role: "admin",
      });

      // Mark setup as completed
      const settings = await Settings.getInstance();
      settings.setupCompleted = true;
      await settings.save();

      // Generate token so admin is logged in immediately
      const token = authService.generateTokenForUser(admin);

      res.status(201).json({
        success: true,
        message: "Setup complete. Admin account created.",
        data: {
          user: {
            id: String(admin._id),
            username: admin.username,
            email: admin.email,
            role: admin.role,
          },
          token,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Setup failed",
      });
    }
  }
}

export default new SetupController();
