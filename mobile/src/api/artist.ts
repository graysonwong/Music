import { and, eq } from "drizzle-orm";

import { db } from "~/db";
import type { Artist } from "~/db/schema";
import { artists } from "~/db/schema";

import i18next from "~/modules/i18n";

import { iAsc } from "~/lib/drizzle";
import type { QueryManyWithTracksFn, QueryOneWithTracksFn } from "./types";
import { getColumns } from "./utils";

//#region GET Methods
const _getArtist: QueryOneWithTracksFn<Artist> = () => async (id, options) => {
  const artist = await db.query.artists.findFirst({
    where: eq(artists.name, id),
    columns: getColumns(options?.columns),
    with: {
      tracksToArtists: {
        with: {
          track: {
            with: {
              album: true,
            },
          },
        },
        orderBy: (fields, { asc }) => asc(fields.position),
      },
    },
  });
  if (!artist) throw new Error(i18next.t("err.msg.noArtists"));
  return artist as any;
};

/** Get specified artist. Throws error if nothing is found. */
export const getArtist = _getArtist();

/** Get the albums an artist has released in descending order. */
export async function getArtistAlbums(id: string) {
  return db.query.artists.findFirst({
    where: eq(artists.name, id),
    with: {
      albumsToArtists: {
        with: {
          album: true,
        },
        orderBy: (fields, { asc }) => asc(fields.position),
      },
    },
  }).then(artist => {
    const albums = artist?.albumsToArtists.map(({ album }) => album) || [];
    // Sort albums by release year in descending order
    return albums.sort((a, b) => (b.releaseYear || -1) - (a.releaseYear || -1));
  });
}

const _getArtists: QueryManyWithTracksFn<Artist> = () => async (options) => {
  return db.query.artists.findMany({
    where: options?.where && options.where.length > 0 ? and(...(options.where.filter(Boolean) as any)) : undefined,
    columns: getColumns(options?.columns),
    with: {
      tracksToArtists: {
        with: {
          track: {
            with: {
              album: true,
            },
          },
        },
        orderBy: (fields, { asc }) => asc(fields.track.name),
      },
    },
    orderBy: (fields) => iAsc(fields.name),
  }) as any;
};

/** Get multiple artists. */
export const getArtists = _getArtists();
//#endregion

//#region POST Methods
/** Create a new artist entry. */
export async function createArtist(entry: typeof artists.$inferInsert) {
  return db.insert(artists).values(entry).onConflictDoNothing();
}
//#endregion

//#region PATCH Methods
/** Update specified artist. */
export async function updateArtist(
  id: string,
  values: Partial<Omit<typeof artists.$inferInsert, "name">>,
) {
  return db.update(artists).set(values).where(eq(artists.name, id));
}
//#endregion
