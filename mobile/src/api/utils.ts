import type { asc, desc, sql } from "drizzle-orm";

import type { Track } from "~/db/schema";

/** Get columns we want to select in the database schema. */
export function getColumns(keys?: string[]) {
  if (keys === undefined) return undefined;
  return Object.fromEntries(keys.map((key) => [key, true]));
}

type WithTracksOptions = {
  withTracks?: false;
  trackColumns?: string[];
  /** Use the typical "orderBy" structure since typing is hard. */
  orderBy?: (
    fields: Record<keyof Track, any>,
    orderOperators: { sql: typeof sql; asc: typeof asc; desc: typeof desc },
  ) => any | any[];
};

/**
 * Determines if the `tracks` relation is used along with each track's
 * `album` relation.
 *
 * **Note:** The typing is very loose as to support the various use case of
 * `QueryOneWithTracksFn` (we ensure what's returned complies with what's
 * expected).
 */
export function withTracks(
  trackOptions: WithTracksOptions,
  albumOptions: WithAlbumOptions,
) {
  // FIXME: Would like better & safer typing.
  return (trackOptions.withTracks !== false
    ? {
        tracks: {
          columns: getColumns(trackOptions?.trackColumns),
          orderBy: trackOptions.orderBy,
          ...withAlbum(albumOptions),
        },
      }
    : {}) as unknown as { tracks: { with: { album: true } } };
}

type WithAlbumOptions = {
  defaultWithAlbum: boolean;
  withAlbum?: boolean;
  albumColumns?: string[];
};

/**
 * Creates the relations through the `with` operator for the `tracks`
 * field.
 *
 * **Note:** The typing is very loose as to support the various use case of
 * `QueryOneWithTracksFn` (we ensure what's returned complies with what's
 * expected).
 */
export function withAlbum(options: WithAlbumOptions) {
  return ((options.withAlbum ?? options.defaultWithAlbum) === true
    ? { with: { album: { columns: getColumns(options.albumColumns) } } }
    : {}) as unknown as { with: { album: true } };
}

type WithArtistsOptions = {
  withArtists?: boolean;
  artistColumns?: string[];
};

/**
 * Creates the relations through the `with` operator for track artists
 */
export function withTrackArtists(options: WithArtistsOptions = {}) {
  return (options.withArtists === true
    ? {
        tracksToArtists: {
          columns: { position: true },
          with: {
            artist: { columns: getColumns(options.artistColumns || ["name"]) }
          },
          orderBy: (fields: any, { asc }: any) => asc(fields.position),
        }
      }
    : {}) as unknown as { tracksToArtists: { with: { artist: true } } };
}

/**
 * Creates the relations through the `with` operator for album artists
 */
export function withAlbumArtists(options: WithArtistsOptions = {}) {
  return (options.withArtists === true
    ? {
        albumsToArtists: {
          columns: { position: true },
          with: {
            artist: { columns: getColumns(options.artistColumns || ["name"]) }
          },
          orderBy: (fields: any, { asc }: any) => asc(fields.position),
        }
      }
    : {}) as unknown as { albumsToArtists: { with: { artist: true } } };
}

/**
 * Enhanced version of withAlbum that includes album artists
 */
export function withAlbumAndArtists(albumOptions: WithAlbumOptions, artistOptions: WithArtistsOptions = {}) {
  const albumWith = (albumOptions.withAlbum ?? albumOptions.defaultWithAlbum) === true;
  
  if (!albumWith) {
    return {};
  }

  return {
    album: {
      columns: getColumns(albumOptions.albumColumns),
      ...withAlbumArtists(artistOptions),
    }
  };
}

/**
 * Enhanced version of withTracks that includes track and album artists
 */
export function withTracksAndArtists(
  trackOptions: WithTracksOptions,
  albumOptions: WithAlbumOptions,
  artistOptions: WithArtistsOptions = {}
) {
  return (trackOptions.withTracks !== false
    ? {
        tracks: {
          columns: getColumns(trackOptions?.trackColumns),
          orderBy: trackOptions.orderBy,
          ...withTrackArtists(artistOptions),
          ...withAlbumAndArtists(albumOptions, artistOptions),
        },
      }
    : {}) as unknown as { tracks: { with: { album: true; tracksToArtists: { with: { artist: true } } } } };
}
