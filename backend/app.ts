import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import config from "./config/environment";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

// Route imports
import authRoutes from "./routes/authRoutes";
import setupRoutes from "./routes/setupRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import waterFeatureRoutes from "./routes/waterFeatureRoutes";
import propertyRoutes from "./routes/propertyRoutes";
import censusRoutes from "./routes/censusRoutes";
import jobRoutes from "./routes/jobRoutes";

// Models (need Settings for public API key endpoint)
import Settings from "./models/Settings";

const app = express();

// ---------------------------------------------------------------------------
// Security & parsing middleware
// ---------------------------------------------------------------------------
app.use(helmet());

app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { success: false, message: "Too many requests, try again later" },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Setup (unauthenticated — only works when no users exist)
app.use("/api/setup", setupRoutes);

// Auth (login only — registration removed, accounts created via settings)
app.use("/api/auth", authRoutes);

// Settings & user management (admin only)
app.use("/api/settings", settingsRoutes);

// Core features (authenticated)
app.use("/api/water-features", waterFeatureRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/census", censusRoutes);
app.use("/api/jobs", jobRoutes);

// Public endpoint for Google Maps API key (needed by frontend before login)
app.get("/api/public/maps-key", async (_req, res) => {
  try {
    const settings = await Settings.getInstance();
    res.json({
      success: true,
      data: { googleMapsApiKey: settings.googleMapsApiKey || "" },
    });
  } catch {
    res.json({ success: true, data: { googleMapsApiKey: "" } });
  }
});

// API health check
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Pond Finder API is running",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(errorHandler);

export default app;
