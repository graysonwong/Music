import { and, eq } from "drizzle-orm";

import { db } from "~/db";
import type { Album } from "~/db/schema";
import { albums, albumsToArtists } from "~/db/schema";

import i18next from "~/modules/i18n";

import { iAsc } from "~/lib/drizzle";
import type { QueryManyWithTracksFn, QueryOneWithTracksFn } from "./types";
import { getColumns, withTracks, withAlbumArtists } from "./utils";

//#region GET Methods
const _getAlbum: QueryOneWithTracksFn<Album, false> =
  () => async (id, options) => {
    const album = await db.query.albums.findFirst({
      where: eq(albums.id, id),
      columns: getColumns(options?.columns),
      with: {
        ...withTracks(
          {
            ...options,
            orderBy: (fields, { asc }) => [asc(fields.disc), asc(fields.track)],
          },
          { defaultWithAlbum: false, ...options },
        ),
        albumsToArtists: {
          with: {
            artist: true,
          },
          orderBy: (fields, { asc }) => asc(fields.position),
        },
      },
    });
    if (!album) throw new Error(i18next.t("err.msg.noAlbums"));
    
    // Transform the data to include artists array
    if (album) {
      const artists = album.albumsToArtists.map(({ artist }) => artist);
      return { ...album, artists } as any;
    }
    
    return album;
  };

/** Get specified album. Throws error if nothing is found. */
export const getAlbum = _getAlbum();

const _getAlbums: QueryManyWithTracksFn<Album, false> =
  () => async (options) => {
    const albums = await db.query.albums.findMany({
      where: and(...(options?.where ?? [])),
      columns: getColumns(options?.columns),
      with: {
        ...withTracks(
          {
            ...options,
            orderBy: (fields, { asc }) => [asc(fields.disc), asc(fields.track)],
          },
          { defaultWithAlbum: false, ...options },
        ),
        albumsToArtists: {
          with: {
            artist: true,
          },
          orderBy: (fields, { asc }) => asc(fields.position),
        },
      },
      orderBy: (fields) => [iAsc(fields.name), iAsc(fields.artistName)],
    });
    
    // Transform the data to include artists array
    return albums.map(album => {
      const artists = album.albumsToArtists.map(({ artist }) => artist);
      return { ...album, artists };
    }) as any;
  };

/** Get multiple albums. */
export const getAlbums = _getAlbums();

/** Get specified album with artist information. */
export async function getAlbumWithArtists(id: string) {
  const album = await db.query.albums.findFirst({
    where: eq(albums.id, id),
    with: {
      ...withAlbumArtists({ withArtists: true }),
      tracks: {
        orderBy: (fields, { asc }) => [asc(fields.disc), asc(fields.track)],
      },
    },
  });
  if (!album) throw new Error(i18next.t("err.msg.noAlbums"));
  return album;
}

/** Get multiple albums with artist information. */
export async function getAlbumsWithArtists(options?: {
  where?: any[];
  columns?: (keyof Album)[];
}) {
  return db.query.albums.findMany({
    where: options?.where && options.where.length > 0 ? and(...options.where) : undefined,
    columns: getColumns(options?.columns),
    with: {
      ...withAlbumArtists({ withArtists: true }),
      tracks: {
        orderBy: (fields, { asc }) => [asc(fields.disc), asc(fields.track)],
      },
    },
    orderBy: (fields) => [iAsc(fields.name), iAsc(fields.releaseYear)],
  });
}
//#endregion

//#region PATCH Methods
/** Update the `favorite` status of an album. */
export async function favoriteAlbum(id: string, isFavorite: boolean) {
  return updateAlbum(id, { isFavorite });
}

/** Update specified album. */
export async function updateAlbum(
  id: string,
  values: Partial<typeof albums.$inferInsert>,
) {
  return db.update(albums).set(values).where(eq(albums.id, id));
}
//#endregion

//#region PUT Methods
/** Create a new album entry, or update an existing one. Returns the created album. */
export async function upsertAlbum(entry: typeof albums.$inferInsert) {
  return (
    await db
      .insert(albums)
      .values(entry)
      .onConflictDoUpdate({
        target: [albums.name, albums.artistName, albums.releaseYear],
        set: entry,
      })
      .returning()
  )[0];
}

/** Create a new album with multiple artists. Returns the created album. */
export async function upsertAlbumWithArtists(
  albumData: Omit<typeof albums.$inferInsert, 'artistName'>,
  artistNames: string[]
) {
  return db.transaction(async (tx) => {
    // Create album without artistName (for new multi-artist approach)
    const [album] = await tx
      .insert(albums)
      .values({
        ...albumData,
        artistName: artistNames[0] || null, // Keep first artist for backward compatibility
      })
      .onConflictDoUpdate({
        target: [albums.name, albums.releaseYear],
        set: albumData,
      })
      .returning();

    // Remove existing artist associations
    if (album?.id) {
      await tx.delete(albumsToArtists).where(eq(albumsToArtists.albumId, album.id));

      // Add new artist associations
      if (artistNames.length > 0) {
        await tx.insert(albumsToArtists).values(
          artistNames.map((artistName, index) => ({
            albumId: album.id,
            artistName,
            position: index,
          }))
        );
      }
    }

    return album;
  });
}

/** Add artists to an existing album */
export async function addArtistsToAlbum(albumId: string, artistNames: string[]) {
  return db.transaction(async (tx) => {
    // Get current max position
    const lastArtist = await tx.query.albumsToArtists.findFirst({
      where: eq(albumsToArtists.albumId, albumId),
      orderBy: (fields, { desc }) => desc(fields.position),
    });

    const startPosition = (lastArtist?.position ?? -1) + 1;

    // Add new artists
    await tx.insert(albumsToArtists).values(
      artistNames.map((artistName, index) => ({
        albumId,
        artistName,
        position: startPosition + index,
      }))
    );
  });
}
//#endregion
