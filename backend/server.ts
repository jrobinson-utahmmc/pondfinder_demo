import app from "./app";
import config from "./config/environment";
import { connectDatabase } from "./config/database";

async function startServer(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Start Express server
  app.listen(config.port, () => {
    console.log("=".repeat(50));
    console.log(`  Pond Finder API running on port ${config.port}`);
    console.log(`  http://localhost:${config.port}`);
    console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
    console.log("=".repeat(50));
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Server] SIGTERM received, shutting down...");
  process.exit(0);
});

startServer().catch((err) => {
  console.error("[Server] Failed to start:", err);
  process.exit(1);
});
