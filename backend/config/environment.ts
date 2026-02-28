import dotenv from "dotenv";

dotenv.config();

/**
 * Server configuration from environment variables.
 * API keys (Google Maps, Smarty) are stored in the database
 * and managed via the Settings panel — NOT here.
 */
const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/pond-finder",

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
  },
};

export default config;
