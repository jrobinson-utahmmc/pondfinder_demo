/**
 * Overpass API client for fetching water bodies from OpenStreetMap.
 * 
 * This queries the free Overpass API to find ponds, lakes, reservoirs,
 * and other water features within a given map viewport.
 * 
 * Includes caching and rate limit handling to avoid 429 errors.
 */

export interface WaterBodyResult {
  id: string;
  name: string;
  type: "pond" | "lake" | "reservoir" | "basin" | "stream" | "river" | "wetland" | "water" | "pool";
  coordinates: number[][][]; // GeoJSON Polygon coordinates [[[lng, lat], ...]]
  center: { lat: number; lng: number };
  area: number; // approximate area in square meters
  tags: Record<string, string>;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

// Rate limit state
let isRateLimited = false;
let rateLimitResetTime = 0;
let consecutiveErrors = 0;

// Cache for API responses (keyed by rounded bbox)
const responseCache = new Map<string, { data: WaterBodyResult[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

/**
 * Generate a cache key from a bounding box (rounded to reduce cache misses).
 */
function getBboxCacheKey(bbox: BoundingBox): string {
  // Round to 3 decimal places (~100m precision) for cache efficiency
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return `${round(bbox.south)},${round(bbox.west)},${round(bbox.north)},${round(bbox.east)}`;
}

/**
 * Check if a cached result exists and is still valid.
 */
function getCachedResult(bbox: BoundingBox): WaterBodyResult[] | null {
  const key = getBboxCacheKey(bbox);
  const cached = responseCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("[Overpass] Cache hit for bbox:", key);
    return cached.data;
  }
  
  return null;
}

/**
 * Store result in cache.
 */
function setCachedResult(bbox: BoundingBox, data: WaterBodyResult[]): void {
  // Evict old entries if cache is full
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  
  const key = getBboxCacheKey(bbox);
  responseCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Build Overpass QL query for water bodies in a bounding box.
 * Targets: ponds, lakes, reservoirs, basins, and general water features.
 * When includeSmall is true, also includes swimming pools and man-made ponds.
 */
function buildWaterQuery(bbox: BoundingBox, includeSmall = false): string {
  const { south, west, north, east } = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  // Query for various water body types
  // natural=water covers most water bodies
  // water=* specifies the type (pond, lake, reservoir, etc.)
  // landuse=reservoir and landuse=basin for man-made water storage
  const smallBodyQueries = includeSmall
    ? `
  // Swimming pools
  way["leisure"="swimming_pool"](${bboxStr});
  relation["leisure"="swimming_pool"](${bboxStr});
  
  // Man-made ponds and water features
  way["man_made"="pond"](${bboxStr});
  way["natural"="water"]["water"="pond"](${bboxStr});
  node["natural"="water"]["water"="pond"](${bboxStr});
  
  // Garden ponds / ornamental water
  way["water"="pond"](${bboxStr});
  way["water"="reflecting_pool"](${bboxStr});
  way["water"="pool"](${bboxStr});
  way["man_made"="water_well"](${bboxStr});
  way["amenity"="fountain"](${bboxStr});
`
    : "";

  return `
[out:json][timeout:30];
(
  // Natural water bodies
  way["natural"="water"]["water"~"pond|lake|reservoir|basin"](${bboxStr});
  relation["natural"="water"]["water"~"pond|lake|reservoir|basin"](${bboxStr});
  
  // General water (when specific type not tagged)
  way["natural"="water"](${bboxStr});
  relation["natural"="water"](${bboxStr});
  
  // Man-made water features
  way["landuse"~"reservoir|basin"](${bboxStr});
  relation["landuse"~"reservoir|basin"](${bboxStr});
  
  // Wetlands (can contain ponds)
  way["natural"="wetland"](${bboxStr});
  ${smallBodyQueries}
);
out body geom;
`;
}

/**
 * Calculate approximate area of a polygon using the Shoelace formula.
 * Coordinates should be [lng, lat] pairs.
 */
function calculatePolygonArea(coords: number[][]): number {
  if (coords.length < 3) return 0;

  // Convert to approximate meters using center point
  const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  const latRad = (centerLat * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(latRad);

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const xi = coords[i][0] * metersPerDegreeLng;
    const yi = coords[i][1] * metersPerDegreeLat;
    const xj = coords[j][0] * metersPerDegreeLng;
    const yj = coords[j][1] * metersPerDegreeLat;
    area += xi * yj - xj * yi;
  }

  return Math.abs(area / 2);
}

/**
 * Calculate the centroid of a polygon.
 */
function calculateCentroid(coords: number[][]): { lat: number; lng: number } {
  if (coords.length === 0) return { lat: 0, lng: 0 };

  const sumLng = coords.reduce((sum, c) => sum + c[0], 0);
  const sumLat = coords.reduce((sum, c) => sum + c[1], 0);

  return {
    lng: sumLng / coords.length,
    lat: sumLat / coords.length,
  };
}

/**
 * Determine water body type from OSM tags.
 */
function getWaterType(tags: Record<string, string>): WaterBodyResult["type"] {
  const waterTag = tags.water?.toLowerCase();
  const naturalTag = tags.natural?.toLowerCase();
  const landuseTag = tags.landuse?.toLowerCase();
  const leisureTag = tags.leisure?.toLowerCase();
  const manMadeTag = tags.man_made?.toLowerCase();

  // Swimming pools
  if (leisureTag === "swimming_pool") return "pool";
  if (waterTag === "pool" || waterTag === "reflecting_pool") return "pool";

  if (waterTag === "pond" || manMadeTag === "pond") return "pond";
  if (waterTag === "lake") return "lake";
  if (waterTag === "reservoir" || landuseTag === "reservoir") return "reservoir";
  if (waterTag === "basin" || landuseTag === "basin") return "basin";
  if (waterTag === "stream" || waterTag === "river") return "river";
  if (naturalTag === "wetland") return "wetland";

  return "water";
}

/**
 * Parse Overpass API response into WaterBodyResult array.
 */
function parseOverpassResponse(data: any, includeSmall = false): WaterBodyResult[] {
  const results: WaterBodyResult[] = [];
  const elements = data.elements || [];

  for (const element of elements) {
    // Skip if no geometry
    if (!element.geometry && !element.bounds) continue;

    let coordinates: number[][] = [];

    if (element.type === "way" && element.geometry) {
      // Way: geometry is an array of {lat, lon} objects
      coordinates = element.geometry.map((pt: any) => [pt.lon, pt.lat]);
    } else if (element.type === "relation" && element.members) {
      // Relation: combine outer ways
      for (const member of element.members) {
        if (member.role === "outer" && member.geometry) {
          coordinates = member.geometry.map((pt: any) => [pt.lon, pt.lat]);
          break; // Use first outer ring
        }
      }
    }

    // Skip if we couldn't extract coordinates or too few points
    if (coordinates.length < 3) continue;

    // Close the polygon if not closed
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coordinates.push([...first]);
    }

    const tags = element.tags || {};
    const center = calculateCentroid(coordinates);
    const area = calculatePolygonArea(coordinates);
    const waterType = getWaterType(tags);

    // Area filtering:
    // - In "include small" mode, allow down to 5 sq meters (swimming pools)
    //   but still skip very large (> 1 sq km)
    // - In normal mode, skip anything below 100 sq meters
    const minArea = includeSmall ? 5 : 100;
    if (area < minArea || area > 1000000) continue;

    results.push({
      id: `osm-${element.type}-${element.id}`,
      name: tags.name || `Unnamed ${waterType}`,
      type: waterType,
      coordinates: [coordinates], // GeoJSON Polygon format
      center,
      area,
      tags,
    });
  }

  return results;
}

/**
 * Fetch water bodies within a bounding box from OpenStreetMap via Overpass API.
 * Includes caching and rate limit handling.
 */
export async function fetchWaterBodies(bbox: BoundingBox, includeSmall = false): Promise<WaterBodyResult[]> {
  // Check cache first (include mode in key)
  const cacheKey = includeSmall ? { ...bbox, south: bbox.south + 0.0000001 } : bbox;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  // Check if we're rate limited
  if (isRateLimited && Date.now() < rateLimitResetTime) {
    const waitSecs = Math.ceil((rateLimitResetTime - Date.now()) / 1000);
    console.log(`[Overpass] Rate limited. Waiting ${waitSecs}s before retry.`);
    return [];
  }

  const query = buildWaterQuery(bbox, includeSmall);

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (response.status === 429) {
      // Rate limited - back off exponentially
      consecutiveErrors++;
      const backoffMs = Math.min(30000, 1000 * Math.pow(2, consecutiveErrors));
      isRateLimited = true;
      rateLimitResetTime = Date.now() + backoffMs;
      console.warn(`[Overpass] Rate limited (429). Backing off for ${backoffMs / 1000}s`);
      return [];
    }

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    // Success - reset error counter
    consecutiveErrors = 0;
    isRateLimited = false;

    const data = await response.json();
    const results = parseOverpassResponse(data, includeSmall);
    
    // Cache the results
    setCachedResult(cacheKey, results);
    
    return results;
  } catch (error) {
    console.error("[Overpass] Failed to fetch water bodies:", error);
    consecutiveErrors++;
    return [];
  }
}

/**
 * Debounced version of fetchWaterBodies to avoid hammering the API.
 * Uses a longer delay to be respectful of the free API.
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastBbox: BoundingBox | null = null;

export function fetchWaterBodiesDebounced(
  bbox: BoundingBox,
  callback: (results: WaterBodyResult[]) => void,
  delay = 1500, // Increased from 500ms to 1500ms
  includeSmall = false
): void {
  // Skip if bbox hasn't changed significantly
  if (lastBbox) {
    const threshold = 0.001; // ~100m
    const unchanged = 
      Math.abs(bbox.south - lastBbox.south) < threshold &&
      Math.abs(bbox.west - lastBbox.west) < threshold &&
      Math.abs(bbox.north - lastBbox.north) < threshold &&
      Math.abs(bbox.east - lastBbox.east) < threshold;
    
    if (unchanged) {
      console.log("[Overpass] Bbox unchanged, skipping fetch");
      return;
    }
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    lastBbox = bbox;
    const results = await fetchWaterBodies(bbox, includeSmall);
    callback(results);
  }, delay);
}

/**
 * Check if API is currently rate limited.
 */
export function isApiRateLimited(): boolean {
  return isRateLimited && Date.now() < rateLimitResetTime;
}

/**
 * Get time until rate limit resets (in seconds).
 */
export function getRateLimitResetIn(): number {
  if (!isRateLimited) return 0;
  return Math.max(0, Math.ceil((rateLimitResetTime - Date.now()) / 1000));
}

/**
 * Clear the response cache.
 */
export function clearCache(): void {
  responseCache.clear();
  console.log("[Overpass] Cache cleared");
}
