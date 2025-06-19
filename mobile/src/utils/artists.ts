/**
 * Utility functions for handling multi-artist parsing and formatting
 */

/**
 * Parse a string containing multiple artists into an array of artist names.
 * Handles common delimiters used in music metadata.
 * 
 * Priority order for delimiters:
 * 1. "; " (semicolon with space) - most common for multi-artist separation
 * 2. ", " (comma with space) - secondary delimiter
 * 
 * @param artistString - The raw artist string from metadata
 * @returns Array of trimmed artist names, or empty array if input is invalid
 */
export function parseArtistString(artistString: string | null | undefined): string[] {
  if (!artistString || typeof artistString !== 'string') {
    return [];
  }

  const trimmed = artistString.trim();
  if (trimmed === '') {
    return [];
  }

  // First try semicolon delimiter (highest priority)
  if (trimmed.includes('; ')) {
    return trimmed
      .split('; ')
      .map(artist => artist.trim())
      .filter(artist => artist.length > 0);
  }

  // Then try comma delimiter
  if (trimmed.includes(', ')) {
    return trimmed
      .split(', ')
      .map(artist => artist.trim())
      .filter(artist => artist.length > 0);
  }

  // If no delimiters found, return single artist
  return [trimmed];
}

/**
 * Join multiple artist names into a display string for UI
 * 
 * @param artists - Array of artist names
 * @param maxDisplay - Maximum number of artists to display before truncating
 * @returns Formatted string for display
 */
export function formatArtistsForDisplay(artists: string[], maxDisplay: number = 3): string {
  if (artists.length === 0) {
    return '—';
  }

  if (artists.length === 1) {
    return artists[0] || '';
  }

  if (artists.length <= maxDisplay) {
    if (artists.length === 2) {
      return artists.join(' & ');
    }
    return artists.slice(0, -1).join(', ') + ' & ' + artists[artists.length - 1];
  }

  // Truncate if too many artists
  const displayed = artists.slice(0, maxDisplay - 1);
  const remaining = artists.length - displayed.length;
  return displayed.join(', ') + ` & ${remaining} more`;
}

/**
 * Create a primary artist string from multiple artists (for backward compatibility)
 * Uses the first artist as the primary one
 * 
 * @param artists - Array of artist names
 * @returns Primary artist name or null if no artists
 */
export function getPrimaryArtist(artists: string[]): string | null {
  return artists.length > 0 ? (artists[0] || null) : null;
}

/**
 * Validate and sanitize artist names
 * 
 * @param artists - Array of artist names to validate
 * @returns Array of valid, sanitized artist names
 */
export function sanitizeArtistNames(artists: string[]): string[] {
  return artists
    .map(artist => artist.trim())
    .filter(artist => artist.length > 0)
    .filter((artist, index, arr) => arr.indexOf(artist) === index); // Remove duplicates
}