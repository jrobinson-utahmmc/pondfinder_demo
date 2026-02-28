import { Request, Response, NextFunction } from "express";
import User from "../models/User";

/**
 * Middleware that requires the authenticated user to have the "admin" role.
 * Must be used AFTER the authenticate middleware.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user || user.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Admin access required",
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}
