import { Request, Response } from "express";
import Settings from "../models/Settings";
import User from "../models/User";

/**
 * Admin-only controller for managing application settings and user accounts.
 */
class SettingsController {
  // -----------------------------------------------------------------------
  // Settings (API keys, app config)
  // -----------------------------------------------------------------------

  /**
   * GET /api/settings
   * Get current application settings.
   * API keys are masked for non-admin display.
   */
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await Settings.getInstance();

      res.json({
        success: true,
        data: {
          googleMapsApiKey: settings.googleMapsApiKey,
          smartyAuthId: settings.smartyAuthId
            ? `${settings.smartyAuthId.substring(0, 6)}...`
            : "",
          smartyAuthToken: settings.smartyAuthToken ? "••••••••" : "",
          smartyConfigured: !!(settings.smartyAuthId && settings.smartyAuthToken),
          googleMapsConfigured: !!settings.googleMapsApiKey,
          appName: settings.appName,
          setupCompleted: settings.setupCompleted,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get settings",
      });
    }
  }

  /**
   * PUT /api/settings
   * Update application settings. Admin only.
   *
   * Body: { googleMapsApiKey?, smartyAuthId?, smartyAuthToken?, appName? }
   */
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = await Settings.getInstance();
      const { googleMapsApiKey, smartyAuthId, smartyAuthToken, appName } = req.body;

      if (googleMapsApiKey !== undefined) settings.googleMapsApiKey = googleMapsApiKey;
      if (smartyAuthId !== undefined) settings.smartyAuthId = smartyAuthId;
      if (smartyAuthToken !== undefined) settings.smartyAuthToken = smartyAuthToken;
      if (appName !== undefined) settings.appName = appName;

      await settings.save();

      res.json({
        success: true,
        message: "Settings updated successfully",
        data: {
          googleMapsApiKey: settings.googleMapsApiKey,
          smartyConfigured: !!(settings.smartyAuthId && settings.smartyAuthToken),
          googleMapsConfigured: !!settings.googleMapsApiKey,
          appName: settings.appName,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update settings",
      });
    }
  }

  /**
   * GET /api/settings/api-keys
   * Get full (unmasked) API keys. Admin only.
   */
  async getApiKeys(_req: Request, res: Response): Promise<void> {
    try {
      const settings = await Settings.getInstance();

      res.json({
        success: true,
        data: {
          googleMapsApiKey: settings.googleMapsApiKey,
          smartyAuthId: settings.smartyAuthId,
          smartyAuthToken: settings.smartyAuthToken,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get API keys",
      });
    }
  }

  // -----------------------------------------------------------------------
  // User Management (admin only)
  // -----------------------------------------------------------------------

  /**
   * GET /api/settings/users
   * List all users.
   */
  async listUsers(_req: Request, res: Response): Promise<void> {
    try {
      const users = await User.find().select("-password").sort({ createdAt: -1 });

      res.json({
        success: true,
        data: users.map((u) => ({
          id: String(u._id),
          username: u.username,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
        })),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to list users",
      });
    }
  }

  /**
   * POST /api/settings/users
   * Create a new user account. Admin only.
   *
   * Body: { username, email, password, role? }
   */
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password, role } = req.body;

      // Check for existing user
      const existing = await User.findOne({
        $or: [{ username }, { email }],
      });

      if (existing) {
        const field = existing.username === username ? "Username" : "Email";
        res.status(409).json({
          success: false,
          message: `${field} already exists`,
        });
        return;
      }

      const user = await User.create({
        username,
        email,
        password,
        role: role || "user",
      });

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
          id: String(user._id),
          username: user.username,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create user",
      });
    }
  }

  /**
   * PUT /api/settings/users/:id
   * Update a user. Admin only.
   *
   * Body: { username?, email?, password?, role? }
   */
  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { username, email, password, role } = req.body;

      const user = await User.findById(id).select("+password");
      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (username) user.username = username;
      if (email) user.email = email;
      if (password) user.password = password; // Will be hashed by pre-save hook
      if (role) user.role = role;

      await user.save();

      res.json({
        success: true,
        message: "User updated successfully",
        data: {
          id: String(user._id),
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update user",
      });
    }
  }

  /**
   * DELETE /api/settings/users/:id
   * Delete a user. Admin only. Cannot delete yourself.
   */
  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const requesterId = (req as any).userId;

      if (id === requesterId) {
        res.status(400).json({
          success: false,
          message: "Cannot delete your own account",
        });
        return;
      }

      const user = await User.findByIdAndDelete(id);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete user",
      });
    }
  }
}

export default new SettingsController();
