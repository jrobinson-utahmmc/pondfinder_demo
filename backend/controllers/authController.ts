import { Request, Response } from "express";
import authService from "../services/authService";

/**
 * Auth controller handles login and profile retrieval.
 * Account creation is done via the admin settings panel.
 */
export class AuthController {
  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, password } = req.body;
      const result = await authService.login(identifier, password);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        message: error.message || "Authentication failed",
      });
    }
  }

  /**
   * GET /api/auth/profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const user = await authService.getUserById(userId);

      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve profile",
      });
    }
  }
}

export default new AuthController();
