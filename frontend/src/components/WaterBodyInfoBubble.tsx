"use client";

import { useState } from "react";
import type { WaterBodyResult } from "@/lib/overpass";
import type { PropertyOwner } from "@/types";

interface WaterBodyInfoBubbleProps {
  waterBody: WaterBodyResult;
  onClose: () => void;
  onFindOwner?: () => void;
  propertyOwner?: PropertyOwner | null;
  isLookingUpOwner?: boolean;
  ownerError?: string | null;
}

export default function WaterBodyInfoBubble({
  waterBody,
  onClose,
  onFindOwner,
  propertyOwner,
  isLookingUpOwner,
  ownerError,
}: WaterBodyInfoBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    if (acres >= 1) return `${acres.toFixed(1)} acres`;
    const sqft = sqMeters * 10.764;
    return `${Number(sqft.toFixed(0)).toLocaleString()} sq ft`;
  };

  const copyCoordinates = () => {
    const text = `${waterBody.center.lat.toFixed(6)}, ${waterBody.center.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayTags = Object.entries(waterBody.tags || {}).filter(
    ([key]) => !["water", "natural", "landuse"].includes(key)
  );

  const ownerDisplay = propertyOwner
    ? propertyOwner.companyName ||
      [propertyOwner.firstName, propertyOwner.lastName].filter(Boolean).join(" ") ||
      "Unknown"
    : null;

  return (
    <>
      {/* ---- Mobile bottom-sheet ---- */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 max-h-[60vh] flex flex-col">
          {/* Drag handle */}
          <button
            className="flex justify-center pt-2 pb-1 w-full"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </button>

          {/* Compact header */}
          <div className="px-4 pb-2 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] ${typeStyle.bg} ${typeStyle.text} rounded px-1.5 py-0.5 font-medium`}>
                  {typeStyle.label}
                </span>
                {waterBody.area ? (
                  <span className="text-xs text-gray-400">{formatArea(waterBody.area)}</span>
                ) : null}
              </div>
              <h3 className="font-semibold text-gray-900 text-sm truncate">
                {waterBody.name || "Unnamed Water Body"}
              </h3>
              <button
                onClick={copyCoordinates}
                className="text-[11px] text-gray-400 font-mono hover:text-blue-500 transition-colors"
              >
                {copied
                  ? "✓ Copied"
                  : `${waterBody.center.lat.toFixed(4)}, ${waterBody.center.lng.toFixed(4)}`}
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 -mt-1 -mr-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Expandable content */}
          {expanded && (
            <div className="px-4 pb-2 space-y-2 overflow-y-auto flex-1">
              {displayTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {displayTags.map(([key, value]) => (
                    <span key={key} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              )}
              <a
                href={`https://www.openstreetmap.org/${waterBody.id.includes("/") ? waterBody.id : `way/${waterBody.id}`}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-500 hover:underline"
              >
                View on OpenStreetMap →
              </a>
            </div>
          )}

          {/* Property owner section */}
          <div className="px-4 pb-3 pt-1 border-t border-gray-100">
            {isLookingUpOwner && (
              <div className="flex items-center gap-2 py-1.5">
                <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-amber-700">Looking up owner...</span>
              </div>
            )}

            {ownerError && !isLookingUpOwner && (
              <p className="text-xs text-red-600 py-1">{ownerError}</p>
            )}

            {propertyOwner && !isLookingUpOwner && (
              <div className="space-y-1.5 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🏠</span>
                  <span className="text-sm font-medium text-gray-900 truncate">{ownerDisplay}</span>
                </div>
                {propertyOwner.propertyAddress?.street && (
                  <p className="text-xs text-gray-500 pl-6">
                    {propertyOwner.propertyAddress.street}, {propertyOwner.propertyAddress.city},{" "}
                    {propertyOwner.propertyAddress.state} {propertyOwner.propertyAddress.zipCode}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6">
                  {propertyOwner.propertyType && propertyOwner.propertyType !== "unknown" && (
                    <span className="text-[11px] text-gray-500">{propertyOwner.propertyType}</span>
                  )}
                  {propertyOwner.marketValue > 0 && (
                    <span className="text-[11px] text-gray-500 font-medium">
                      ${propertyOwner.marketValue.toLocaleString()}
                    </span>
                  )}
                  {propertyOwner.lotSizeAcres > 0 && (
                    <span className="text-[11px] text-gray-500">
                      {propertyOwner.lotSizeAcres} ac
                    </span>
                  )}
                  {propertyOwner.yearBuilt > 0 && (
                    <span className="text-[11px] text-gray-500">
                      Built {propertyOwner.yearBuilt}
                    </span>
                  )}
                  {propertyOwner.bedrooms > 0 && (
                    <span className="text-[11px] text-gray-500">
                      {propertyOwner.bedrooms}bd/{propertyOwner.bathrooms}ba
                    </span>
                  )}
                  {propertyOwner.buildingSqft > 0 && (
                    <span className="text-[11px] text-gray-500">
                      {propertyOwner.buildingSqft.toLocaleString()} sqft
                    </span>
                  )}
                  {propertyOwner.taxAmount > 0 && (
                    <span className="text-[11px] text-gray-500">
                      Tax: ${propertyOwner.taxAmount.toLocaleString()}
                    </span>
                  )}
                </div>
                {/* Mailing address if different */}
                {propertyOwner.mailingAddress?.street &&
                  propertyOwner.mailingAddress.street !== propertyOwner.propertyAddress?.street && (
                    <p className="text-[11px] text-gray-400 pl-6">
                      Mail: {propertyOwner.mailingAddress.street}, {propertyOwner.mailingAddress.city},{" "}
                      {propertyOwner.mailingAddress.state} {propertyOwner.mailingAddress.zipCode}
                    </p>
                  )}
                {propertyOwner.parcelId && (
                  <p className="text-[11px] text-gray-400 pl-6 font-mono">
                    Parcel: {propertyOwner.parcelId}
                  </p>
                )}
              </div>
            )}

            {!propertyOwner && !isLookingUpOwner && !ownerError && (
              <button
                onClick={() => onFindOwner?.()}
                className="w-full py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
              >
                🔍 Find Property Owner
              </button>
            )}
            {(propertyOwner || ownerError) && !isLookingUpOwner && (
              <button
                onClick={() => onFindOwner?.()}
                className="w-full py-1.5 mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                🔄 Re-lookup Owner
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Desktop floating panel ---- */}
      <div className="hidden md:block absolute bottom-4 left-4 z-40 w-80 animate-fade-in">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3 text-white">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] ${typeStyle.bg} ${typeStyle.text} rounded px-1.5 py-0.5 font-semibold`}>
                    {typeStyle.label}
                  </span>
                  {waterBody.area ? (
                    <span className="text-xs text-white/70">{formatArea(waterBody.area)}</span>
                  ) : null}
                </div>
                <h3 className="font-bold text-base truncate">
                  {waterBody.name || "Unnamed Water Body"}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-white/70 hover:text-white transition-colors ml-2 shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
            {/* Coordinates */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-500 font-mono">
                {waterBody.center.lat.toFixed(6)}, {waterBody.center.lng.toFixed(6)}
              </span>
              <button
                onClick={copyCoordinates}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-medium ml-2"
              >
                {copied ? "✓" : "Copy"}
              </button>
            </div>

            {/* Tags */}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {displayTags.map(([key, value]) => (
                  <span key={key} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            )}

            {/* OSM link */}
            <a
              href={`https://www.openstreetmap.org/${waterBody.id.includes("/") ? waterBody.id : `way/${waterBody.id}`}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-500 hover:underline block"
            >
              View on OpenStreetMap →
            </a>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Property owner section */}
            {isLookingUpOwner && (
              <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
                <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-amber-700">Looking up property owner...</span>
              </div>
            )}

            {ownerError && !isLookingUpOwner && (
              <div className="bg-red-50 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600">{ownerError}</p>
              </div>
            )}

            {propertyOwner && !isLookingUpOwner && (
              <div className="bg-green-50 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🏠</span>
                  <span className="text-sm font-semibold text-gray-900 truncate">{ownerDisplay}</span>
                </div>

                {propertyOwner.propertyAddress?.street && (
                  <p className="text-xs text-gray-600 pl-6">
                    {propertyOwner.propertyAddress.street}
                    <br />
                    {propertyOwner.propertyAddress.city}, {propertyOwner.propertyAddress.state}{" "}
                    {propertyOwner.propertyAddress.zipCode}
                  </p>
                )}

                {/* Property details chips */}
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {propertyOwner.propertyType && propertyOwner.propertyType !== "unknown" && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      {propertyOwner.propertyType}
                    </span>
                  )}
                  {propertyOwner.marketValue > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5 font-medium">
                      ${propertyOwner.marketValue.toLocaleString()}
                    </span>
                  )}
                  {propertyOwner.lotSizeAcres > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      {propertyOwner.lotSizeAcres} acres
                    </span>
                  )}
                  {propertyOwner.yearBuilt > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      Built {propertyOwner.yearBuilt}
                    </span>
                  )}
                  {propertyOwner.bedrooms > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      {propertyOwner.bedrooms}bd / {propertyOwner.bathrooms}ba
                    </span>
                  )}
                  {propertyOwner.buildingSqft > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      {propertyOwner.buildingSqft.toLocaleString()} sqft
                    </span>
                  )}
                  {propertyOwner.stories > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      {propertyOwner.stories} story
                    </span>
                  )}
                  {propertyOwner.taxAmount > 0 && (
                    <span className="text-[10px] bg-white/80 border border-green-200 text-green-800 rounded px-1.5 py-0.5">
                      Tax: ${propertyOwner.taxAmount.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Mailing address if different */}
                {propertyOwner.mailingAddress?.street &&
                  propertyOwner.mailingAddress.street !== propertyOwner.propertyAddress?.street && (
                    <p className="text-[10px] text-gray-400 pl-6">
                      Mail: {propertyOwner.mailingAddress.street}, {propertyOwner.mailingAddress.city},{" "}
                      {propertyOwner.mailingAddress.state} {propertyOwner.mailingAddress.zipCode}
                    </p>
                  )}

                {propertyOwner.parcelId && (
                  <p className="text-[10px] text-gray-400 pl-6 font-mono">
                    Parcel: {propertyOwner.parcelId}
                  </p>
                )}
              </div>
            )}

            {/* Action button */}
            {!propertyOwner && !isLookingUpOwner && !ownerError && (
              <button
                onClick={() => onFindOwner?.()}
                className="w-full py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
              >
                🔍 Find Property Owner
              </button>
            )}
            {(propertyOwner || ownerError) && !isLookingUpOwner && (
              <button
                onClick={() => onFindOwner?.()}
                className="w-full py-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                🔄 Re-lookup Owner
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
