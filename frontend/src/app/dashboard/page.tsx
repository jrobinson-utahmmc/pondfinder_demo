"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRequireAuth } from "@/lib/auth";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import type { OverlayConfig, MapTheme } from "@/components/Sidebar";
import SettingsPanel from "@/components/SettingsPanel";
import WaterBodyDetailModal from "@/components/WaterBodyDetailModal";
import type { WaterBodyResult, BoundingBox } from "@/lib/overpass";
import type { DrawnRegion } from "@/components/MapView";
import type { SavedRegion } from "@/lib/savedRegions";
import { getSavedRegions, updateRegion } from "@/lib/savedRegions";
import { apiGetMapsKey, apiLookupPropertyByCoords } from "@/lib/api";
import type { PropertyOwner } from "@/types";

// Dynamic import for MapView to avoid SSR issues with Google Maps
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-900 text-gray-400 text-sm">
      Loading map...
    </div>
  ),
});

export default function DashboardPage() {
  const user = useRequireAuth();

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);

  // Sidebar visibility (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Google Maps API key (fetched from backend)
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);

  // Region state
  const [isDrawingRegion, setIsDrawingRegion] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<DrawnRegion | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [savedRegionsKey, setSavedRegionsKey] = useState(0);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [scanRegion, setScanRegion] = useState<BoundingBox | null>(null);

  // Water bodies state
  const [waterBodies, setWaterBodies] = useState<WaterBodyResult[]>([]);
  const [isLoadingWaterBodies, setIsLoadingWaterBodies] = useState(false);
  const [selectedWaterBody, setSelectedWaterBody] = useState<WaterBodyResult | null>(null);

  // Map focus state — set to zoom into a water body
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Overlay configuration (unified — managed from Layers tab)
  const [overlays, setOverlays] = useState<OverlayConfig>({
    waterBodies: true,
    censusIncome: false,
    savedRegions: true,
    propertyTypes: false,
    includeSmallBodies: false,
    mapTheme: "hybrid",
    showLabels: true,
    showRoads: true,
  });

  // Sort field for results
  const [sortField, setSortField] = useState("name");

  // Property owner state
  const [propertyOwner, setPropertyOwner] = useState<PropertyOwner | null>(null);
  const [isLookingUpOwner, setIsLookingUpOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Property types map (water body id → property classification)
  const [propertyTypesMap, setPropertyTypesMap] = useState<Map<string, string>>(new Map());

  // Get saved regions for map overlay
  const [savedRegions, setSavedRegions] = useState<SavedRegion[]>([]);

  useEffect(() => {
    setSavedRegions(getSavedRegions());
  }, [savedRegionsKey]);

  // Fetch Google Maps API key from backend
  const fetchMapsKey = useCallback(() => {
    apiGetMapsKey()
      .then((res) => setMapsApiKey(res.data?.googleMapsApiKey || ""))
      .catch(() => setMapsApiKey(""));
  }, []);

  useEffect(() => {
    fetchMapsKey();
  }, [fetchMapsKey]);

  // Handle region drawing
  const handleStartDrawing = useCallback(() => {
    setIsDrawingRegion(true);
    setWaterBodies([]);
    setSelectedRegionId(null);
  }, []);

  const handleRegionDrawn = useCallback((region: DrawnRegion) => {
    setIsDrawingRegion(false);
    setCurrentRegion(region);
    setScanRegion(region.bounds);
    setIsScanning(true);
    setIsLoadingWaterBodies(true);
  }, []);

  // Handle water bodies detection
  const handleWaterBodiesDetected = useCallback((bodies: WaterBodyResult[]) => {
    setWaterBodies(bodies);
    setIsLoadingWaterBodies(false);
    setIsScanning(false);
  }, []);

  const handleWaterBodyClick = useCallback((waterBody: WaterBodyResult) => {
    setSelectedWaterBody(waterBody);
  }, []);

  const handleSelectFromSidebar = useCallback((waterBody: WaterBodyResult) => {
    setSelectedWaterBody(waterBody);
    // Zoom into the water body — pick zoom level based on area
    const area = waterBody.area || 0;
    let zoom = 18;
    if (area > 50000) zoom = 14;
    else if (area > 10000) zoom = 15;
    else if (area > 2000) zoom = 16;
    else if (area > 500) zoom = 17;
    setFocusLocation({ lat: waterBody.center.lat, lng: waterBody.center.lng, zoom });
  }, []);

  const handleFindOwner = useCallback(async (waterBody: WaterBodyResult) => {
    setOwnerError(null);
    setPropertyOwner(null);
    setIsLookingUpOwner(true);
    try {
      const res = await apiLookupPropertyByCoords({
        latitude: waterBody.center.lat,
        longitude: waterBody.center.lng,
      });
      if (res.data) {
        setPropertyOwner(res.data);
      } else {
        setOwnerError("No property information found for this location.");
      }
    } catch (err: any) {
      setOwnerError(err.message || "Property owner lookup failed.");
    } finally {
      setIsLookingUpOwner(false);
    }
  }, []);

  // Handle saved region selection
  const handleSelectSavedRegion = useCallback((region: SavedRegion) => {
    setSelectedRegionId(region.id);
    setCurrentRegion({
      bounds: region.bounds,
      center: region.center,
      area: region.area,
    });
    setScanRegion(region.bounds);
    setIsScanning(true);
    setIsLoadingWaterBodies(true);
  }, []);

  // Handle clicking saved region on map
  const handleSavedRegionClick = useCallback(
    (id: string) => {
      const region = savedRegions.find((r) => r.id === id);
      if (region) {
        handleSelectSavedRegion(region);
      }
    },
    [savedRegions, handleSelectSavedRegion]
  );

  // Handle overlay toggle from Layers tab
  const handleToggleOverlay = useCallback(
    (key: keyof OverlayConfig, value: boolean | string) => {
      setOverlays((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Sorted water bodies for results tab
  const sortedWaterBodies = useMemo(() => {
    const sorted = [...waterBodies];
    switch (sortField) {
      case "name":
        sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "area-desc":
        sorted.sort((a, b) => (b.area || 0) - (a.area || 0));
        break;
      case "area-asc":
        sorted.sort((a, b) => (a.area || 0) - (b.area || 0));
        break;
      case "type":
        sorted.sort((a, b) => a.type.localeCompare(b.type));
        break;
      case "property": {
        // Sort by property type: business first, then residential, then unknown
        const order = (id: string) => {
          const pt = propertyTypesMap.get(id) || "";
          if (pt.toLowerCase().includes("commercial") || pt.toLowerCase().includes("business")) return 0;
          if (pt.toLowerCase().includes("residential") || pt.toLowerCase().includes("private")) return 1;
          return 2;
        };
        sorted.sort((a, b) => order(a.id) - order(b.id));
        break;
      }
    }
    return sorted;
  }, [waterBodies, sortField, propertyTypesMap]);

  // Update saved region water body count after scan
  useEffect(() => {
    if (selectedRegionId && waterBodies.length > 0 && !isLoadingWaterBodies) {
      updateRegion(selectedRegionId, { waterBodyCount: waterBodies.length });
      setSavedRegionsKey((k) => k + 1);
    }
  }, [selectedRegionId, waterBodies.length, isLoadingWaterBodies]);

  // Show nothing until auth is confirmed
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-400">
        Checking authentication...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Navbar onOpenSettings={() => setShowSettings(true)} onToggleSidebar={() => setSidebarOpen((v) => !v)} />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — slide-over on mobile, fixed on desktop */}
        <div
          className={`
            fixed inset-y-0 left-0 z-40 w-80 transform transition-transform duration-200 ease-in-out
            md:relative md:translate-x-0 md:z-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <Sidebar
          waterBodies={sortedWaterBodies}
          isLoading={isLoadingWaterBodies}
          onSelectWaterBody={handleSelectFromSidebar}
          onFindOwner={handleFindOwner}
          selectedWaterBodyId={selectedWaterBody?.id}
          onDrawRegion={handleStartDrawing}
          isDrawingRegion={isDrawingRegion}
          onSelectRegion={handleSelectSavedRegion}
          currentRegion={currentRegion}
          selectedRegionId={selectedRegionId || undefined}
          refreshRegionsKey={savedRegionsKey}
          overlays={overlays}
          onToggleOverlay={handleToggleOverlay}
          sortField={sortField}
          onSortChange={setSortField}
          propertyTypes={propertyTypesMap}
        />
        </div>

        {/* Map */}
        {mapsApiKey === null ? (
          <div className="flex-1 flex items-center justify-center bg-gray-900 text-gray-400 text-sm">
            Loading map...
          </div>
        ) : mapsApiKey === "" ? (
          <div className="flex-1 flex items-center justify-center bg-gray-900 text-gray-300">
            <div className="text-center max-w-sm">
              <div className="text-4xl mb-3">🗺️</div>
              <p className="text-lg font-medium mb-2">Google Maps API Key Required</p>
              <p className="text-gray-400 text-sm mb-4">
                Set your Google Maps API key in the Settings panel to enable the map.
              </p>
              {user.role === "admin" && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Open Settings
                </button>
              )}
            </div>
          </div>
        ) : (
          <MapView
            apiKey={mapsApiKey}
            initialZoom={5}
            regionDrawingEnabled={isDrawingRegion}
            onRegionDrawn={handleRegionDrawn}
            onWaterBodyClick={handleWaterBodyClick}
            onWaterBodiesDetected={handleWaterBodiesDetected}
            scanRegion={scanRegion}
            isScanning={isScanning}
            savedRegions={
              overlays.savedRegions
                ? savedRegions.map((r) => ({
                    id: r.id,
                    bounds: r.bounds,
                    name: r.name,
                  }))
                : []
            }
            selectedRegionId={selectedRegionId || undefined}
            onSavedRegionClick={handleSavedRegionClick}
            includeSmallBodies={overlays.includeSmallBodies}
            showCensusOverlay={overlays.censusIncome}
            showWaterBodies={overlays.waterBodies}
            showPropertyTypes={overlays.propertyTypes}
            propertyTypesMap={propertyTypesMap}
            onPropertyTypesLoaded={setPropertyTypesMap}
            focusLocation={focusLocation}
            waterBodiesForPropertyLookup={waterBodies}
            mapTheme={overlays.mapTheme}
            showLabels={overlays.showLabels}
            showRoads={overlays.showRoads}
          />
        )}
      </div>

      {/* Water body detail modal */}
      {selectedWaterBody && (
        <WaterBodyDetailModal
          waterBody={selectedWaterBody}
          onClose={() => {
            setSelectedWaterBody(null);
            setPropertyOwner(null);
            setOwnerError(null);
          }}
          onFindOwner={() => handleFindOwner(selectedWaterBody)}
          propertyOwner={propertyOwner}
          isLookingUpOwner={isLookingUpOwner}
          ownerError={ownerError}
        />
      )}

      {/* Settings panel (admin only) */}
      {showSettings && user && (
        <SettingsPanel
          onClose={() => {
            setShowSettings(false);
            // Re-fetch maps key in case it changed
            fetchMapsKey();
          }}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}
