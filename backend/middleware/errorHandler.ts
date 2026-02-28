import { Request, Response, NextFunction } from "express";

/**
 * Global error-handling middleware.
 * Catches unhandled errors thrown by route handlers and returns
 * a consistent JSON error response.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[ErrorHandler]", err.stack || err.message);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: err.message,
    });
    return;
  }

  // Mongoose duplicate key error
  if ((err as any).code === 11000) {
    res.status(409).json({
      success: false,
      message: "Duplicate entry. This record already exists.",
    });
    return;
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
    return;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    res.status(401).json({
      success: false,
      message: "Authentication error",
    });
    return;
  }

  // Default server error
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
}
