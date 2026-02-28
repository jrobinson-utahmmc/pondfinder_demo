/**
 * US Census Bureau API Service
 *
 * Fetches demographic / wealth data from the American Community Survey (ACS)
 * 5-Year estimates. The data is keyed by census tract (subdivisions of counties).
 *
 * Key variable used:
 *   B19013_001E – Median household income in the past 12 months
 *
 * Census API docs: https://api.census.gov/data.html
 *
 * A free API key can be obtained at: https://api.census.gov/data/key_signup.html
 * The API also works without a key (lower rate limit).
 */

import Settings from "../models/Settings";

const ACS_YEAR = "2022"; // latest available ACS 5-year
const ACS_DATASET = "acs/acs5";
const CENSUS_BASE_URL = `https://api.census.gov/data/${ACS_YEAR}/${ACS_DATASET}`;

// Census Bureau TIGERweb for tract geometries
// Use the "Current" vintage — always available and up-to-date
const TIGERWEB_BASE_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";

// Layer IDs in tigerWMS_Current (differ from ACS2022 vintage!)
// Layer 82 = Counties, Layer 8 = Census Tracts
const COUNTIES_LAYER = 82;
const TRACTS_LAYER = 8;

// Fetch timeout in ms
const FETCH_TIMEOUT = 30_000;

/** Simple GeoJSON-like geometry (avoids needing @types/geojson). */
interface SimpleGeometry {
  type: string;
  coordinates: any;
}

/**
 * Result for a single census tract's income data.
 */
export interface CensusTractIncome {
  geoid: string; // Full GEOID (state+county+tract FIPS)
  state: string;
  county: string;
  tract: string;
  medianIncome: number | null;
  name: string;
  geometry?: SimpleGeometry;
}

/**
 * Fetch the Census API key from Settings (optional — API works without one).
 */
async function getCensusApiKey(): Promise<string | null> {
  try {
    const settings = await Settings.getInstance();
    return settings.censusApiKey || null;
  } catch {
    return null;
  }
}

/** Fetch with AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert ESRI JSON rings to GeoJSON Polygon coordinates.
 * ESRI geometry: { rings: number[][][] }
 * GeoJSON Polygon: { type: "Polygon", coordinates: number[][][] }
 */
function esriToGeoJSON(esriGeometry: any): SimpleGeometry | null {
  if (!esriGeometry) return null;

  if (esriGeometry.rings) {
    return {
      type: "Polygon",
      coordinates: esriGeometry.rings,
    };
  }
  // Already GeoJSON-like (has type and coordinates)
  if (esriGeometry.type && esriGeometry.coordinates) {
    return esriGeometry;
  }
  return null;
}

/**
 * Map a bounding box to the state + county FIPS codes that intersect it.
 * Uses the Census TIGERweb service to query by geometry envelope.
 */
async function getCountiesInBBox(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<{ state: string; county: string }[]> {
  // Use TIGERweb Counties layer
  const url = new URL(`${TIGERWEB_BASE_URL}/${COUNTIES_LAYER}/query`);
  url.searchParams.set("geometry", `${west},${south},${east},${north}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "STATE,COUNTY");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  console.log("[Census] Querying counties:", url.toString());

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `TIGERweb county query failed: ${res.status} - ${text.substring(0, 200)}`
    );
  }
  const data = (await res.json()) as any;

  // Check for ESRI error response
  if (data.error) {
    throw new Error(
      `TIGERweb county query error: ${data.error.message || JSON.stringify(data.error)}`
    );
  }

  const features = data.features || [];
  console.log(`[Census] Found ${features.length} county features`);

  const seen = new Set<string>();
  const counties: { state: string; county: string }[] = [];

  for (const f of features) {
    const state = f.attributes?.STATE;
    const county = f.attributes?.COUNTY;
    if (state && county) {
      const key = `${state}-${county}`;
      if (!seen.has(key)) {
        seen.add(key);
        counties.push({ state, county });
      }
    }
  }
  console.log(`[Census] Unique counties: ${counties.length}`);
  return counties;
}

/**
 * Fetch census tract geometries from TIGERweb within a bounding box.
 * Tries GeoJSON format first, falls back to ESRI JSON if unavailable.
 * Returns a map of GEOID → geometry.
 */
async function getTractGeometries(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<Map<string, SimpleGeometry>> {
  const map = new Map<string, SimpleGeometry>();

  // Try GeoJSON format first
  const url = new URL(`${TIGERWEB_BASE_URL}/${TRACTS_LAYER}/query`);
  url.searchParams.set("geometry", `${west},${south},${east},${north}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "GEOID,STATE,COUNTY,TRACT");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "geojson");

  console.log("[Census] Querying tract geometries (GeoJSON):", url.toString());

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[Census] GeoJSON query failed (${res.status}), trying ESRI JSON fallback`);
    return getTractGeometriesEsri(south, west, north, east);
  }

  const data = (await res.json()) as any;

  // If the response has an error or is not GeoJSON, fall back
  if (data.error || !data.features || !Array.isArray(data.features)) {
    console.warn("[Census] GeoJSON response invalid, trying ESRI JSON fallback:", data.error?.message);
    return getTractGeometriesEsri(south, west, north, east);
  }

  for (const feature of data.features) {
    const geoid = feature.properties?.GEOID;
    if (geoid && feature.geometry) {
      map.set(geoid, feature.geometry);
    }
  }

  console.log(`[Census] Got ${map.size} tract geometries (GeoJSON)`);
  return map;
}

/**
 * Fallback: fetch tract geometries in ESRI JSON format and convert to GeoJSON-like.
 */
async function getTractGeometriesEsri(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<Map<string, SimpleGeometry>> {
  const url = new URL(`${TIGERWEB_BASE_URL}/${TRACTS_LAYER}/query`);
  url.searchParams.set("geometry", `${west},${south},${east},${north}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "GEOID,STATE,COUNTY,TRACT");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "json");

  console.log("[Census] Querying tract geometries (ESRI JSON fallback):", url.toString());

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `TIGERweb tract query failed: ${res.status} - ${text.substring(0, 200)}`
    );
  }

  const data = (await res.json()) as any;

  if (data.error) {
    throw new Error(
      `TIGERweb tract query error: ${data.error.message || JSON.stringify(data.error)}`
    );
  }

  const map = new Map<string, SimpleGeometry>();
  for (const feature of data.features || []) {
    const geoid = feature.attributes?.GEOID;
    const geometry = esriToGeoJSON(feature.geometry);
    if (geoid && geometry) {
      map.set(geoid, geometry);
    }
  }

  console.log(`[Census] Got ${map.size} tract geometries (ESRI JSON)`);
  return map;
}

/**
 * Fetch median household income by census tract for given state+county pairs.
 */
async function getIncomeForCounties(
  counties: { state: string; county: string }[]
): Promise<Map<string, { medianIncome: number | null; name: string }>> {
  const apiKey = await getCensusApiKey();
  const resultMap = new Map<string, { medianIncome: number | null; name: string }>();

  // Census API allows querying one county at a time for tracts
  // Batch by state to reduce calls when multiple counties share a state
  const byState = new Map<string, string[]>();
  for (const { state, county } of counties) {
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state)!.push(county);
  }

  for (const [state, countyList] of byState) {
    for (const county of countyList) {
      try {
        const url = new URL(CENSUS_BASE_URL);
        url.searchParams.set("get", "NAME,B19013_001E");
        url.searchParams.set("for", "tract:*");
        url.searchParams.set("in", `state:${state} county:${county}`);
        if (apiKey) url.searchParams.set("key", apiKey);

        console.log(`[Census] Fetching income: state=${state} county=${county}`);
        const res = await fetchWithTimeout(url.toString());
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn(
            `[Census] ACS API error for state=${state} county=${county}: ${res.status} - ${text.substring(0, 200)}`
          );
          continue;
        }

        const data = (await res.json()) as string[][];
        // First row is header: ["NAME", "B19013_001E", "state", "county", "tract"]
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const name = row[0];
          const incomeStr = row[1];
          const st = row[2];
          const cty = row[3];
          const tract = row[4];
          const geoid = `${st}${cty}${tract}`;

          const income =
            incomeStr && incomeStr !== "-666666666" && incomeStr !== "null"
              ? parseInt(incomeStr, 10)
              : null;

          resultMap.set(geoid, { medianIncome: income, name });
        }
      } catch (err) {
        console.warn(`[Census] Fetch error for state=${state} county=${county}:`, err);
      }
    }
  }

  console.log(`[Census] Income data for ${resultMap.size} tracts`);
  return resultMap;
}

/**
 * Main entry point: get census tract income data + geometries for a bounding box.
 */
export async function getCensusIncomeByBBox(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<CensusTractIncome[]> {
  console.log(`[Census] getCensusIncomeByBBox: south=${south} west=${west} north=${north} east=${east}`);

  // 1. Find counties that overlap the bbox
  const counties = await getCountiesInBBox(south, west, north, east);
  if (counties.length === 0) {
    console.log("[Census] No counties found in bbox");
    return [];
  }

  // 2. Fetch tract geometries and income data in parallel
  const [geometries, incomeData] = await Promise.all([
    getTractGeometries(south, west, north, east),
    getIncomeForCounties(counties),
  ]);

  // 3. Merge into results — only include tracts that have geometry within the bbox
  const results: CensusTractIncome[] = [];

  for (const [geoid, geometry] of geometries) {
    const income = incomeData.get(geoid);
    const state = geoid.substring(0, 2);
    const county = geoid.substring(2, 5);
    const tract = geoid.substring(5);

    results.push({
      geoid,
      state,
      county,
      tract,
      medianIncome: income?.medianIncome ?? null,
      name: income?.name ?? `Tract ${tract}`,
      geometry,
    });
  }

  console.log(`[Census] Returning ${results.length} tracts with geometries`);
  return results;
}

// Simple in-memory cache for census data
const censusCache = new Map<
  string,
  { data: CensusTractIncome[]; timestamp: number }
>();
const CENSUS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function roundCoord(n: number, decimals = 2): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

/**
 * Cached version of getCensusIncomeByBBox.
 */
export async function getCensusIncomeByBBoxCached(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<CensusTractIncome[]> {
  const key = `${roundCoord(south)},${roundCoord(west)},${roundCoord(north)},${roundCoord(east)}`;
  const cached = censusCache.get(key);
  if (cached && Date.now() - cached.timestamp < CENSUS_CACHE_TTL) {
    console.log(`[Census] Cache hit for ${key}`);
    return cached.data;
  }

  const data = await getCensusIncomeByBBox(south, west, north, east);
  censusCache.set(key, { data, timestamp: Date.now() });

  // Evict old entries
  if (censusCache.size > 20) {
    const oldest = censusCache.keys().next().value;
    if (oldest) censusCache.delete(oldest);
  }

  return data;
}
