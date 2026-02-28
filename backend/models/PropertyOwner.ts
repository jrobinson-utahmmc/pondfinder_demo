import mongoose, { Document, Schema } from "mongoose";

/**
 * Represents a property owner retrieved from the Smarty API.
 * Linked to one or more WaterFeature documents.
 */
export interface IPropertyOwner extends Document {
  firstName: string;
  lastName: string;
  companyName: string;
  mailingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  propertyAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  parcelId: string;
  phone: string;
  email: string;
  propertyType: string;
  lotSizeAcres: number;
  marketValue: number;
  coordinates: {
    type: "Point";
    coordinates: number[]; // [lng, lat]
  };
  waterFeatures: mongoose.Types.ObjectId[];
  smartyLookupId: string; // unique reference from Smarty API lookups
  lastVerified: Date;
  notes: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const propertyOwnerSchema = new Schema<IPropertyOwner>(
  {
    firstName: {
      type: String,
      trim: true,
      default: "",
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    companyName: {
      type: String,
      trim: true,
      default: "",
    },
    mailingAddress: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zipCode: { type: String, default: "" },
    },
    propertyAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
    },
    parcelId: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    propertyType: {
      type: String,
      trim: true,
      default: "unknown",
    },
    lotSizeAcres: {
      type: Number,
      default: 0,
    },
    marketValue: {
      type: Number,
      default: 0,
    },
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    waterFeatures: [
      {
        type: Schema.Types.ObjectId,
        ref: "WaterFeature",
      },
    ],
    smartyLookupId: {
      type: String,
      unique: true,
      sparse: true,
    },
    lastVerified: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

propertyOwnerSchema.index({ coordinates: "2dsphere" });
propertyOwnerSchema.index({ "propertyAddress.zipCode": 1 });
propertyOwnerSchema.index({ lastName: 1, firstName: 1 });

const PropertyOwner = mongoose.model<IPropertyOwner>("PropertyOwner", propertyOwnerSchema);
export default PropertyOwner;
