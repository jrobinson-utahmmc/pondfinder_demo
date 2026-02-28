// Shared TypeScript types for the Pond Finder frontend

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface SetupStatus {
  needsSetup: boolean;
  hasUsers: boolean;
}

export interface AppSettings {
  googleMapsApiKey: string;
  smartyAuthId: string;
  smartyAuthToken: string;
  smartyConfigured: boolean;
  googleMapsConfigured: boolean;
  appName: string;
  setupCompleted: boolean;
}

export interface ApiKeys {
  googleMapsApiKey: string;
  smartyAuthId: string;
  smartyAuthToken: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: { field: string; message: string }[];
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface WaterFeature {
  _id: string;
  name: string;
  description: string;
  featureType: FeatureType;
  bounds: GeoPolygon;
  center: GeoPoint;
  area: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyOwner: PropertyOwner | string | null;
  createdBy: User | string;
  notes: string;
  tags: string[];
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FeatureType =
  | "pond"
  | "lake"
  | "stream"
  | "river"
  | "wetland"
  | "reservoir"
  | "other";

export interface GeoPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeoPoint {
  type: "Point";
  coordinates: number[]; // [lng, lat]
}

export interface PropertyOwner {
  _id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  mailingAddress: Address;
  propertyAddress: Address;
  parcelId: string;
  phone: string;
  email: string;
  propertyType: string;
  lotSizeAcres: number;
  marketValue: number;
  coordinates: GeoPoint;
  waterFeatures: WaterFeature[] | string[];
  smartyLookupId: string;
  lastVerified: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface WaterFeatureCreatePayload {
  name: string;
  featureType: FeatureType;
  description?: string;
  notes?: string;
  tags?: string[];
  bounds: GeoPolygon;
  center: GeoPoint;
  area: number;
}

export interface PropertyLookupPayload {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  waterFeatureId?: string;
}

export interface CoordinateLookupPayload {
  latitude: number;
  longitude: number;
  waterFeatureId?: string;
}
