/**
 * Job Service — processes long-running async tasks in the background.
 *
 * Supports:
 *   - water-scan: Large region water body detection (splits into sub-regions)
 *   - batch-property: Batch property owner lookups for multiple water bodies
 *   - census-load: Census demographics for a large region
 *   - full-analysis: Combined scan + property + census
 *
 * Jobs are created via the REST API and processed asynchronously.
 * Clients poll GET /api/jobs/:id for status updates.
 */

import Job, { type IJob, type JobType, type JobStatus } from "../models/Job";
import { getCensusIncomeByBBoxCached } from "./censusService";
import smartyService from "./smartyService";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Job queue — simple in-process queue (no Redis needed for single-instance)
// ---------------------------------------------------------------------------

const JOB_CONCURRENCY = 2; // max concurrent jobs
let runningCount = 0;

/**
 * Create a new job and enqueue it for processing.
 */
export async function createJob(
  type: JobType,
  params: Record<string, any>,
  userId: string
): Promise<IJob> {
  const job = await Job.create({
    type,
    params,
    createdBy: new mongoose.Types.ObjectId(userId),
    status: "pending",
    progress: 0,
    statusMessage: "Queued — waiting to start...",
  });

  // Try to process immediately if capacity available
  processNextJob();

  return job;
}

/**
 * Get a job by ID.
 */
export async function getJob(jobId: string): Promise<IJob | null> {
  return Job.findById(jobId);
}

/**
 * List jobs for a user.
 */
export async function listJobs(
  userId: string,
  limit = 20
): Promise<IJob[]> {
  return Job.find({ createdBy: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Cancel a pending or running job.
 */
export async function cancelJob(jobId: string, userId: string): Promise<IJob | null> {
  const job = await Job.findOne({
    _id: jobId,
    createdBy: new mongoose.Types.ObjectId(userId),
    status: { $in: ["pending", "running"] },
  });

  if (!job) return null;

  job.status = "cancelled";
  job.statusMessage = "Cancelled by user";
  job.completedAt = new Date();
  await job.save();

  return job;
}

// ---------------------------------------------------------------------------
// Job processing
// ---------------------------------------------------------------------------

function processNextJob() {
  if (runningCount >= JOB_CONCURRENCY) return;

  // Find the next pending job
  Job.findOneAndUpdate(
    { status: "pending" },
    {
      status: "running",
      startedAt: new Date(),
      statusMessage: "Starting...",
    },
    { sort: { createdAt: 1 }, new: true }
  ).then((job) => {
    if (!job) return;

    runningCount++;
    executeJob(job)
      .catch((err) => {
        console.error(`[JobService] Job ${job._id} failed:`, err);
      })
      .finally(() => {
        runningCount--;
        // Check for more pending jobs
        processNextJob();
      });
  });
}

async function executeJob(job: IJob): Promise<void> {
  try {
    switch (job.type) {
      case "water-scan":
        await executeWaterScan(job);
        break;
      case "batch-property":
        await executeBatchPropertyLookup(job);
        break;
      case "census-load":
        await executeCensusLoad(job);
        break;
      case "full-analysis":
        await executeFullAnalysis(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (error: any) {
    // Check if job was cancelled during execution
    const current = await Job.findById(job._id);
    if (current?.status === "cancelled") return;

    await Job.findByIdAndUpdate(job._id, {
      status: "failed",
      error: error.message || "Unknown error",
      statusMessage: `Failed: ${error.message || "Unknown error"}`,
      completedAt: new Date(),
    });
  }
}

// Helper to update job progress
async function updateProgress(
  jobId: mongoose.Types.ObjectId,
  progress: number,
  statusMessage: string
): Promise<boolean> {
  const job = await Job.findById(jobId);
  if (!job || job.status === "cancelled") return false; // signal to stop

  job.progress = Math.min(100, Math.max(0, progress));
  job.statusMessage = statusMessage;
  await job.save();
  return true;
}

// ---------------------------------------------------------------------------
// Water scan — splits large regions into sub-cells and scans each
// ---------------------------------------------------------------------------

async function executeWaterScan(job: IJob): Promise<void> {
  const { south, west, north, east, includeSmall = false } = job.params;

  // Split into ~0.1° cells for manageable Overpass queries
  const cellSize = 0.1;
  const latCells = Math.ceil((north - south) / cellSize);
  const lngCells = Math.ceil((east - west) / cellSize);
  const totalCells = latCells * lngCells;

  if (!(await updateProgress(job._id, 5, `Scanning ${totalCells} sub-regions...`))) return;

  // We can't call Overpass from backend directly the same way the frontend does,
  // so we store the sub-region list for the frontend to process progressively.
  // The job result contains the cell grid for the frontend to iterate.
  const cells: Array<{ south: number; west: number; north: number; east: number }> = [];

  for (let latI = 0; latI < latCells; latI++) {
    for (let lngI = 0; lngI < lngCells; lngI++) {
      cells.push({
        south: south + latI * cellSize,
        west: west + lngI * cellSize,
        north: Math.min(south + (latI + 1) * cellSize, north),
        east: Math.min(west + (lngI + 1) * cellSize, east),
      });
    }
  }

  if (!(await updateProgress(job._id, 50, `Prepared ${cells.length} scan cells`))) return;

  await Job.findByIdAndUpdate(job._id, {
    status: "completed",
    progress: 100,
    statusMessage: `Ready — ${cells.length} sub-regions prepared for scanning`,
    result: {
      cells,
      totalCells: cells.length,
      includeSmall,
      bounds: { south, west, north, east },
    },
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Batch property lookup
// ---------------------------------------------------------------------------

async function executeBatchPropertyLookup(job: IJob): Promise<void> {
  const { waterBodies } = job.params as {
    waterBodies: Array<{ id: string; lat: number; lng: number; name?: string }>;
  };

  if (!waterBodies || waterBodies.length === 0) {
    throw new Error("No water bodies provided for property lookup");
  }

  const results: Record<string, any> = {};
  const total = waterBodies.length;
  let processed = 0;

  for (const wb of waterBodies) {
    if (!(await updateProgress(
      job._id,
      Math.round((processed / total) * 90) + 5,
      `Looking up property ${processed + 1} of ${total}...`
    ))) return;

    try {
      const result = await smartyService.lookupPropertyByCoordinates(
        wb.lat,
        wb.lng
      );
      results[wb.id] = {
        success: true,
        data: result,
        propertyType: classifyPropertyFromSmarty(result),
      };
    } catch (err: any) {
      results[wb.id] = {
        success: false,
        error: err.message || "Lookup failed",
        propertyType: "unknown",
      };
    }

    processed++;
    // Rate limit: wait 200ms between lookups
    await new Promise((r) => setTimeout(r, 200));
  }

  await Job.findByIdAndUpdate(job._id, {
    status: "completed",
    progress: 100,
    statusMessage: `Completed — ${total} properties looked up`,
    result: { properties: results, totalProcessed: total },
    completedAt: new Date(),
  });
}

function classifyPropertyFromSmarty(data: any): string {
  if (!data) return "unknown";
  const propType = (data.propertyType || "").toLowerCase();
  if (
    propType.includes("commercial") ||
    propType.includes("business") ||
    propType.includes("office") ||
    propType.includes("retail") ||
    propType.includes("industrial")
  ) return "commercial";
  if (
    propType.includes("residential") ||
    propType.includes("single") ||
    propType.includes("multi") ||
    propType.includes("condo") ||
    propType.includes("apartment") ||
    propType.includes("family")
  ) return "residential";
  if (propType.includes("agricultural") || propType.includes("farm")) return "agricultural";
  if (propType.includes("vacant") || propType.includes("land")) return "vacant";
  if (propType) return propType;
  return "unknown";
}

// ---------------------------------------------------------------------------
// Census data load
// ---------------------------------------------------------------------------

async function executeCensusLoad(job: IJob): Promise<void> {
  const { south, west, north, east } = job.params;

  if (!(await updateProgress(job._id, 10, "Loading census demographics..."))) return;

  const tracts = await getCensusIncomeByBBoxCached(south, west, north, east);

  if (!(await updateProgress(job._id, 90, `Processing ${tracts.length} tracts...`))) return;

  await Job.findByIdAndUpdate(job._id, {
    status: "completed",
    progress: 100,
    statusMessage: `Completed — ${tracts.length} census tracts loaded`,
    result: { tracts, totalTracts: tracts.length },
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Full analysis — water scan + property lookup + census in sequence
// ---------------------------------------------------------------------------

async function executeFullAnalysis(job: IJob): Promise<void> {
  const { south, west, north, east, includeSmall = false } = job.params;

  // Step 1: Prepare scan cells
  if (!(await updateProgress(job._id, 5, "Preparing region scan..."))) return;

  const cellSize = 0.1;
  const latCells = Math.ceil((north - south) / cellSize);
  const lngCells = Math.ceil((east - west) / cellSize);
  const cells: Array<{ south: number; west: number; north: number; east: number }> = [];

  for (let latI = 0; latI < latCells; latI++) {
    for (let lngI = 0; lngI < lngCells; lngI++) {
      cells.push({
        south: south + latI * cellSize,
        west: west + lngI * cellSize,
        north: Math.min(south + (latI + 1) * cellSize, north),
        east: Math.min(west + (lngI + 1) * cellSize, east),
      });
    }
  }

  // Step 2: Census data
  if (!(await updateProgress(job._id, 30, "Loading census demographics..."))) return;

  let tracts: any[] = [];
  try {
    tracts = await getCensusIncomeByBBoxCached(south, west, north, east);
  } catch (err: any) {
    console.warn("[FullAnalysis] Census load failed:", err.message);
  }

  if (!(await updateProgress(job._id, 70, `Census: ${tracts.length} tracts. Preparing results...`))) return;

  await Job.findByIdAndUpdate(job._id, {
    status: "completed",
    progress: 100,
    statusMessage: `Analysis complete — ${cells.length} scan cells, ${tracts.length} census tracts`,
    result: {
      scanCells: cells,
      censusTracts: tracts,
      bounds: { south, west, north, east },
      includeSmall,
    },
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Start processing any pending jobs on service load
// ---------------------------------------------------------------------------
setTimeout(() => processNextJob(), 2000);
