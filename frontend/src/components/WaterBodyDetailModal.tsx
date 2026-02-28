"use client";

import { useState } from "react";
import type { WaterBodyResult } from "@/lib/overpass";
import type { PropertyOwner } from "@/types";

interface WaterBodyDetailModalProps {
  waterBody: WaterBodyResult;
  onClose: () => void;
  onFindOwner?: () => void;
  propertyOwner?: PropertyOwner | null;
  isLookingUpOwner?: boolean;
  ownerError?: string | null;
}

export default function WaterBodyDetailModal({
  waterBody,
  onClose,
  onFindOwner,
  propertyOwner,
  isLookingUpOwner,
  ownerError,
}: WaterBodyDetailModalProps) {
  const [copied, setCopied] = useState(false);

  // Color mapping for water body types
  const typeColors: Record<string, { bg: string; text: string; label: string }> = {
    pond: { bg: "bg-blue-100", text: "text-blue-700", label: "Pond" },
    lake: { bg: "bg-sky-100", text: "text-sky-700", label: "Lake" },
    reservoir: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Reservoir" },
    basin: { bg: "bg-violet-100", text: "text-violet-700", label: "Basin" },
    wetland: { bg: "bg-green-100", text: "text-green-700", label: "Wetland" },
    pool: { bg: "bg-amber-100", text: "text-amber-700", label: "Pool" },
    water: { bg: "bg-cyan-100", text: "text-cyan-700", label: "Water" },
  };

  const typeStyle = typeColors[waterBody.type] || typeColors.water;

  // Format area
  const formatArea = (sqMeters: number) => {
    const acres = sqMeters / 4046.86;
    const sqft = sqMeters * 10.764;
    return {
      acres: acres.toFixed(2),
      sqft: sqft.toFixed(0),
      sqm: sqMeters.toFixed(0),
    };
  };

  const area = waterBody.area ? formatArea(waterBody.area) : null;

  const copyCoordinates = () => {
    const text = `${waterBody.center.lat.toFixed(6)}, ${waterBody.center.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get OpenStreetMap tags for display
  const displayTags = Object.entries(waterBody.tags || {}).filter(
    ([key]) => !["water", "natural", "landuse"].includes(key)
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-xl md:rounded-xl shadow-2xl w-full max-w-md md:mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <span
                className={`text-xs ${typeStyle.bg} ${typeStyle.text} rounded px-2 py-0.5 mb-2 inline-block`}
              >
                {typeStyle.label}
              </span>
              <h2 className="text-xl font-bold mt-1">
                {waterBody.name || "Unnamed Water Body"}
              </h2>
              <p className="text-sm text-white/80 mt-1">
                ID: {waterBody.id}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Area */}
          {area && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Area</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-900">{area.acres}</p>
                  <p className="text-xs text-gray-500">acres</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{Number(area.sqft).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">sq ft</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{Number(area.sqm).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">sq m</p>
                </div>
              </div>
            </div>
          )}

          {/* Coordinates */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Center Coordinates</h3>
              <button
                onClick={copyCoordinates}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-gray-600 font-mono">
              {waterBody.center.lat.toFixed(6)}, {waterBody.center.lng.toFixed(6)}
            </p>
          </div>

          {/* Tags */}
          {displayTags.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Properties</h3>
              <div className="space-y-1">
                {displayTags.map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-500">{key}</span>
                    <span className="text-gray-900">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OpenStreetMap link */}
          <div className="text-center">
            <a
              href={`https://www.openstreetmap.org/${waterBody.id.includes("/") ? waterBody.id : `way/${waterBody.id}`}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View on OpenStreetMap →
            </a>
          </div>

          {/* Property Owner Results */}
          {isLookingUpOwner && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-sm text-amber-700">Looking up property owner...</span>
            </div>
          )}

          {ownerError && !isLookingUpOwner && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{ownerError}</p>
            </div>
          )}

          {propertyOwner && !isLookingUpOwner && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-green-800 flex items-center gap-2">
                <span>🏠</span> Property Owner Found
              </h3>

              {/* Owner name */}
              <div>
                <p className="text-xs text-gray-500">Owner</p>
                <p className="text-sm font-medium text-gray-900">
                  {propertyOwner.companyName ||
                    [propertyOwner.firstName, propertyOwner.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    "N/A"}
                </p>
              </div>

              {/* Property address */}
              {propertyOwner.propertyAddress && (
                <div>
                  <p className="text-xs text-gray-500">Property Address</p>
                  <p className="text-sm text-gray-900">
                    {propertyOwner.propertyAddress.street}
                    <br />
                    {propertyOwner.propertyAddress.city}, {propertyOwner.propertyAddress.state}{" "}
                    {propertyOwner.propertyAddress.zipCode}
                  </p>
                </div>
              )}

              {/* Mailing address (if different) */}
              {propertyOwner.mailingAddress &&
                propertyOwner.mailingAddress.street !==
                  propertyOwner.propertyAddress?.street && (
                  <div>
                    <p className="text-xs text-gray-500">Mailing Address</p>
                    <p className="text-sm text-gray-900">
                      {propertyOwner.mailingAddress.street}
                      <br />
                      {propertyOwner.mailingAddress.city}, {propertyOwner.mailingAddress.state}{" "}
                      {propertyOwner.mailingAddress.zipCode}
                    </p>
                  </div>
                )}

              {/* Property details grid */}
              <div className="grid grid-cols-2 gap-2">
                {propertyOwner.propertyType && (
                  <div>
                    <p className="text-xs text-gray-500">Type</p>
                    <p className="text-sm text-gray-900">{propertyOwner.propertyType}</p>
                  </div>
                )}
                {propertyOwner.parcelId && (
                  <div>
                    <p className="text-xs text-gray-500">Parcel ID</p>
                    <p className="text-sm text-gray-900 font-mono text-xs">{propertyOwner.parcelId}</p>
                  </div>
                )}
                {propertyOwner.lotSizeAcres != null && (
                  <div>
                    <p className="text-xs text-gray-500">Lot Size</p>
                    <p className="text-sm text-gray-900">{propertyOwner.lotSizeAcres} acres</p>
                  </div>
                )}
                {propertyOwner.marketValue != null && (
                  <div>
                    <p className="text-xs text-gray-500">Market Value</p>
                    <p className="text-sm text-gray-900 font-semibold">
                      ${propertyOwner.marketValue.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-200 p-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onFindOwner?.()}
            disabled={isLookingUpOwner}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isLookingUpOwner
                ? "bg-amber-300 text-white cursor-not-allowed"
                : propertyOwner
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            {isLookingUpOwner
              ? "Looking up..."
              : propertyOwner
                ? "🔄 Re-lookup Owner"
                : "🔍 Find Property Owner"}
          </button>
        </div>
      </div>
    </div>
  );
}
