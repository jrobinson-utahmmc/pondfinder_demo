/**
 * Job routes for async task management.
 *
 * POST   /api/jobs          — Create a new job
 * GET    /api/jobs          — List jobs for current user  
 * GET    /api/jobs/:id      — Get job status/result
 * DELETE /api/jobs/:id      — Cancel a job
 */

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { createJob, getJob, listJobs, cancelJob } from "../services/jobService";
import type { JobType } from "../models/Job";

const router = Router();

// All job routes require authentication
router.use(authenticate);

/**
 * POST /api/jobs — Create a new async job.
 * Body: { type: JobType, params: { ... } }
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, params } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const validTypes: JobType[] = ["water-scan", "batch-property", "census-load", "full-analysis"];
    if (!type || !validTypes.includes(type)) {
      res.status(400).json({
        success: false,
        message: `Invalid job type. Must be one of: ${validTypes.join(", ")}`,
      });
      return;
    }

    // Validate params based on type
    if (["water-scan", "census-load", "full-analysis"].includes(type)) {
      const { south, west, north, east } = params || {};
      if ([south, west, north, east].some((v) => v == null || isNaN(v))) {
        res.status(400).json({
          success: false,
          message: "Bounding box parameters required: south, west, north, east",
        });
        return;
      }
    }

    if (type === "batch-property") {
      if (!params?.waterBodies || !Array.isArray(params.waterBodies) || params.waterBodies.length === 0) {
        res.status(400).json({
          success: false,
          message: "waterBodies array required with { id, lat, lng } objects",
        });
        return;
      }
    }

    const job = await createJob(type, params || {}, userId);

    res.status(201).json({
      success: true,
      data: {
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        statusMessage: job.statusMessage,
        createdAt: job.createdAt,
      },
    });
  } catch (error: any) {
    console.error("[Jobs] Error creating job:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create job",
    });
  }
});

/**
 * GET /api/jobs — List jobs for the current user.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const jobs = await listJobs(userId, limit);

    res.json({
      success: true,
      data: jobs.map((j) => ({
        id: j._id,
        type: j.type,
        status: j.status,
        progress: j.progress,
        statusMessage: j.statusMessage,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        hasResult: j.result != null,
        error: j.error,
      })),
    });
  } catch (error: any) {
    console.error("[Jobs] Error listing jobs:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to list jobs",
    });
  }
});

/**
 * GET /api/jobs/:id — Get job status and result.
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.id);
    const job = await getJob(jobId);
    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        statusMessage: job.statusMessage,
        params: job.params,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error: any) {
    console.error("[Jobs] Error getting job:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get job",
    });
  }
});

/**
 * DELETE /api/jobs/:id — Cancel a pending or running job.
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Not authenticated" });
      return;
    }

    const jobId = String(req.params.id);
    const job = await cancelJob(jobId, userId);
    if (!job) {
      res.status(404).json({
        success: false,
        message: "Job not found or cannot be cancelled",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: job._id,
        status: job.status,
        statusMessage: job.statusMessage,
      },
    });
  } catch (error: any) {
    console.error("[Jobs] Error cancelling job:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel job",
    });
  }
});

export default router;
