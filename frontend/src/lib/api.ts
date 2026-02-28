/**
 * API client for the Pond Finder backend.
 * All fetch calls to the Express API go through here.
 */

import type {
  ApiResponse,
  AuthResult,
  SetupStatus,
  AppSettings,
  ApiKeys,
  User,
  WaterFeature,
  WaterFeatureCreatePayload,
  PropertyOwner,
  PropertyLookupPayload,
  CoordinateLookupPayload,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";  // Empty = same origin (proxied via Next.js rewrites)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pond_finder_token");
}

export function setToken(token: string) {
  localStorage.setItem("pond_finder_token", token);
  // Mirror to cookie so Next.js middleware can check auth
  document.cookie = `pond_finder_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem("pond_finder_token");
  localStorage.removeItem("pond_finder_user");
  // Remove the mirrored cookie
  document.cookie = "pond_finder_token=; path=/; max-age=0";
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("pond_finder_user");
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: { id: string; username: string; email: string; role?: string }) {
  localStorage.setItem("pond_finder_user", JSON.stringify(user));
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  // 401 → session expired
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please log in again.");
  }

  const data: ApiResponse<T> = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Setup (unauthenticated)
// ---------------------------------------------------------------------------

export async function apiGetSetupStatus() {
  return request<SetupStatus>("/api/setup/status");
}

export async function apiInitSetup(payload: {
  username: string;
  email: string;
  password: string;
}) {
  const data = await request<AuthResult>("/api/setup/init", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data.data) {
    setToken(data.data.token);
    setStoredUser(data.data.user);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiLogin(identifier: string, password: string) {
  const data = await request<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  if (data.data) {
    setToken(data.data.token);
    setStoredUser(data.data.user);
  }
  return data;
}

export function apiLogout() {
  clearToken();
}

export async function apiGetProfile() {
  return request<{ id: string; username: string; email: string; role: string; createdAt: string }>(
    "/api/auth/profile"
  );
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function apiGetMapsKey() {
  return request<{ googleMapsApiKey: string }>("/api/public/maps-key");
}

// ---------------------------------------------------------------------------
// Settings (admin only)
// ---------------------------------------------------------------------------

export async function apiGetSettings() {
  return request<AppSettings>("/api/settings");
}

export async function apiUpdateSettings(payload: Partial<ApiKeys & { appName: string }>) {
  return request<AppSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function apiGetApiKeys() {
  return request<ApiKeys>("/api/settings/api-keys");
}

// ---------------------------------------------------------------------------
// User Management (admin only)
// ---------------------------------------------------------------------------

export async function apiListUsers() {
  return request<User[]>("/api/settings/users");
}

export async function apiCreateUser(payload: {
  username: string;
  email: string;
  password: string;
  role?: string;
}) {
  return request<User>("/api/settings/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateUser(
  id: string,
  payload: { username?: string; email?: string; password?: string; role?: string }
) {
  return request<User>(`/api/settings/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteUser(id: string) {
  return request<void>(`/api/settings/users/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Water Features
// ---------------------------------------------------------------------------

export async function apiGetWaterFeatures(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return request<WaterFeature[]>(`/api/water-features${query ? "?" + query : ""}`);
}

export async function apiGetWaterFeature(id: string) {
  return request<WaterFeature>(`/api/water-features/${id}`);
}

export async function apiCreateWaterFeature(payload: WaterFeatureCreatePayload) {
  return request<WaterFeature>("/api/water-features", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateWaterFeature(id: string, payload: Partial<WaterFeature>) {
  return request<WaterFeature>(`/api/water-features/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteWaterFeature(id: string) {
  return request<void>(`/api/water-features/${id}`, { method: "DELETE" });
}

export async function apiFindNearbyFeatures(lat: number, lng: number, radius = 5000) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    radius: radius.toString(),
  }).toString();
  return request<WaterFeature[]>(`/api/water-features/nearby?${params}`);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export async function apiLookupProperty(payload: PropertyLookupPayload) {
  return request<PropertyOwner>("/api/properties/lookup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiLookupPropertyByCoords(payload: CoordinateLookupPayload) {
  return request<PropertyOwner>("/api/properties/lookup-coordinates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiGetProperties(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return request<PropertyOwner[]>(`/api/properties${query ? "?" + query : ""}`);
}

export async function apiGetProperty(id: string) {
  return request<PropertyOwner>(`/api/properties/${id}`);
}

export async function apiDeleteProperty(id: string) {
  return request<void>(`/api/properties/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function apiHealthCheck() {
  return request<{ message: string; timestamp: string }>("/api/health");
}

// ---------------------------------------------------------------------------
// Census Demographics
// ---------------------------------------------------------------------------

export interface CensusTractIncome {
  geoid: string;
  state: string;
  county: string;
  tract: string;
  medianIncome: number | null;
  name: string;
  geometry?: {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinates: any;
  };
}

export async function apiGetCensusIncome(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}) {
  const params = new URLSearchParams({
    south: bounds.south.toString(),
    west: bounds.west.toString(),
    north: bounds.north.toString(),
    east: bounds.east.toString(),
  }).toString();
  return request<CensusTractIncome[]>(`/api/census/income?${params}`);
}

// ---------------------------------------------------------------------------
// Jobs (async tasks)
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type JobType = "water-scan" | "batch-property" | "census-load" | "full-analysis";

export interface JobSummary {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  statusMessage: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  hasResult?: boolean;
  error: string | null;
}

export interface JobDetail extends JobSummary {
  params: Record<string, any>;
  result: any;
}

export async function apiCreateJob(type: JobType, params: Record<string, any>) {
  return request<JobSummary>("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ type, params }),
  });
}

export async function apiListJobs(limit = 20) {
  return request<JobSummary[]>(`/api/jobs?limit=${limit}`);
}

export async function apiGetJob(id: string) {
  return request<JobDetail>(`/api/jobs/${id}`);
}

export async function apiCancelJob(id: string) {
  return request<{ id: string; status: string; statusMessage: string }>(
    `/api/jobs/${id}`,
    { method: "DELETE" }
  );
}

/**
 * Poll a job until it reaches a terminal state (completed, failed, cancelled).
 * Calls onProgress with each poll result.
 * Returns the final job detail.
 */
export async function apiPollJob(
  id: string,
  onProgress?: (job: JobDetail) => void,
  intervalMs = 2000,
  maxPolls = 300
): Promise<JobDetail> {
  for (let i = 0; i < maxPolls; i++) {
    const res = await apiGetJob(id);
    const job = res.data!;
    onProgress?.(job);

    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return job;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Job polling timed out");
}
