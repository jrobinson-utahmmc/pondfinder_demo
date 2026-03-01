import Settings from "../models/Settings";

/**
 * Smarty (formerly SmartyStreets) API integration for address validation
 * and property owner lookups.
 *
 * API keys are loaded from the database Settings model (not env vars).
 *
 * Docs: https://www.smarty.com/docs
 */

interface SmartyAddressComponent {
  primary_number?: string;
  street_name?: string;
  street_suffix?: string;
  city_name?: string;
  default_city_name?: string;
  state_abbreviation?: string;
  zipcode?: string;
  plus4_code?: string;
  delivery_point_barcode?: string;
}

interface SmartyAnalysis {
  dpv_match_code?: string;
  dpv_footnotes?: string;
  active?: string;
  footnotes?: string;
}

interface SmartyAddressResult {
  input_index: number;
  delivery_line_1: string;
  last_line: string;
  delivery_point_barcode: string;
  components: SmartyAddressComponent;
  metadata: {
    latitude: number;
    longitude: number;
    precision: string;
    county_name?: string;
  };
  analysis: SmartyAnalysis;
}

interface SmartyReverseGeoResult {
  address: {
    street: string;
    city: string;
    state_abbreviation: string;
    zipcode: string;
  };
  coordinate: {
    latitude: number;
    longitude: number;
    license: number;
  };
  distance?: number;
}

export interface PropertyLookupResult {
  ownerName: string;
  firstName: string;
  lastName: string;
  companyName: string;
  mailingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  propertyAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  parcelId: string;
  propertyType: string;
  landUseGroup: string;
  lotSizeAcres: number;
  marketValue: number;
  yearBuilt: number;
  bedrooms: number;
  bathrooms: number;
  buildingSqft: number;
  stories: number;
  taxAmount: number;
  latitude: number;
  longitude: number;
  smartyLookupId: string;
}

export class SmartyService {
  private baseUrl = "https://us-street.api.smarty.com/street-address";
  private reverseGeoUrl = "https://us-reverse-geo.api.smarty.com/lookup";
  private propertyUrl = "https://us-enrichment.api.smarty.com/lookup";

  /**
   * Load credentials from the database at call-time.
   */
  private async getCredentials(): Promise<{ authId: string; authToken: string }> {
    const settings = await Settings.getInstance();
    return {
      authId: settings.smartyAuthId || "",
      authToken: settings.smartyAuthToken || "",
    };
  }

  /**
   * Check if Smarty credentials are configured.
   */
  async isConfigured(): Promise<boolean> {
    const { authId, authToken } = await this.getCredentials();
    return !!(authId && authToken);
  }

  /**
   * Validate and standardize a US street address.
   */
  async validateAddress(
    street: string,
    city: string,
    state: string,
    zipCode?: string
  ): Promise<SmartyAddressResult | null> {
    const configured = await this.isConfigured();
    if (!configured) {
      console.warn("[SmartyService] API credentials not configured");
      return null;
    }

    const { authId, authToken } = await this.getCredentials();

    const params = new URLSearchParams({
      "auth-id": authId,
      "auth-token": authToken,
      street,
      city,
      state,
      candidates: "1",
    });

    if (zipCode) {
      params.set("zipcode", zipCode);
    }

    try {
      const response = await fetch(`${this.baseUrl}?${params.toString()}`);

      if (!response.ok) {
        console.error(`[SmartyService] Address validation failed: ${response.status}`);
        return null;
      }

      const results = (await response.json()) as SmartyAddressResult[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error("[SmartyService] Address validation error:", error);
      return null;
    }
  }

  /**
   * Reverse geocode a lat/lng coordinate to find nearby addresses.
   */
  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<SmartyReverseGeoResult[]> {
    const configured = await this.isConfigured();
    if (!configured) {
      console.warn("[SmartyService] API credentials not configured");
      return [];
    }

    const { authId, authToken } = await this.getCredentials();

    const params = new URLSearchParams({
      "auth-id": authId,
      "auth-token": authToken,
      latitude: latitude.toString(),
      longitude: longitude.toString(),
    });

    try {
      const response = await fetch(`${this.reverseGeoUrl}?${params.toString()}`);

      if (!response.ok) {
        console.error(`[SmartyService] Reverse geocode failed: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { results?: SmartyReverseGeoResult[] };
      return data.results || [];
    } catch (error) {
      console.error("[SmartyService] Reverse geocode error:", error);
      return [];
    }
  }

  /**
   * Look up property owner data using the Smarty US Property (Enrichment) API.
   * First validates the address, then queries for property data.
   */
  async lookupPropertyOwner(
    street: string,
    city: string,
    state: string,
    zipCode: string
  ): Promise<PropertyLookupResult | null> {
    const configured = await this.isConfigured();
    if (!configured) {
      console.warn("[SmartyService] API credentials not configured");
      return null;
    }

    // Step 1: Validate the address to get a standardized lookup key
    const validated = await this.validateAddress(street, city, state, zipCode);
    if (!validated) {
      console.warn("[SmartyService] Could not validate address for property lookup");
      return null;
    }

    const smartyKey = validated.delivery_point_barcode || "";

    // Step 2: Query the US Property / Enrichment API
    try {
      const { authId, authToken } = await this.getCredentials();

      const lookupPath = `${validated.components.zipcode}/${encodeURIComponent(
        validated.delivery_line_1
      )}`;

      const params = new URLSearchParams({
        "auth-id": authId,
        "auth-token": authToken,
      });

      const response = await fetch(
        `${this.propertyUrl}/${lookupPath}/property/principal?${params.toString()}`
      );

      if (!response.ok) {
        console.error(`[SmartyService] Property lookup failed: ${response.status}`);
        // Return partial data from the validated address
        return this.buildPartialResult(validated, smartyKey);
      }

      const propertyData = await response.json();
      return this.parsePropertyData(propertyData, validated, smartyKey);
    } catch (error) {
      console.error("[SmartyService] Property lookup error:", error);
      return this.buildPartialResult(validated, smartyKey);
    }
  }

  /**
   * Look up property by coordinates (reverse geocode then property lookup).
   * Tries the exact coordinates first. If that fails, tries concentric rings
   * of probe points at increasing distances to find shore-side properties.
   * Water body centers are typically in the water, so we cast outward.
   */
  async lookupPropertyByCoordinates(
    latitude: number,
    longitude: number,
    searchRadiusMeters: number = 500
  ): Promise<PropertyLookupResult | null> {
    // Try exact coordinates first
    const direct = await this._reverseAndLookup(latitude, longitude);
    if (direct && direct.ownerName) return direct;

    // Concentric rings: 100m, 250m, 500m — 8 cardinal/intercardinal probes each
    const distances = [100, 250, searchRadiusMeters];
    const angles = [0, 45, 90, 135, 180, 225, 270, 315]; // 8 directions

    for (const dist of distances) {
      const offsetDeg = dist / 111320;
      const cosLat = Math.cos((latitude * Math.PI) / 180);

      // Run all 8 directions for this ring in parallel
      const probes = angles.map((angleDeg) => {
        const rad = (angleDeg * Math.PI) / 180;
        const dLat = offsetDeg * Math.cos(rad);
        const dLng = (offsetDeg * Math.sin(rad)) / cosLat;
        return this._reverseAndLookup(latitude + dLat, longitude + dLng);
      });

      const results = await Promise.all(probes);

      // Pick the first result with an actual owner name
      const found = results.find((r) => r && r.ownerName);
      if (found) return found;

      // Otherwise pick any result with a property address
      const partial = results.find(
        (r) => r && r.propertyAddress?.street
      );
      if (partial) return partial;
    }

    // Return whatever we got from the direct lookup (partial data is better than nothing)
    return direct;
  }

  /**
   * Internal: reverse geocode a single point and look up property.
   */
  private async _reverseAndLookup(
    latitude: number,
    longitude: number
  ): Promise<PropertyLookupResult | null> {
    const geoResults = await this.reverseGeocode(latitude, longitude);

    if (geoResults.length === 0) {
      return null;
    }

    const closest = geoResults[0];
    return this.lookupPropertyOwner(
      closest.address.street,
      closest.address.city,
      closest.address.state_abbreviation,
      closest.address.zipcode
    );
  }

  /**
   * Parse the property data response from Smarty US Address Enrichment API.
   * Response wraps in { "us-property-data-principal": [{ attributes: {...} }] }
   */
  private parsePropertyData(
    data: any,
    validated: SmartyAddressResult,
    smartyKey: string
  ): PropertyLookupResult {
    // Smarty enrichment wraps data under "us-property-data-principal" key
    const principalArray = data?.["us-property-data-principal"] || data || [];
    const entry = Array.isArray(principalArray) ? principalArray[0] : principalArray;
    const attr = entry?.attributes || {};

    // Owner name: prefer deed_owner_full_name, fall back to owner_full_name
    const ownerName = attr["deed_owner_full_name"] || attr["owner_full_name"] || "";
    const firstName = attr["first_name"] || "";
    const lastName = attr["last_name"] || "";
    // Company flag ("Y"/"N") — if "Y", owner is a company
    const isCompany = attr["company_flag"] === "Y";
    const companyName = isCompany ? ownerName : "";

    // Mailing / contact address
    const mailingStreet = attr["contact_full_address"] || attr["contact_street"] || "";
    const mailingCity = attr["contact_city"] || "";
    const mailingState = attr["contact_state"] || "";
    const mailingZip = attr["contact_zip"] || "";

    // Property address
    const propertyStreet = attr["property_address_full"] || validated.delivery_line_1;
    const propertyCity = attr["property_address_city"] || validated.components.city_name || validated.components.default_city_name || "";
    const propertyState = attr["property_address_state"] || validated.components.state_abbreviation || "";
    const propertyZip = attr["property_address_zipcode"] || validated.components.zipcode || "";

    // Land use
    const propertyType = attr["land_use_standard"] || attr["land_use_group"] || "unknown";
    const landUseGroup = attr["land_use_group"] || "";

    return {
      ownerName,
      firstName,
      lastName,
      companyName,
      mailingAddress: {
        street: mailingStreet,
        city: mailingCity,
        state: mailingState,
        zipCode: mailingZip,
      },
      propertyAddress: {
        street: propertyStreet,
        city: propertyCity,
        state: propertyState,
        zipCode: propertyZip,
      },
      parcelId: attr["parcel_raw_number"] || "",
      propertyType,
      landUseGroup,
      lotSizeAcres: parseFloat(attr["acres"]) || 0,
      marketValue: parseFloat(attr["total_market_value"]) || 0,
      yearBuilt: parseInt(attr["year_built"], 10) || 0,
      bedrooms: parseInt(attr["bedrooms"], 10) || 0,
      bathrooms: parseFloat(attr["bathrooms_total"]) || 0,
      buildingSqft: parseFloat(attr["building_sqft"]) || 0,
      stories: parseFloat(attr["stories_number"]) || 0,
      taxAmount: parseFloat(attr["tax_billed_amount"]) || 0,
      latitude: validated.metadata.latitude,
      longitude: validated.metadata.longitude,
      smartyLookupId: smartyKey,
    };
  }

  /**
   * Build a partial result when property enrichment data isn't available.
   */
  private buildPartialResult(
    validated: SmartyAddressResult,
    smartyKey: string
  ): PropertyLookupResult {
    return {
      ownerName: "",
      firstName: "",
      lastName: "",
      companyName: "",
      mailingAddress: { street: "", city: "", state: "", zipCode: "" },
      propertyAddress: {
        street: validated.delivery_line_1,
        city: validated.components.city_name || validated.components.default_city_name || "",
        state: validated.components.state_abbreviation || "",
        zipCode: validated.components.zipcode || "",
      },
      parcelId: "",
      propertyType: "unknown",
      landUseGroup: "",
      lotSizeAcres: 0,
      marketValue: 0,
      yearBuilt: 0,
      bedrooms: 0,
      bathrooms: 0,
      buildingSqft: 0,
      stories: 0,
      taxAmount: 0,
      latitude: validated.metadata.latitude,
      longitude: validated.metadata.longitude,
      smartyLookupId: smartyKey,
    };
  }
}

export default new SmartyService();
