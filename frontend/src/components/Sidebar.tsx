"use client";

import { useState, useMemo, useEffect } from "react";
import type { WaterBodyResult } from "@/lib/overpass";
import type { BoundingBox } from "@/lib/overpass";
import WaterBodyCard from "./WaterBodyCard";
import {
  getSavedRegions,
  saveRegion,
  deleteRegion,
  renameRegion,
  type SavedRegion,
} from "@/lib/savedRegions";

type TabType = "regions" | "results" | "layers";

/** Map theme options */
export type MapTheme = "hybrid" | "satellite" | "roadmap" | "terrain" | "dark" | "minimal";

/** Overlay configuration for the Layers tab */
export interface OverlayConfig {
  waterBodies: boolean;
  censusIncome: boolean;
  savedRegions: boolean;
  propertyTypes: boolean;
  includeSmallBodies: boolean;
  mapTheme: MapTheme;
  showLabels: boolean;
  showRoads: boolean;
}

interface SidebarProps {
  /** List of detected water bodies */
  waterBodies: WaterBodyResult[];
  /** Loading state for water body detection */
  isLoading?: boolean;
  /** Called when a water body is selected */
  onSelectWaterBody?: (waterBody: WaterBodyResult) => void;
  /** Called when user wants to find owner of a water body */
  onFindOwner?: (waterBody: WaterBodyResult) => void;
  /** Currently selected water body ID */
  selectedWaterBodyId?: string;
  /** Called when user wants to draw a new region */
  onDrawRegion?: () => void;
  /** Whether region drawing is active */
  isDrawingRegion?: boolean;
  /** Called when a saved region is selected to scan */
  onSelectRegion?: (region: SavedRegion) => void;
  /** Called when user wants to save current region */
  onSaveCurrentRegion?: (name: string) => void;
  /** Current scan region (unsaved) */
  currentRegion?: { bounds: BoundingBox; center: { lat: number; lng: number }; area: number } | null;
  /** Currently selected saved region ID */
  selectedRegionId?: string;
  /** Refresh key for saved regions */
  refreshRegionsKey?: number;
  /** Overlay configuration */
  overlays: OverlayConfig;
  /** Called when an overlay is toggled */
  onToggleOverlay?: (key: keyof OverlayConfig, value: boolean) => void;
  /** Sort field for results */
  sortField?: string;
  /** Called when sort field changes */
  onSortChange?: (field: string) => void;
  /** Property type data (if available) for results */
  propertyTypes?: Map<string, string>;
}

export default function Sidebar({
  waterBodies,
  isLoading,
  onSelectWaterBody,
  onFindOwner,
  selectedWaterBodyId,
  onDrawRegion,
  isDrawingRegion,
  onSelectRegion,
  currentRegion,
  selectedRegionId,
  refreshRegionsKey = 0,
  overlays,
  onToggleOverlay,
  sortField = "name",
  onSortChange,
  propertyTypes,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>("regions");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [savedRegions, setSavedRegions] = useState<SavedRegion[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newRegionName, setNewRegionName] = useState("");
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const featureTypes = [
    "pond",
    "lake",
    "reservoir",
    "basin",
    "wetland",
    "water",
  ];

  // Load saved regions
  useEffect(() => {
    setSavedRegions(getSavedRegions());
  }, [refreshRegionsKey]);

  // Switch to results tab when water bodies are detected
  useEffect(() => {
    if (waterBodies.length > 0) {
      setActiveTab("results");
    }
  }, [waterBodies.length]);

  // Filter water bodies based on search and type
  const filteredBodies = useMemo(() => {
    return waterBodies.filter((wb) => {
      const matchesSearch =
        !search ||
        (wb.name?.toLowerCase().includes(search.toLowerCase())) ||
        wb.type.toLowerCase().includes(search.toLowerCase());
      const matchesType = !filterType || wb.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [waterBodies, search, filterType]);

  // Calculate totals
  const totalArea = useMemo(() => {
    const sqMeters = filteredBodies.reduce((sum, wb) => sum + (wb.area || 0), 0);
    return (sqMeters / 4046.86).toFixed(1); // acres
  }, [filteredBodies]);

  // Handle saving current region
  const handleSaveRegion = () => {
    if (!currentRegion || !newRegionName.trim()) return;

    const region = saveRegion({
      name: newRegionName.trim(),
      bounds: currentRegion.bounds,
      center: currentRegion.center,
      area: currentRegion.area,
      waterBodyCount: waterBodies.length,
    });

    setSavedRegions(getSavedRegions());
    setShowSaveDialog(false);
    setNewRegionName("");
  };

  // Handle deleting a region
  const handleDeleteRegion = (id: string) => {
    if (!confirm("Delete this saved region?")) return;
    deleteRegion(id);
    setSavedRegions(getSavedRegions());
  };

  // Handle renaming a region
  const handleRenameRegion = (id: string) => {
    if (!editingName.trim()) return;
    renameRegion(id, editingName.trim());
    setSavedRegions(getSavedRegions());
    setEditingRegionId(null);
    setEditingName("");
  };

  // Format area
  const formatArea = (sqMeters: number) => {
    const acres = sqMeters / 4046.86;
    if (acres < 1) {
      return `${(sqMeters * 10.764).toFixed(0)} sq ft`;
    }
    return `${acres.toFixed(1)} acres`;
  };

  return (
    <aside className="w-full bg-white border-r border-gray-200 flex flex-col shrink-0 h-full overflow-hidden">
      {/* Header with tabs */}
      <div className="border-b border-gray-200 shrink-0">
        <div className="flex">
          <button
            onClick={() => setActiveTab("regions")}
            className={`flex-1 px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "regions"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            📍 <span className="hidden sm:inline">Regions</span>
          </button>
          <button
            onClick={() => setActiveTab("results")}
            className={`flex-1 px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors relative ${
              activeTab === "results"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            🌊 <span className="hidden sm:inline">Results</span>
            {waterBodies.length > 0 && (
              <span className="ml-1.5 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {waterBodies.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("layers")}
            className={`flex-1 px-3 py-3 text-sm font-medium transition-colors ${
              activeTab === "layers"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            🗺️ Layers
          </button>
        </div>
      </div>

      {/* Regions Tab */}
      {activeTab === "regions" && (
        <>
          {/* Draw region button */}
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={onDrawRegion}
              disabled={isDrawingRegion}
              className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                isDrawingRegion
                  ? "bg-amber-500 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isDrawingRegion ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Drawing... (click and drag)
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Draw New Region
                </>
              )}
            </button>

            {/* Save current region */}
            {currentRegion && !showSaveDialog && (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="w-full mt-2 py-2 border border-green-500 text-green-600 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save Current Region
              </button>
            )}

            {/* Save dialog */}
            {showSaveDialog && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="text"
                  value={newRegionName}
                  onChange={(e) => setNewRegionName(e.target.value)}
                  placeholder="Region name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRegion();
                    if (e.key === "Escape") setShowSaveDialog(false);
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    className="flex-1 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveRegion}
                    disabled={!newRegionName.trim()}
                    className="flex-1 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Saved regions list */}
          <div className="flex-1 overflow-y-auto">
            {savedRegions.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <p className="text-2xl mb-2">📍</p>
                <p>No saved regions yet</p>
                <p className="mt-1">Draw a region on the map to get started</p>
              </div>
            ) : (
              savedRegions.map((region) => (
                <div
                  key={region.id}
                  onClick={() => onSelectRegion?.(region)}
                  className={`p-3 border-b border-gray-100 cursor-pointer transition-colors group ${
                    region.id === selectedRegionId
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {editingRegionId === region.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameRegion(region.id);
                          if (e.key === "Escape") setEditingRegionId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameRegion(region.id);
                        }}
                        className="text-green-600 text-sm"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {region.name}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRegionId(region.id);
                              setEditingName(region.name);
                            }}
                            className="text-gray-400 hover:text-blue-500 p-1"
                            title="Rename"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRegion(region.id);
                            }}
                            className="text-gray-400 hover:text-red-500 p-1"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                        <span>{formatArea(region.area)}</span>
                        {region.waterBodyCount !== undefined && (
                          <span>{region.waterBodyCount} water bodies</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(region.createdAt).toLocaleDateString()}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 text-xs text-gray-400 text-center">
            {savedRegions.length} saved region{savedRegions.length !== 1 ? "s" : ""}
          </div>
        </>
      )}

      {/* Results Tab */}
      {activeTab === "results" && (
        <>
          {/* Search & filter */}
          <div className="p-4 border-b border-gray-200 space-y-2">
            <input
              type="text"
              placeholder="Search by name or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Types</option>
                {featureTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <select
                value={sortField}
                onChange={(e) => onSortChange?.(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="name">Sort: Name</option>
                <option value="area-desc">Sort: Area ↓</option>
                <option value="area-asc">Sort: Area ↑</option>
                <option value="type">Sort: Type</option>
                <option value="property">Sort: Property</option>
              </select>
            </div>
          </div>

          {/* Water body list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-4 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Scanning for water bodies...
              </div>
            )}
            {!isLoading && filteredBodies.length === 0 && waterBodies.length === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">
                <p className="text-2xl mb-2">🔍</p>
                <p>No water bodies found</p>
                <p className="mt-1">Draw a region and scan to find water bodies</p>
              </div>
            )}
            {!isLoading && filteredBodies.length === 0 && waterBodies.length > 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">
                <p className="text-2xl mb-2">🔍</p>
                <p>No matches for your filter</p>
                <p className="mt-1">Try a different search or type</p>
              </div>
            )}
            {filteredBodies.map((wb) => (
              <WaterBodyCard
                key={wb.id}
                waterBody={wb}
                onClick={() => onSelectWaterBody?.(wb)}
                onFindOwner={() => onFindOwner?.(wb)}
                isSelected={wb.id === selectedWaterBodyId}
              />
            ))}
          </div>

          {/* Footer stats */}
          <div className="p-3 border-t border-gray-200 text-xs text-gray-500">
            <div className="flex justify-between items-center">
              <span>
                {filteredBodies.length} of {waterBodies.length} water{" "}
                {waterBodies.length === 1 ? "body" : "bodies"}
              </span>
              <span>{totalArea} acres total</span>
            </div>
          </div>
        </>
      )}

      {/* Layers Tab */}
      {activeTab === "layers" && (
        <div className="flex-1 overflow-y-auto">
          {/* Map Theme Section */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Map Style</h3>
            <p className="text-xs text-gray-400 mb-3">Choose a base map appearance</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { value: "hybrid", label: "Hybrid", icon: "🛰️" },
                { value: "satellite", label: "Satellite", icon: "🌍" },
                { value: "roadmap", label: "Road", icon: "🗺️" },
                { value: "terrain", label: "Terrain", icon: "⛰️" },
                { value: "dark", label: "Dark", icon: "🌙" },
                { value: "minimal", label: "Minimal", icon: "✨" },
              ] as const).map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => onToggleOverlay?.("mapTheme" as any, theme.value as any)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-0.5 ${
                    overlays.mapTheme === theme.value
                      ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span className="text-base">{theme.icon}</span>
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          {/* Map Display Options */}
          <LayerToggle
            icon="🏷️"
            label="Map Labels"
            description="Show place names, street names, and other labels"
            color="blue"
            enabled={overlays.showLabels}
            onToggle={() => onToggleOverlay?.("showLabels", !overlays.showLabels)}
          />

          <LayerToggle
            icon="🛣️"
            label="Roads"
            description="Show roads and highways on the map"
            color="blue"
            enabled={overlays.showRoads}
            onToggle={() => onToggleOverlay?.("showRoads", !overlays.showRoads)}
          />

          <div className="px-4 py-2 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Overlays</h3>
          </div>

          {/* Water Bodies overlay */}
          <LayerToggle
            icon="🌊"
            label="Water Bodies"
            description="Show detected water bodies on the map"
            color="blue"
            enabled={overlays.waterBodies}
            onToggle={() => onToggleOverlay?.("waterBodies", !overlays.waterBodies)}
          />

          {/* Small Water Bodies / Pools */}
          <LayerToggle
            icon="🏊"
            label="Pools & Small Ponds"
            description="Include swimming pools, garden ponds, and small water features in scans"
            color="amber"
            enabled={overlays.includeSmallBodies}
            onToggle={() => onToggleOverlay?.("includeSmallBodies", !overlays.includeSmallBodies)}
          />

          {/* Census Income overlay */}
          <LayerToggle
            icon="💰"
            label="Wealth Demographics"
            description="Color-coded median household income by census tract"
            color="purple"
            enabled={overlays.censusIncome}
            onToggle={() => onToggleOverlay?.("censusIncome", !overlays.censusIncome)}
          />

          {/* Property Types overlay */}
          <LayerToggle
            icon="🏢"
            label="Property Classification"
            description="Business vs. residential property type markers"
            color="emerald"
            enabled={overlays.propertyTypes}
            onToggle={() => onToggleOverlay?.("propertyTypes", !overlays.propertyTypes)}
          />

          {/* Saved Regions overlay */}
          <LayerToggle
            icon="📍"
            label="Saved Regions"
            description="Show saved region boundaries on the map"
            color="indigo"
            enabled={overlays.savedRegions}
            onToggle={() => onToggleOverlay?.("savedRegions", !overlays.savedRegions)}
          />

          {/* Active layers summary */}
          <div className="p-4 border-t border-gray-200 mt-auto">
            <div className="text-xs text-gray-400 text-center">
              {[overlays.waterBodies, overlays.censusIncome, overlays.savedRegions, overlays.propertyTypes, overlays.includeSmallBodies].filter(Boolean).length} of 5 data layers active
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// LayerToggle component — reusable toggle for overlay layers
// ---------------------------------------------------------------------------

function LayerToggle({
  icon,
  label,
  description,
  color,
  enabled,
  onToggle,
}: {
  icon: string;
  label: string;
  description: string;
  color: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  const colorClasses: Record<string, { bg: string; ring: string }> = {
    blue: { bg: "bg-blue-500", ring: "ring-blue-200" },
    amber: { bg: "bg-amber-500", ring: "ring-amber-200" },
    purple: { bg: "bg-purple-500", ring: "ring-purple-200" },
    emerald: { bg: "bg-emerald-500", ring: "ring-emerald-200" },
    indigo: { bg: "bg-indigo-500", ring: "ring-indigo-200" },
    red: { bg: "bg-red-500", ring: "ring-red-200" },
  };
  const c = colorClasses[color] || colorClasses.blue;

  return (
    <div
      className={`px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${
        enabled ? "bg-gray-50/50" : ""
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">{icon}</span>
          <div className="min-w-0">
            <span className="text-sm text-gray-700 font-medium">{label}</span>
            <p className="text-xs text-gray-400 leading-tight">{description}</p>
          </div>
        </div>
        <div
          className={`relative inline-flex h-5 w-9 items-center rounded-full shrink-0 transition-colors ${
            enabled ? c.bg : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
