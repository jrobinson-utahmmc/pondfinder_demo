"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface LocationPromptProps {
  onLocationSelected: (location: { lat: number; lng: number; address: string }) => void;
  onUseCurrentLocation?: () => void;
}

export default function LocationPrompt({
  onLocationSelected,
  onUseCurrentLocation,
}: LocationPromptProps) {
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dummyDiv = useRef<HTMLDivElement>(null);

  // Initialize Google Places services
  useEffect(() => {
    if (typeof google !== "undefined" && google.maps?.places) {
      autocompleteService.current = new google.maps.places.AutocompleteService();
      if (dummyDiv.current) {
        placesService.current = new google.maps.places.PlacesService(dummyDiv.current);
      }
    }
  }, []);

  // Fetch suggestions as user types
  const fetchSuggestions = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 3) {
      setSuggestions([]);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      {
        input,
        types: ["geocode", "establishment"],
        componentRestrictions: { country: "us" },
      },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, []);

  // Debounce input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(address);
    }, 300);
    return () => clearTimeout(timer);
  }, [address, fetchSuggestions]);

  // Handle selecting a suggestion
  const handleSelectSuggestion = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current) return;

    setIsLoading(true);
    setShowSuggestions(false);
    setAddress(prediction.description);

    placesService.current.getDetails(
      { placeId: prediction.place_id, fields: ["geometry", "formatted_address"] },
      (place, status) => {
        setIsLoading(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          onLocationSelected({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            address: place.formatted_address || prediction.description,
          });
        } else {
          setError("Could not get location details. Please try again.");
        }
      }
    );
  };

  // Handle using current location
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLoading(false);
        onLocationSelected({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: "Current Location",
        });
      },
      (err) => {
        setIsLoading(false);
        setError("Could not get your location. Please enter an address instead.");
        console.error("Geolocation error:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-900 flex items-center justify-center z-50">
      {/* Dummy div for PlacesService */}
      <div ref={dummyDiv} style={{ display: "none" }} />

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-8 text-white text-center">
          <div className="text-5xl mb-4">🌊</div>
          <h1 className="text-2xl font-bold">Pond Finder</h1>
          <p className="text-blue-100 mt-2">Find water bodies and property owners</p>
        </div>

        {/* Content */}
        <div className="p-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Where would you like to search?
          </label>

          {/* Address input with autocomplete */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Enter an address, city, or zip code..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />

            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.place_id}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-start gap-3"
                  >
                    <span className="text-gray-400 mt-0.5">📍</span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {suggestion.structured_formatting.main_text}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {suggestion.structured_formatting.secondary_text}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* Use current location button */}
          <button
            onClick={handleUseCurrentLocation}
            disabled={isLoading}
            className="w-full py-3 border-2 border-blue-500 text-blue-600 rounded-lg font-medium text-sm hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Use My Current Location
          </button>

          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Getting location...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 text-center text-xs text-gray-400">
          Search for ponds, lakes, and water features in any area
        </div>
      </div>
    </div>
  );
}
