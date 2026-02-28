import mongoose, { Document, Schema } from "mongoose";

/**
 * Represents a coordinate pair [longitude, latitude] used in GeoJSON.
 */
export interface ICoordinate {
  lng: number;
  lat: number;
}

/**
 * Represents a bounding box drawn around a water feature on the map.
 * Stored as a GeoJSON Polygon for geospatial queries.
 */
export interface IWaterFeature extends Document {
  name: string;
  description: string;
  featureType: "pond" | "lake" | "stream" | "river" | "wetland" | "reservoir" | "other";
  bounds: {
    type: "Polygon";
    coordinates: number[][][];
  };
  center: {
    type: "Point";
    coordinates: number[]; // [lng, lat]
  };
  area: number; // estimated area in square meters
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyOwner: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  notes: string;
  tags: string[];
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const waterFeatureSchema = new Schema<IWaterFeature>(
  {
    name: {
      type: String,
      required: [true, "Water feature name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },
    featureType: {
      type: String,
      enum: ["pond", "lake", "stream", "river", "wetland", "reservoir", "other"],
      default: "pond",
    },
    bounds: {
      type: {
        type: String,
        enum: ["Polygon"],
        required: true,
        default: "Polygon",
      },
      coordinates: {
        type: [[[Number]]],
        required: [true, "Bounding polygon coordinates are required"],
      },
    },
    center: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: [true, "Center coordinates are required"],
      },
    },
    area: {
      type: Number,
      default: 0,
      min: [0, "Area cannot be negative"],
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    zipCode: {
      type: String,
      trim: true,
      default: "",
    },
    propertyOwner: {
      type: Schema.Types.ObjectId,
      ref: "PropertyOwner",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      default: "",
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },
    tags: {
      type: [String],
      default: [],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial indexes for efficient queries
waterFeatureSchema.index({ bounds: "2dsphere" });
waterFeatureSchema.index({ center: "2dsphere" });
waterFeatureSchema.index({ createdBy: 1 });
waterFeatureSchema.index({ featureType: 1 });

const WaterFeature = mongoose.model<IWaterFeature>("WaterFeature", waterFeatureSchema);
export default WaterFeature;
