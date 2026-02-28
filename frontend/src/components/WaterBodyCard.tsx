"use client";

import type { WaterBodyResult } from "@/lib/overpass";

interface WaterBodyCardProps {
  waterBody: WaterBodyResult;
  onClick?: () => void;
  onFindOwner?: () => void;
  isSelected?: boolean;
}

export default function WaterBodyCard({
  waterBody,
  onClick,
  onFindOwner,
  isSelected,
}: WaterBodyCardProps) {
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

  // Format area in acres
  const formatArea = (sqMeters: number) => {
    const acres = sqMeters / 4046.86;
    if (acres < 0.1) {
      return `${(sqMeters * 10.764).toFixed(0)} sq ft`;
    }
    return `${acres.toFixed(2)} acres`;
  };

  return (
    <div
      onClick={onClick}
      className={`
        p-3 border-b border-gray-100 cursor-pointer transition-colors group
        ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}
      `}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-gray-900 truncate flex-1">
          {waterBody.name || "Unnamed Water Body"}
        </span>
        <span className={`text-xs ${typeStyle.bg} ${typeStyle.text} rounded px-2 py-0.5 ml-2`}>
          {typeStyle.label}
        </span>
      </div>

      {/* Tags/details if available */}
      {waterBody.tags?.natural && waterBody.tags.natural !== waterBody.type && (
        <p className="text-xs text-gray-500 mt-1 truncate">
          Type: {waterBody.tags.natural}
        </p>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">
          {waterBody.area ? formatArea(waterBody.area) : "—"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFindOwner?.();
          }}
          className="text-xs bg-amber-500 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 hover:bg-amber-600 transition-all"
        >
          Find Owner
        </button>
      </div>

      {/* Coordinates */}
      <div className="text-xs text-gray-400 mt-1">
        {waterBody.center.lat.toFixed(4)}, {waterBody.center.lng.toFixed(4)}
      </div>
    </div>
  );
}
