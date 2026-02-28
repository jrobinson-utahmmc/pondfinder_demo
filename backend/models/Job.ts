import mongoose, { Schema, Document } from "mongoose";

/**
 * Job model for tracking long-running async tasks.
 * Supports: water body scans, batch property lookups, census data loading.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type JobType =
  | "water-scan"        // Scan a large region for water bodies
  | "batch-property"    // Batch property owner lookup
  | "census-load"       // Load census demographics for a region
  | "full-analysis";    // Combined scan + property + census

export interface IJob extends Document {
  /** Type of job */
  type: JobType;
  /** Current status */
  status: JobStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Short status message for the UI */
  statusMessage: string;
  /** Input parameters (varies by job type) */
  params: Record<string, any>;
  /** Result data when completed */
  result: any;
  /** Error message if failed */
  error: string | null;
  /** User who created the job */
  createdBy: mongoose.Types.ObjectId;
  /** When the job started processing */
  startedAt: Date | null;
  /** When the job completed (success or failure) */
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    type: {
      type: String,
      required: true,
      enum: ["water-scan", "batch-property", "census-load", "full-analysis"],
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "running", "completed", "failed", "cancelled"],
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    statusMessage: {
      type: String,
      default: "Queued...",
    },
    params: {
      type: Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for efficient status queries
JobSchema.index({ status: 1, createdAt: -1 });
JobSchema.index({ createdBy: 1, createdAt: -1 });

// Auto-expire old completed/failed jobs after 24 hours
JobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 86400 });

const Job = mongoose.model<IJob>("Job", JobSchema);

export default Job;
