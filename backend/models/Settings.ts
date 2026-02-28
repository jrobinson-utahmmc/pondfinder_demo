import mongoose, { Schema, Document } from "mongoose";

/**
 * App settings stored in the database.
 * Singleton document — only one should ever exist.
 * Stores API keys and app-wide configuration.
 */

export interface ISettings extends Document {
  /** Google Maps JavaScript API key */
  googleMapsApiKey: string;
  /** Smarty (formerly SmartyStreets) auth ID */
  smartyAuthId: string;
  /** Smarty auth token */
  smartyAuthToken: string;
  /** US Census Bureau API key (optional — works without one at lower rate limit) */
  censusApiKey: string;
  /** Whether the initial admin setup has been completed */
  setupCompleted: boolean;
  /** App display name (optional customization) */
  appName: string;
  createdAt: Date;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    googleMapsApiKey: {
      type: String,
      default: "",
    },
    smartyAuthId: {
      type: String,
      default: "",
    },
    smartyAuthToken: {
      type: String,
      default: "",
    },
    censusApiKey: {
      type: String,
      default: "",
    },
    setupCompleted: {
      type: Boolean,
      default: false,
    },
    appName: {
      type: String,
      default: "Pond Finder",
    },
  },
  { timestamps: true }
);

/**
 * Get the singleton settings document (creates one if missing).
 */
SettingsSchema.statics.getInstance = async function (): Promise<ISettings> {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export interface ISettingsModel extends mongoose.Model<ISettings> {
  getInstance(): Promise<ISettings>;
}

const Settings = mongoose.model<ISettings, ISettingsModel>(
  "Settings",
  SettingsSchema
);

export default Settings;
