/**
 * Saved Regions - localStorage-based storage for user-defined scan regions.
 */

export interface SavedRegion {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  center: { lat: number; lng: number };
  area: number; // square meters
  createdAt: string;
  waterBodyCount?: number;
}

const STORAGE_KEY = "pond-finder-saved-regions";

/**
 * Get all saved regions from localStorage.
 */
export function getSavedRegions(): SavedRegion[] {
  if (typeof window === "undefined") return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save a new region.
 */
export function saveRegion(region: Omit<SavedRegion, "id" | "createdAt">): SavedRegion {
  const regions = getSavedRegions();
  
  const newRegion: SavedRegion = {
    ...region,
    id: `region-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  
  regions.unshift(newRegion);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(regions));
  
  return newRegion;
}

/**
 * Update an existing region.
 */
export function updateRegion(id: string, updates: Partial<SavedRegion>): SavedRegion | null {
  const regions = getSavedRegions();
  const index = regions.findIndex((r) => r.id === id);
  
  if (index === -1) return null;
  
  regions[index] = { ...regions[index], ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(regions));
  
  return regions[index];
}

/**
 * Delete a saved region.
 */
export function deleteRegion(id: string): boolean {
  const regions = getSavedRegions();
  const filtered = regions.filter((r) => r.id !== id);
  
  if (filtered.length === regions.length) return false;
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

/**
 * Rename a saved region.
 */
export function renameRegion(id: string, name: string): SavedRegion | null {
  return updateRegion(id, { name });
}

/**
 * Calculate area from bounds in square meters.
 */
export function calculateBoundsArea(bounds: SavedRegion["bounds"]): number {
  const latDiff = bounds.north - bounds.south;
  const lngDiff = bounds.east - bounds.west;
  
  // Approximate conversion to meters
  const metersPerDegreeLat = 111320;
  const centerLat = (bounds.north + bounds.south) / 2;
  const metersPerDegreeLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  
  const heightM = latDiff * metersPerDegreeLat;
  const widthM = lngDiff * metersPerDegreeLng;
  
  return heightM * widthM;
}
