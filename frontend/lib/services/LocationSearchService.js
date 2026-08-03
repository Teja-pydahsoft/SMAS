/**
 * LocationSearchService
 * Reusable service for fetching autocomplete suggestions from Geoapify.
 */
export class LocationSearchService {
  /**
   * Search for places, businesses, factories, etc. using Geoapify
   * @param {string} text - The search query
   * @returns {Promise<Array>} Array of suggestion objects
   */
  static async search(text) {
    if (!text || text.trim().length < 3) return [];

    const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
    if (!apiKey) {
      console.warn("Geoapify API key is missing. Please set NEXT_PUBLIC_GEOAPIFY_API_KEY in .env.local.");
      return [];
    }

    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text.trim())}&limit=5&apiKey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Geoapify error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.features || [];
    } catch (error) {
      console.error("LocationSearchService.search error:", error);
      return [];
    }
  }

  /**
   * Formats a Geoapify feature into a standard suggestion object
   * @param {Object} feature - Geoapify feature object
   * @returns {Object} Standardized suggestion
   */
  static formatSuggestion(feature) {
    const props = feature.properties;
    return {
      id: props.place_id,
      name: props.name || props.formatted,
      formattedAddress: props.formatted,
      latitude: props.lat,
      longitude: props.lon,
    };
  }
}
