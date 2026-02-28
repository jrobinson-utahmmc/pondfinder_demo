import { Request, Response, NextFunction } from "express";
import authService from "../services/authService";

/**
 * JWT authentication middleware.
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and attaches userId and username to the request.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Provide a Bearer token.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = authService.verifyToken(token);
    (req as any).userId = payload.userId;
    (req as any).username = payload.username;
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}
