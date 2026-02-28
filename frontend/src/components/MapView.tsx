"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import {
  fetchWaterBodiesDebounced,
  isApiRateLimited,
  getRateLimitResetIn,
  type WaterBodyResult,
  type BoundingBox,
} from "@/lib/overpass";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrawnRegion {
  bounds: BoundingBox;
  center: { lat: number; lng: number };
  area: number;
}

interface MapViewProps {
  /** Google Maps API key (fetched from backend) */
  apiKey?: string;
  /** Initial map center */
  initialCenter?: { lat: number; lng: number };
  /** Initial zoom level */
  initialZoom?: number;
  /** Called when the user finishes drawing a region */
  onRegionDrawn?: (region: DrawnRegion) => void;
  /** Whether region drawing is active */
  regionDrawingEnabled?: boolean;
  /** Called when a water body is detected and clicked */
  onWaterBodyClick?: (waterBody: WaterBodyResult) => void;
  /** Called when water bodies are detected in the viewport */
  onWaterBodiesDetected?: (waterBodies: WaterBodyResult[]) => void;
  /** Bounding box to scan for water bodies (only scans within this region) */
  scanRegion?: BoundingBox | null;
  /** Whether scanning is active */
  isScanning?: boolean;
  /** Existing saved regions to display as overlays */
  savedRegions?: Array<{ id: string; bounds: BoundingBox; name: string }>;
  /** Currently selected saved region ID */
  selectedRegionId?: string;
  /** Called when a saved region is clicked */
  onSavedRegionClick?: (id: string) => void;
  /** Include small water bodies (pools, small ponds) in scanning */
  includeSmallBodies?: boolean;
  /** Show census income overlay on the map */
  showCensusOverlay?: boolean;
  /** Show water body polygons on the map */
  showWaterBodies?: boolean;
  /** Show property type markers on the map */
  showPropertyTypes?: boolean;
  /** Property types map (water body id → property classification) */
  propertyTypesMap?: Map<string, string>;
  /** Called when property types are loaded for water bodies */
  onPropertyTypesLoaded?: (map: Map<string, string>) => void;
  /** Water bodies to look up property types for */
  waterBodiesForPropertyLookup?: WaterBodyResult[];
  /** Pan/zoom the map to this location when set */
  focusLocation?: { lat: number; lng: number; zoom?: number } | null;
}

// ---------------------------------------------------------------------------
// Map styles to hide POIs
// ---------------------------------------------------------------------------

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

// ---------------------------------------------------------------------------
// Census Income Overlay Layer - color-coded wealth demographics
// ---------------------------------------------------------------------------

import { apiGetCensusIncome, apiLookupPropertyByCoords, type CensusTractIncome } from "@/lib/api";

/** Map income to a color on a spectrum from red (low) to green (high). */
function incomeToColor(income: number | null): { fill: string; stroke: string } {
  if (income === null) return { fill: "#9ca3af", stroke: "#6b7280" }; // gray for no data

  // Clamp income between $20k and $150k for color scale
  const min = 20000;
  const max = 150000;
  const t = Math.max(0, Math.min(1, (income - min) / (max - min)));

  // Interpolate from red (0) through yellow (0.5) to green (1)
  let r: number, g: number, b: number;
  if (t < 0.5) {
    // Red → Yellow
    const s = t * 2;
    r = 220;
    g = Math.round(50 + 170 * s);
    b = 50;
  } else {
    // Yellow → Green
    const s = (t - 0.5) * 2;
    r = Math.round(220 - 180 * s);
    g = 220;
    b = Math.round(50 + 50 * s);
  }

  const fill = `rgb(${r},${g},${b})`;
  const stroke = `rgb(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)})`;
  return { fill, stroke };
}

function CensusOverlayLayer({
  tracts,
}: {
  tracts: CensusTractIncome[];
}) {
  const map = useMap();
  const polygonRefs = useRef<google.maps.Polygon[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!map) return;

    // Clear existing
    polygonRefs.current.forEach((p) => p.setMap(null));
    polygonRefs.current = [];
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
    infoWindowRef.current = new google.maps.InfoWindow();

    for (const tract of tracts) {
      if (!tract.geometry) continue;

      const color = incomeToColor(tract.medianIncome);
      let rings: google.maps.LatLng[][] = [];

      if (tract.geometry.type === "Polygon") {
        const coords = tract.geometry.coordinates as number[][][];
        rings = coords.map((ring) =>
          ring.map(([lng, lat]) => new google.maps.LatLng(lat, lng))
        );
      } else if (tract.geometry.type === "MultiPolygon") {
        const coords = tract.geometry.coordinates as number[][][][];
        const firstPoly = coords[0];
        if (firstPoly) {
          rings = firstPoly.map((ring) =>
            ring.map(([lng, lat]) => new google.maps.LatLng(lat, lng))
          );
        }
      }

      if (rings.length === 0) continue;

      const polygon = new google.maps.Polygon({
        paths: rings,
        fillColor: color.fill,
        fillOpacity: 0.35,
        strokeColor: color.stroke,
        strokeWeight: 1,
        map,
        clickable: true,
        zIndex: 1,
      });

      // Click to show info
      polygon.addListener("click", (e: google.maps.MapMouseEvent) => {
        const incomeStr = tract.medianIncome
          ? `$${tract.medianIncome.toLocaleString()}`
          : "No data";
        infoWindowRef.current?.setContent(
          `<div style="font-family: sans-serif; font-size: 13px; max-width: 220px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${tract.name}</div>
            <div style="color: #666;">Median Household Income</div>
            <div style="font-size: 18px; font-weight: 700; color: ${color.fill};">${incomeStr}</div>
            <div style="color: #999; font-size: 11px; margin-top: 4px;">GEOID: ${tract.geoid}</div>
          </div>`
        );
        infoWindowRef.current?.setPosition(e.latLng);
        infoWindowRef.current?.open(map);
      });

      // Hover
      polygon.addListener("mouseover", () => {
        polygon.setOptions({ fillOpacity: 0.55, strokeWeight: 2 });
      });
      polygon.addListener("mouseout", () => {
        polygon.setOptions({ fillOpacity: 0.35, strokeWeight: 1 });
      });

      polygonRefs.current.push(polygon);
    }

    return () => {
      polygonRefs.current.forEach((p) => p.setMap(null));
      polygonRefs.current = [];
      if (infoWindowRef.current) infoWindowRef.current.close();
    };
  }, [map, tracts]);

  return null;
}

// ---------------------------------------------------------------------------
// Property Type Overlay Layer - shows business vs. residential markers
// ---------------------------------------------------------------------------

function PropertyTypeOverlayLayer({
  waterBodies,
  propertyTypesMap,
  onPropertyTypesLoaded,
}: {
  waterBodies: WaterBodyResult[];
  propertyTypesMap: Map<string, string>;
  onPropertyTypesLoaded?: (map: Map<string, string>) => void;
}) {
  const map = useMap();
  const markerRefs = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const lookedUpRef = useRef<Set<string>>(new Set());

  // Look up property types for water bodies that haven't been looked up yet
  useEffect(() => {
    if (!waterBodies.length) return;

    const toLookup = waterBodies.filter(
      (wb) => !propertyTypesMap.has(wb.id) && !lookedUpRef.current.has(wb.id)
    );

    if (toLookup.length === 0) return;

    // Mark as in-progress to avoid duplicate lookups
    toLookup.forEach((wb) => lookedUpRef.current.add(wb.id));

    // Batch lookup — process up to 10 at a time with delays to avoid slamming the API
    const batchSize = 5;
    const newMap = new Map(propertyTypesMap);
    let changed = false;

    async function lookupBatch(batch: WaterBodyResult[]) {
      const results = await Promise.allSettled(
        batch.map(async (wb) => {
          try {
            const res = await apiLookupPropertyByCoords({
              latitude: wb.center.lat,
              longitude: wb.center.lng,
            });
            if (res.data) {
              const propType = classifyPropertyType(res.data);
              newMap.set(wb.id, propType);
              changed = true;
            } else {
              newMap.set(wb.id, "unknown");
              changed = true;
            }
          } catch {
            newMap.set(wb.id, "unknown");
            changed = true;
          }
        })
      );
    }

    async function processAll() {
      for (let i = 0; i < toLookup.length; i += batchSize) {
        const batch = toLookup.slice(i, i + batchSize);
        await lookupBatch(batch);
        // Brief delay between batches
        if (i + batchSize < toLookup.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (changed) {
        onPropertyTypesLoaded?.(new Map(newMap));
      }
    }

    processAll();
  }, [waterBodies, propertyTypesMap, onPropertyTypesLoaded]);

  // Render markers on map
  useEffect(() => {
    if (!map) return;

    // Clear existing
    markerRefs.current.forEach((m) => m.setMap(null));
    markerRefs.current = [];
    if (infoWindowRef.current) infoWindowRef.current.close();
    infoWindowRef.current = new google.maps.InfoWindow();

    for (const wb of waterBodies) {
      const propType = propertyTypesMap.get(wb.id);
      if (!propType || propType === "unknown") continue;

      const isBusinessCommercial =
        propType === "commercial" || propType === "business" || propType === "industrial";
      const color = isBusinessCommercial ? "#ef4444" : "#22c55e"; // red vs green
      const label = isBusinessCommercial ? "B" : "R";
      const title = isBusinessCommercial
        ? `Business/Commercial Property`
        : `Residential/Private Property`;

      const marker = new google.maps.Marker({
        position: { lat: wb.center.lat, lng: wb.center.lng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#fff",
          strokeWeight: 2,
          scale: 10,
        },
        label: {
          text: label,
          color: "#fff",
          fontSize: "10px",
          fontWeight: "bold",
        },
        title,
        zIndex: 10,
      });

      marker.addListener("click", () => {
        infoWindowRef.current?.setContent(
          `<div style="font-family: sans-serif; font-size: 13px; max-width: 220px;">
            <div style="font-weight: 600; margin-bottom: 4px; color: ${color};">${title}</div>
            <div style="color: #666;">${wb.name || wb.type}</div>
            <div style="font-size: 11px; color: #999; margin-top: 4px;">
              Classification: ${propType.charAt(0).toUpperCase() + propType.slice(1)}
            </div>
          </div>`
        );
        infoWindowRef.current?.open(map, marker);
      });

      markerRefs.current.push(marker);
    }

    return () => {
      markerRefs.current.forEach((m) => m.setMap(null));
      markerRefs.current = [];
      if (infoWindowRef.current) infoWindowRef.current.close();
    };
  }, [map, waterBodies, propertyTypesMap]);

  return null;
}

/** Classify a property owner's property type into broad categories. */
function classifyPropertyType(owner: any): string {
  const propType = (owner.propertyType || "").toLowerCase();
  if (
    propType.includes("commercial") ||
    propType.includes("business") ||
    propType.includes("office") ||
    propType.includes("retail") ||
    propType.includes("industrial") ||
    propType.includes("warehouse")
  ) {
    return "commercial";
  }
  if (
    propType.includes("residential") ||
    propType.includes("single") ||
    propType.includes("multi") ||
    propType.includes("condo") ||
    propType.includes("apartment") ||
    propType.includes("house") ||
    propType.includes("dwelling") ||
    propType.includes("family")
  ) {
    return "residential";
  }
  if (propType.includes("agricultural") || propType.includes("farm") || propType.includes("ranch")) {
    return "agricultural";
  }
  if (propType.includes("vacant") || propType.includes("land")) {
    return "vacant";
  }
  if (propType) {
    return propType; // return raw type if not classified
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Water Body Layer - renders detected water bodies
// ---------------------------------------------------------------------------

function WaterBodyLayer({
  waterBodies,
  onWaterBodyClick,
}: {
  waterBodies: WaterBodyResult[];
  onWaterBodyClick?: (waterBody: WaterBodyResult) => void;
}) {
  const map = useMap();
  const polygonRefs = useRef<google.maps.Polygon[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear existing polygons
    polygonRefs.current.forEach((p) => p.setMap(null));
    polygonRefs.current = [];

    // Create new polygons for each water body
    waterBodies.forEach((wb) => {
      const paths = wb.coordinates[0].map(
        ([lng, lat]) => new google.maps.LatLng(lat, lng)
      );

      // Color based on type
      const colors: Record<string, { fill: string; stroke: string }> = {
        pond: { fill: "#3b82f6", stroke: "#1d4ed8" },
        lake: { fill: "#0ea5e9", stroke: "#0284c7" },
        reservoir: { fill: "#6366f1", stroke: "#4f46e5" },
        basin: { fill: "#8b5cf6", stroke: "#7c3aed" },
        wetland: { fill: "#22c55e", stroke: "#16a34a" },
        pool: { fill: "#f59e0b", stroke: "#d97706" },
        water: { fill: "#06b6d4", stroke: "#0891b2" },
      };
      const color = colors[wb.type] || colors.water;

      const polygon = new google.maps.Polygon({
        paths,
        fillColor: color.fill,
        fillOpacity: 0.5,
        strokeColor: color.stroke,
        strokeWeight: 2,
        map,
        clickable: true,
      });

      polygon.addListener("click", () => {
        onWaterBodyClick?.(wb);
      });

      // Hover effect
      polygon.addListener("mouseover", () => {
        polygon.setOptions({ fillOpacity: 0.7, strokeWeight: 3 });
      });
      polygon.addListener("mouseout", () => {
        polygon.setOptions({ fillOpacity: 0.5, strokeWeight: 2 });
      });

      polygonRefs.current.push(polygon);
    });

    return () => {
      polygonRefs.current.forEach((p) => p.setMap(null));
      polygonRefs.current = [];
    };
  }, [map, waterBodies, onWaterBodyClick]);

  return null;
}

// ---------------------------------------------------------------------------
// Saved Regions Layer - shows saved region overlays
// ---------------------------------------------------------------------------

function SavedRegionsLayer({
  regions,
  selectedId,
  onRegionClick,
}: {
  regions: Array<{ id: string; bounds: BoundingBox; name: string }>;
  selectedId?: string;
  onRegionClick?: (id: string) => void;
}) {
  const map = useMap();
  const rectRefs = useRef<google.maps.Rectangle[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear existing rectangles
    rectRefs.current.forEach((r) => r.setMap(null));
    rectRefs.current = [];

    // Create rectangles for each saved region
    regions.forEach((region) => {
      const isSelected = region.id === selectedId;

      const rect = new google.maps.Rectangle({
        bounds: {
          north: region.bounds.north,
          south: region.bounds.south,
          east: region.bounds.east,
          west: region.bounds.west,
        },
        fillColor: isSelected ? "#f59e0b" : "#6366f1",
        fillOpacity: isSelected ? 0.15 : 0.08,
        strokeColor: isSelected ? "#d97706" : "#4f46e5",
        strokeWeight: isSelected ? 3 : 2,
        strokeOpacity: isSelected ? 1 : 0.6,
        map,
        clickable: true,
      });

      rect.addListener("click", () => {
        onRegionClick?.(region.id);
      });

      rectRefs.current.push(rect);
    });

    return () => {
      rectRefs.current.forEach((r) => r.setMap(null));
      rectRefs.current = [];
    };
  }, [map, regions, selectedId, onRegionClick]);

  return null;
}

// ---------------------------------------------------------------------------
// Region Drawing Layer - rectangle drawing for region selection
// ---------------------------------------------------------------------------

function RegionDrawingLayer({
  enabled,
  onRegionDrawn,
}: {
  enabled?: boolean;
  onRegionDrawn?: (region: DrawnRegion) => void;
}) {
  const map = useMap();
  const drawing = useMapsLibrary("drawing");
  const managerRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  const setupManager = useCallback(() => {
    if (!map || !drawing || managerRef.current) return;

    const manager = new drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      rectangleOptions: {
        fillColor: "#f59e0b",
        fillOpacity: 0.2,
        strokeWeight: 3,
        strokeColor: "#d97706",
        editable: false,
        draggable: false,
      },
    });

    manager.setMap(map);
    managerRef.current = manager;

    google.maps.event.addListener(
      manager,
      "rectanglecomplete",
      (rectangle: google.maps.Rectangle) => {
        const bounds = rectangle.getBounds();
        if (!bounds) {
          rectangle.setMap(null);
          return;
        }

        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        // Calculate area
        const latDiff = ne.lat() - sw.lat();
        const lngDiff = ne.lng() - sw.lng();
        const metersPerDegreeLat = 111320;
        const centerLat = (ne.lat() + sw.lat()) / 2;
        const metersPerDegreeLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
        const area = (latDiff * metersPerDegreeLat) * (lngDiff * metersPerDegreeLng);

        const region: DrawnRegion = {
          bounds: {
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          },
          center: {
            lat: (ne.lat() + sw.lat()) / 2,
            lng: (ne.lng() + sw.lng()) / 2,
          },
          area,
        };

        rectangle.setMap(null);
        manager.setDrawingMode(null);
        onRegionDrawn?.(region);
      }
    );
  }, [map, drawing, onRegionDrawn]);

  useEffect(() => {
    setupManager();
  }, [setupManager]);

  // Toggle drawing mode
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.setDrawingMode(
        enabled ? google.maps.drawing.OverlayType.RECTANGLE : null
      );
    }
  }, [enabled]);

  return null;
}

// ---------------------------------------------------------------------------
// Scan Region Overlay - shows the active scan region
// ---------------------------------------------------------------------------

function ScanRegionOverlay({ region }: { region: BoundingBox }) {
  const map = useMap();
  const rectRef = useRef<google.maps.Rectangle | null>(null);

  useEffect(() => {
    if (!map) return;

    // Remove existing rectangle
    if (rectRef.current) {
      rectRef.current.setMap(null);
    }

    // Create new rectangle
    rectRef.current = new google.maps.Rectangle({
      bounds: {
        north: region.north,
        south: region.south,
        east: region.east,
        west: region.west,
      },
      fillColor: "#22c55e",
      fillOpacity: 0.1,
      strokeColor: "#16a34a",
      strokeWeight: 3,
      strokeOpacity: 1,
      map,
      clickable: false,
    });

    return () => {
      if (rectRef.current) {
        rectRef.current.setMap(null);
        rectRef.current = null;
      }
    };
  }, [map, region]);

  return null;
}

// ---------------------------------------------------------------------------
// Map Scanner - detects water bodies within scan region
// ---------------------------------------------------------------------------

function MapScanner({
  scanRegion,
  isScanning,
  onWaterBodiesDetected,
  includeSmall = false,
}: {
  scanRegion: BoundingBox;
  isScanning: boolean;
  onWaterBodiesDetected?: (waterBodies: WaterBodyResult[]) => void;
  includeSmall?: boolean;
}) {
  const hasScanned = useRef(false);

  useEffect(() => {
    if (!isScanning || hasScanned.current) return;

    hasScanned.current = true;
    console.log("[MapScanner] Scanning region:", scanRegion, "includeSmall:", includeSmall);

    fetchWaterBodiesDebounced(
      scanRegion,
      (results) => {
        console.log("[MapScanner] Found", results.length, "water bodies");
        onWaterBodiesDetected?.(results);
      },
      500,
      includeSmall
    );

    return () => {
      hasScanned.current = false;
    };
  }, [scanRegion, isScanning, onWaterBodiesDetected]);

  return null;
}

// ---------------------------------------------------------------------------
// Map Focuser - pans/zooms map to a target location
// ---------------------------------------------------------------------------

function MapFocuser({
  location,
}: {
  location: { lat: number; lng: number; zoom?: number } | null;
}) {
  const map = useMap();
  const lastLocationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !location) return;

    // Deduplicate — don't re-pan to the same spot
    const key = `${location.lat},${location.lng},${location.zoom ?? ""}`;
    if (lastLocationRef.current === key) return;
    lastLocationRef.current = key;

    map.panTo({ lat: location.lat, lng: location.lng });
    if (location.zoom) {
      map.setZoom(location.zoom);
    }
  }, [map, location]);

  return null;
}

// ---------------------------------------------------------------------------
// Map Initializer - applies styles and map type
// ---------------------------------------------------------------------------

function MapInitializer() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Set to satellite/hybrid view
    map.setMapTypeId(google.maps.MapTypeId.HYBRID);

    // Apply custom styles to hide POIs
    map.setOptions({
      styles: MAP_STYLES,
    });
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// Main MapView component
// ---------------------------------------------------------------------------

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_ZOOM = 5;

export default function MapView({
  apiKey,
  initialCenter,
  initialZoom,
  onRegionDrawn,
  regionDrawingEnabled,
  onWaterBodyClick,
  onWaterBodiesDetected,
  scanRegion,
  isScanning,
  savedRegions = [],
  selectedRegionId,
  onSavedRegionClick,
  includeSmallBodies = false,
  showCensusOverlay = false,
  showWaterBodies = true,
  showPropertyTypes = false,
  propertyTypesMap = new Map<string, string>(),
  onPropertyTypesLoaded,
  waterBodiesForPropertyLookup = [],
  focusLocation = null,
}: MapViewProps) {
  const [mapReady, setMapReady] = useState(false);
  const [waterBodies, setWaterBodies] = useState<WaterBodyResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [authError, setAuthError] = useState(false);
  const [censusTracts, setCensusTracts] = useState<CensusTractIncome[]>([]);
  const [censusLoading, setCensusLoading] = useState(false);
  const [censusError, setCensusError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const center = initialCenter || DEFAULT_CENTER;
  const zoom = initialZoom || DEFAULT_ZOOM;

  // Detect Google Maps auth failure via global callback + DOM mutation observer
  useEffect(() => {
    // Google fires window.gm_authFailure on key errors
    (window as any).gm_authFailure = () => setAuthError(true);

    // Also watch for the error overlay DOM element Google injects
    const observer = new MutationObserver(() => {
      const container = mapContainerRef.current;
      if (!container) return;
      const errOverlay = container.querySelector(".gm-err-container");
      if (errOverlay) {
        (errOverlay as HTMLElement).style.display = "none";
        setAuthError(true);
      }
    });

    if (mapContainerRef.current) {
      observer.observe(mapContainerRef.current, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      delete (window as any).gm_authFailure;
    };
  }, [apiKey]);

  // Check rate limit status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isApiRateLimited()) {
        setRateLimitCountdown(getRateLimitResetIn());
      } else {
        setRateLimitCountdown(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleWaterBodiesDetected = useCallback(
    (bodies: WaterBodyResult[]) => {
      setWaterBodies(bodies);
      setIsLoading(false);
      onWaterBodiesDetected?.(bodies);
    },
    [onWaterBodiesDetected]
  );

  // Show loading when scanning starts
  useEffect(() => {
    if (isScanning && scanRegion) {
      setIsLoading(true);
    }
  }, [isScanning, scanRegion]);

  // Fetch census data when overlay is enabled and we have a scan region
  useEffect(() => {
    if (!showCensusOverlay || !scanRegion) {
      setCensusTracts([]);
      setCensusError(null);
      return;
    }

    let cancelled = false;
    setCensusLoading(true);
    setCensusError(null);

    apiGetCensusIncome(scanRegion)
      .then((res) => {
        if (!cancelled && res.data) {
          setCensusTracts(res.data);
          if (res.data.length === 0) {
            setCensusError("No demographic data available for this area.");
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[Census] Failed to load demographics:", err);
          setCensusTracts([]);
          setCensusError(err.message || "Failed to load demographics data.");
        }
      })
      .finally(() => {
        if (!cancelled) setCensusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showCensusOverlay, scanRegion]);

  if (!apiKey) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-500 text-sm">
        <div className="text-center">
          <p className="text-lg mb-2">🗺️ Google Maps API key not set</p>
          <p>Set your Google Maps API key in Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative" ref={mapContainerRef}>
      <APIProvider apiKey={apiKey} libraries={["drawing", "geometry", "places"]}>
        <GoogleMap
          defaultCenter={center}
          defaultZoom={zoom}
          mapId="pond-finder-map"
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="w-full h-full"
          onTilesLoaded={() => setMapReady(true)}
          mapTypeId="hybrid"
        >
          {mapReady && (
            <>
              <MapInitializer />
              <MapFocuser location={focusLocation} />
              <RegionDrawingLayer
                enabled={regionDrawingEnabled}
                onRegionDrawn={onRegionDrawn}
              />
              <SavedRegionsLayer
                regions={savedRegions}
                selectedId={selectedRegionId}
                onRegionClick={onSavedRegionClick}
              />
              {scanRegion && (
                <>
                  <ScanRegionOverlay region={scanRegion} />
                  {isScanning && (
                    <MapScanner
                      scanRegion={scanRegion}
                      isScanning={isScanning}
                      onWaterBodiesDetected={handleWaterBodiesDetected}
                      includeSmall={includeSmallBodies}
                    />
                  )}
                </>
              )}
              {/* Census income overlay (rendered below water bodies) */}
              {showCensusOverlay && censusTracts.length > 0 && (
                <CensusOverlayLayer tracts={censusTracts} />
              )}
              {/* Property type overlay (business vs residential markers) */}
              {showPropertyTypes && waterBodiesForPropertyLookup.length > 0 && (
                <PropertyTypeOverlayLayer
                  waterBodies={waterBodiesForPropertyLookup}
                  propertyTypesMap={propertyTypesMap}
                  onPropertyTypesLoaded={onPropertyTypesLoaded}
                />
              )}
              {/* Water body polygons */}
              {showWaterBodies && (
                <WaterBodyLayer
                  waterBodies={waterBodies}
                  onWaterBodyClick={onWaterBodyClick}
                />
              )}
            </>
          )}
        </GoogleMap>
      </APIProvider>

      {/* Auth failure banner */}
      {authError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-lg font-medium text-white mb-2">Google Maps API Key Error</p>
            <p className="text-gray-300 text-sm">
              The API key is invalid or has restrictions preventing it from loading.
              Check that the Maps JavaScript API is enabled and the key has no referrer restrictions blocking localhost.
            </p>
          </div>
        </div>
      )}

      {/* Drawing mode indicator */}
      {regionDrawingEnabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
          </svg>
          Click and drag to draw a search region
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && !rateLimitCountdown && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg text-sm text-gray-600 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Scanning for water bodies...
        </div>
      )}

      {/* Rate limit warning */}
      {rateLimitCountdown > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-100 border border-amber-300 px-4 py-2 rounded-lg shadow-lg text-sm text-amber-800 flex items-center gap-2">
          <span>⏳</span>
          API rate limited. Retry in {rateLimitCountdown}s
        </div>
      )}

      {/* Water body count */}
      {!isLoading && !rateLimitCountdown && !regionDrawingEnabled && waterBodies.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg text-sm text-gray-600">
          🌊 {waterBodies.length} water {waterBodies.length === 1 ? "body" : "bodies"} found
        </div>
      )}

      {/* Instructions when no region selected */}
      {mapReady && !scanRegion && !regionDrawingEnabled && waterBodies.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
          Draw a region to start scanning for water bodies
        </div>
      )}

      {/* Census overlay loading indicator */}
      {censusLoading && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-purple-100 border border-purple-300 px-4 py-2 rounded-lg shadow-lg text-sm text-purple-800 flex items-center gap-2 z-10">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          Loading wealth demographics...
        </div>
      )}

      {/* Census overlay error */}
      {censusError && !censusLoading && showCensusOverlay && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-red-100 border border-red-300 px-4 py-2 rounded-lg shadow-lg text-sm text-red-800 flex items-center gap-2 z-10">
          <span>⚠️</span>
          {censusError}
        </div>
      )}

      {/* Census income legend */}
      {showCensusOverlay && censusTracts.length > 0 && !censusLoading && (
        <div className="absolute bottom-4 right-4 bg-white/95 rounded-lg shadow-lg p-3 text-xs z-10">
          <div className="font-semibold text-gray-700 mb-2">Median Household Income</div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded" style={{ backgroundColor: "rgb(220,50,50)" }} />
              <span className="text-gray-600">&lt; $20k</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded" style={{ backgroundColor: "rgb(220,135,50)" }} />
              <span className="text-gray-600">$40k</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded" style={{ backgroundColor: "rgb(220,220,50)" }} />
              <span className="text-gray-600">$80k</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded" style={{ backgroundColor: "rgb(130,220,75)" }} />
              <span className="text-gray-600">$120k</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded" style={{ backgroundColor: "rgb(40,220,100)" }} />
              <span className="text-gray-600">&gt; $150k</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded" style={{ backgroundColor: "rgb(156,163,175)" }} />
              <span className="text-gray-600">No data</span>
            </div>
          </div>
          <div className="text-gray-400 mt-2">{censusTracts.length} tracts · Click for details</div>
        </div>
      )}

      {/* Property type legend */}
      {showPropertyTypes && propertyTypesMap.size > 0 && (
        <div
          className={`absolute ${
            showCensusOverlay && censusTracts.length > 0 ? "bottom-48" : "bottom-4"
          } right-4 bg-white/95 rounded-lg shadow-lg p-3 text-xs z-10`}
        >
          <div className="font-semibold text-gray-700 mb-2">Property Classification</div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded-full" style={{ backgroundColor: "#ef4444" }} />
              <span className="text-gray-600">Business / Commercial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
              <span className="text-gray-600">Residential / Private</span>
            </div>
          </div>
          <div className="text-gray-400 mt-2">
            {propertyTypesMap.size} properties classified
          </div>
        </div>
      )}
    </div>
  );
}
