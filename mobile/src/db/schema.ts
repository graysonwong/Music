import { createId } from "@paralleldrive/cuid2";
import type { InferSelectModel, SQL } from "drizzle-orm";
import { relations, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import type { Prettify } from "~/utils/types";

export const artists = sqliteTable("artists", {
  name: text().primaryKey(),
  artwork: text(),
});

export const artistsRelations = relations(artists, ({ many }) => ({
  albumsToArtists: many(albumsToArtists),
  tracksToArtists: many(tracksToArtists),
}));

export const albums = sqliteTable(
  "albums",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text().notNull(),
    // Legacy field for backward compatibility - will be deprecated
    artistName: text("artist_name").references(() => artists.name),
    /*
      FIXME: This is technically `.notNull()`, but the migration will fail
      for users who have "duplicate" album where `releaseYear = null`.
    */
    releaseYear: integer("release_year").default(-1),
    artwork: text().generatedAlwaysAs(
      (): SQL => sql`coalesce(${albums.altArtwork}, ${albums.embeddedArtwork})`,
    ),
    embeddedArtwork: text("embedded_artwork"),
    altArtwork: text("alt_artwork"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [unique().on(t.name, t.releaseYear)],
);

export const albumsRelations = relations(albums, ({ many }) => ({
  albumsToArtists: many(albumsToArtists),
  tracks: many(tracks),
}));

export const albumsToArtists = sqliteTable(
  "albums_to_artists",
  {
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id),
    artistName: text("artist_name")
      .notNull()
      .references(() => artists.name),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.artistName] })],
);

export const albumsToArtistsRelations = relations(
  albumsToArtists,
  ({ one }) => ({
    album: one(albums, {
      fields: [albumsToArtists.albumId],
      references: [albums.id],
    }),
    artist: one(artists, {
      fields: [albumsToArtists.artistName],
      references: [artists.name],
    }),
  }),
);

export const tracks = sqliteTable("tracks", {
  id: text().primaryKey(),
  name: text().notNull(),
  // Legacy field for backward compatibility - will be deprecated
  artistName: text("artist_name").references(() => artists.name),
  albumId: text("album_id").references(() => albums.id),
  artwork: text(),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  duration: integer().notNull(), // Track duration in seconds
  // Album relations
  disc: integer(),
  track: integer(),
  // Other metadata
  format: text(), // Currently the mimetype of the file
  bitrate: integer(),
  sampleRate: integer("sample_rate"),
  size: integer().notNull(),
  uri: text().notNull(),
  modificationTime: integer("modification_time").notNull(),
  // Data checking fields.
  fetchedArt: integer("fetched_art", { mode: "boolean" }).notNull().default(false),
  parentFolder: text("parent_folder").generatedAlwaysAs(
    // Ref: https://stackoverflow.com/a/38330814
    (): SQL => sql`rtrim(${tracks.uri}, replace(${tracks.uri}, '/', ''))`,
  ),
});

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  album: one(albums, { fields: [tracks.albumId], references: [albums.id] }),
  tracksToArtists: many(tracksToArtists),
  tracksToPlaylists: many(tracksToPlaylists),
}));

export const tracksToArtists = sqliteTable(
  "tracks_to_artists",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    artistName: text("artist_name")
      .notNull()
      .references(() => artists.name),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.artistName] })],
);

export const tracksToArtistsRelations = relations(
  tracksToArtists,
  ({ one }) => ({
    track: one(tracks, {
      fields: [tracksToArtists.trackId],
      references: [tracks.id],
    }),
    artist: one(artists, {
      fields: [tracksToArtists.artistName],
      references: [artists.name],
    }),
  }),
);

export const invalidTracks = sqliteTable("invalid_tracks", {
  id: text().primaryKey(),
  uri: text().notNull(),
  errorName: text("error_name"),
  errorMessage: text("error_message"),
  modificationTime: integer("modification_time").notNull(),
});

export const playlists = sqliteTable("playlists", {
  name: text().primaryKey(),
  artwork: text(),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
});

export const playlistsRelations = relations(playlists, ({ many }) => ({
  tracksToPlaylists: many(tracksToPlaylists),
}));

export const tracksToPlaylists = sqliteTable(
  "tracks_to_playlists",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    playlistName: text("playlist_name")
      .notNull()
      .references(() => playlists.name),
    position: integer().notNull().default(-1),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.playlistName] })],
);

export const tracksToPlaylistsRelations = relations(
  tracksToPlaylists,
  ({ one }) => ({
    playlist: one(playlists, {
      fields: [tracksToPlaylists.playlistName],
      references: [playlists.name],
    }),
    track: one(tracks, {
      fields: [tracksToPlaylists.trackId],
      references: [tracks.id],
    }),
  }),
);

export const fileNodes = sqliteTable("file_node", {
  // Excludes the `file:///` at the beginning. Ends with a trailing `/`.
  path: text().primaryKey(),
  // `null` if `path = "Music"`. Ends with a trailing `/`.
  parentPath: text("parent_path").references((): AnySQLiteColumn => fileNodes.path),
  name: text().notNull(), // Name of directory.
});

export const fileNodesRelations = relations(fileNodes, ({ one }) => ({
  parent: one(fileNodes, {
    fields: [fileNodes.parentPath],
    references: [fileNodes.path],
  }),
}));

export type Artist = InferSelectModel<typeof artists>;
export type ArtistWithTracks = Prettify<Artist & { tracks: TrackWithAlbum[] }>;

export type Album = InferSelectModel<typeof albums>;
export type AlbumWithTracks = Prettify<Album & { tracks: Track[] }>;
export type AlbumWithArtists = Prettify<
  Album & { albumsToArtists: Array<{ artist: Artist; position: number }> }
>;

export type Track = InferSelectModel<typeof tracks>;
export type TrackWithAlbum = Prettify<Track & { album: Album | null }>;
export type TrackWithArtists = Prettify<
  Track & { tracksToArtists: Array<{ artist: Artist; position: number }> }
>;
export type TrackWithAlbumAndArtists = Prettify<
  Track & { 
    album: AlbumWithArtists | null;
    tracksToArtists: Array<{ artist: Artist; position: number }>;
  }
>;

export type InvalidTrack = InferSelectModel<typeof invalidTracks>;

export type Playlist = InferSelectModel<typeof playlists>;
export type PlaylistWithJunction = Prettify<
  Playlist & { tracksToPlaylists: Array<{ track: TrackWithAlbum }> }
>;
export type PlaylistWithTracks = Prettify<
  Playlist & { tracks: TrackWithAlbum[] }
>;

export type TrackToPlaylist = InferSelectModel<typeof tracksToPlaylists>;
export type TrackToArtist = InferSelectModel<typeof tracksToArtists>;
export type AlbumToArtist = InferSelectModel<typeof albumsToArtists>;

export type FileNode = InferSelectModel<typeof fileNodes>;
export type FileNodeWithParent = Prettify<
  FileNode & { parent: FileNode | null }
>;
