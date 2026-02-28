import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

/**
 * Middleware that checks express-validator results.
 * If validation fails, returns 400 with detailed field errors.
 */
export function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((err: any) => ({
        field: err.path,
        message: err.msg,
      })),
    });
    return;
  }

  next();
}
