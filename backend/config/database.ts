import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/pond-finder";

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("[Database] Connected to MongoDB successfully");
  } catch (error) {
    console.error("[Database] Connection failed:", error);
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    console.error("[Database] Runtime error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[Database] Disconnected from MongoDB");
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log("[Database] Disconnected gracefully");
}
