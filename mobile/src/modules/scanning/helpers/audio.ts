import {
  MetadataPresets,
  getMetadata,
} from "@missingcore/react-native-metadata-retriever";
import { eq, inArray } from "drizzle-orm";
import { File } from "expo-file-system/next";
import type { Asset as MediaLibraryAsset } from "expo-media-library";
import { getAssetsAsync } from "expo-media-library";

import { db } from "~/db";
import { albums, artists, invalidTracks, tracks, tracksToArtists, albumsToArtists } from "~/db/schema";

import { getAlbums, upsertAlbum, upsertAlbumWithArtists } from "~/api/album";
import { createArtist } from "~/api/artist";
import { getSaveErrors } from "~/api/setting";
import { createTrack, createTrackWithArtists, deleteTrack, getTracks, updateTrack, updateTrackWithArtists } from "~/api/track";
import { userPreferencesStore } from "~/services/UserPreferences";
import { Queue, musicStore } from "~/modules/media/services/Music";
import { RecentList } from "~/modules/media/services/RecentList";
import { onboardingStore } from "../services/Onboarding";

import {
  addTrailingSlash,
  getSafeUri,
  removeFileExtension,
} from "~/utils/string";
import { parseArtistString, getPrimaryArtist, sanitizeArtistNames } from "~/utils/artists";
import { Stopwatch } from "~/utils/debug";
import { BATCH_PRESETS, batch, wait } from "~/utils/promise";
import { savePathComponents } from "./folder";

//#region Saving Function
/** Index tracks with their metadata into our database. */
export async function findAndSaveAudio() {
  const stopwatch = new Stopwatch();

  // Reset tracked values when saving/updating tracks in onboarding store.
  onboardingStore.setState({ staged: 0, saveErrors: 0 });

  const {
    listAllow: _listAllow,
    listBlock: _listBlock,
    minSeconds,
  } = userPreferencesStore.getState();
  const listAllow = _listAllow.map((p) => `file://${addTrailingSlash(p)}`);
  const listBlock = _listBlock.map((p) => `file://${addTrailingSlash(p)}`);

  // Get all audio files discoverable by `expo-media-library`.
  const incomingData: MediaLibraryAsset[] = [];
  let isComplete = false;
  let lastRead: string | undefined;
  do {
    const { assets, endCursor, hasNextPage } = await getAssetsAsync({
      after: lastRead,
      first: BATCH_PRESETS.LIGHT,
      mediaType: "audio",
    });
    incomingData.push(...assets);
    lastRead = endCursor;
    isComplete = !hasNextPage;
  } while (!isComplete);
  // Filter through the audio files and keep the tracks we want (in allowlist,
  // not in blocklist, and meets the minimum duration requirements).
  const discoveredTracks = incomingData.filter(
    (a) =>
      // If allowlist is empty, we want the check to resolve to `true`.
      (listAllow.length === 0 || listAllow.some((p) => a.uri.startsWith(p))) &&
      !listBlock.some((p) => a.uri.startsWith(p)) &&
      a.duration > minSeconds,
  );
  console.log(
    `Found ${incomingData.length} tracks, filtered down to ${discoveredTracks.length} in ${stopwatch.lapTime()}.`,
  );

  // Get relevant entries inside our database.
  const allTracks = await getTracks({
    columns: ["id", "modificationTime", "uri"],
    withAlbum: false,
  });
  const allTracksMap = Object.fromEntries(allTracks.map((t) => [t.id, t]));
  const allInvalidTracks = await getSaveErrors();
  const allInvalidTracksMap = Object.fromEntries(
    allInvalidTracks.map((t) => [t.id, t]),
  );
  onboardingStore.setState({ prevSaved: allTracks.length });

  // Find the tracks we can skip indexing or need updating.
  const modifiedTracks = new Set<string>();
  const unmodifiedTracks = new Set<string>();
  discoveredTracks.forEach(({ id, modificationTime, uri }) => {
    const isSaved = allTracksMap[id];
    const isInvalid = allInvalidTracksMap[id];
    if (!isSaved && !isInvalid) return; // If we have a new track.

    const lastModified = (isSaved ?? isInvalid)!.modificationTime;
    let isDifferentUri = (isSaved ?? isInvalid)!.uri !== uri;

    // Moving folders in Android is kind of weird; sometimes, the URI of
    // the file after being moved is still being displayed in its original
    // location in addition to its new location.
    //
    // The logic below makes sure that if the file has the same id and is
    // detected in 2 different locations, we make sure the track is marked
    // as being "modified".
    if (isDifferentUri && unmodifiedTracks.has(id)) unmodifiedTracks.delete(id);
    else if (!isDifferentUri && modifiedTracks.has(id)) isDifferentUri = true;

    // Retry indexing if modification time or uri is different.
    if (modificationTime !== lastModified || isDifferentUri) {
      modifiedTracks.add(id);
    } else {
      unmodifiedTracks.add(id);
    }
  });
  onboardingStore.setState({
    unstaged: discoveredTracks.length - unmodifiedTracks.size,
  });
  console.log(`Determined unstaged content in ${stopwatch.lapTime()}.`);

  // Create track entries from the minimum amount of data.
  const unstagedTracks = discoveredTracks.filter(
    ({ id }) => !unmodifiedTracks.has(id),
  );
  // Set the current phase to `tracks` if we find tracks that need saving/updating.
  if (unstagedTracks.length > 0) onboardingStore.setState({ phase: "tracks" });
  await wait(1); // Slight buffer to prevent blocking onboarding screen animation.
  await batch({
    data: unstagedTracks,
    batchAmount: BATCH_PRESETS.PROGRESS,
    callback: async (mediaAsset) => {
      const { id, uri, modificationTime } = mediaAsset;
      const isRetry = allInvalidTracksMap[id];

      try {
        const { trackData, artists } = await getTrackEntry(mediaAsset);

        // Make sure we have the "folder" structure to this file.
        await savePathComponents(uri);

        if (modifiedTracks.has(id) && !isRetry) {
          // Update existing track with multi-artist support.
          await updateTrackWithArtists(id, trackData, artists);
        } else {
          // Save new track with multi-artist support.
          await createTrackWithArtists(trackData, artists);
          // Remove track from `InvalidTrack` if it was there previously.
          if (isRetry) {
            await db.delete(invalidTracks).where(eq(invalidTracks.id, id));
          }
        }
      } catch (err) {
        const isError = err instanceof Error;
        const errorInfo = {
          errorName: isError ? err.name : "UnknownError",
          errorMessage: isError ? err.message : "Rejected for unknown reasons.",
        };
        // We may end up here if the track at the given uri doesn't exist anymore.
        console.log(`[Track ${id}] ${errorInfo.errorMessage}`);

        // Delete the track and its relation, then manually add it to
        // `InvalidTrack` schema (as the track may not exist prior).
        await deleteTrack(id);
        await db
          .insert(invalidTracks)
          .values({ id, uri, modificationTime, ...errorInfo })
          .onConflictDoUpdate({
            target: invalidTracks.id,
            set: { modificationTime, ...errorInfo },
          });

        throw new Error(id);
      }
    },
    onBatchComplete: (fulfilled, rejected) => {
      onboardingStore.setState((prev) => ({
        staged: prev.staged + fulfilled.length,
        saveErrors: prev.saveErrors + rejected.length,
      }));
    },
  });
  const { staged, saveErrors } = onboardingStore.getState();
  console.log(
    `Found/updated ${staged} tracks & encountered ${saveErrors} errors in ${stopwatch.lapTime()}.`,
  );
  console.log(`Completed finding & saving audio in ${stopwatch.stop()}`);

  return {
    foundFiles: discoveredTracks,
    unstagedFiles: unstagedTracks,
    changed: discoveredTracks.length - unmodifiedTracks.size,
  };
}

const wantedMetadata = [
  ...MetadataPresets.standard,
  ...["discNumber", "bitrate", "sampleMimeType", "sampleRate"],
] as const;

async function getTrackEntry({
  id,
  uri,
  duration,
  modificationTime,
  filename,
}: MediaLibraryAsset) {
  const { bitrate, sampleRate, ...t } = await getMetadata(uri, wantedMetadata);
  const file = new File(getSafeUri(uri));

  // Parse multiple artists from metadata with enhanced format support
  // FLAC files might use different field names, so check multiple possible fields
  const artistFields = [t.artist, t.albumArtist, (t as any).artists, (t as any).performer];
  const albumArtistFields = [t.albumArtist, t.artist, (t as any).albumartist, (t as any).album_artist];
  
  // Get the first non-empty artist field
  const rawArtist = artistFields.find(field => field && field.trim().length > 0) || t.artist;
  const rawAlbumArtist = albumArtistFields.find(field => field && field.trim().length > 0) || t.albumArtist;
  
  let trackArtists = sanitizeArtistNames(parseArtistString(rawArtist));
  let albumArtists = sanitizeArtistNames(parseArtistString(rawAlbumArtist));

  // Fallback to track artists if no album artists found
  if (albumArtists.length === 0 && trackArtists.length > 0) {
    albumArtists = [...trackArtists];
  }

  // Fallback to album artists if no track artists found
  if (trackArtists.length === 0 && albumArtists.length > 0) {
    trackArtists = [...albumArtists];
  }

  // If still no artists found, use a default
  if (trackArtists.length === 0) {
    trackArtists = ["Unknown Artist"];
  }
  if (albumArtists.length === 0) {
    albumArtists = [...trackArtists];
  }

  // Combine all unique artists for creation
  const allArtists = Array.from(new Set([...trackArtists, ...albumArtists]));

  // Add new artists to the database.
  await Promise.allSettled(
    allArtists
      .filter((name) => name.trim() !== "")
      .map((name) => createArtist({ name: name.trim() })),
  );

  // Add new album to the database with multiple artists support
  let albumId: string | null = null;
  if (!!t.albumTitle?.trim()) {
    const newAlbum = await upsertAlbumWithArtists(
      {
        name: t.albumTitle.trim(),
        releaseYear: t.year ?? -1,
      },
      albumArtists
    );
    if (newAlbum) albumId = newAlbum.id;
  }

  return {
    trackData: {
      id,
      name: t.title?.trim() || removeFileExtension(filename),
      artistName: getPrimaryArtist(trackArtists), // Keep for backward compatibility
      albumId,
      track: t.trackNumber,
      disc: t.discNumber,
      format: t.sampleMimeType,
      bitrate,
      sampleRate,
      duration,
      uri,
      modificationTime,
      fetchedArt: false,
      size: file.exists ? (file.size ?? 0) : 0,
    },
    artists: trackArtists,
  };
}
//#endregion

//#region Cleanup Functions
/** Clean up all unused content from a validated list of found content. */
export async function cleanupDatabase(usedTrackIds: string[]) {
  // Remove any unused tracks.
  const unusedTrackIds = (
    await Promise.all(
      [invalidTracks, tracks].map((sch) => db.select({ id: sch.id }).from(sch)),
    )
  )
    .flat()
    .map(({ id }) => id)
    .filter((id) => !usedTrackIds.includes(id));
  await batch({
    data: unusedTrackIds,
    callback: async (id) => {
      await db.delete(invalidTracks).where(eq(invalidTracks.id, id));
      await deleteTrack(id);
    },
  });

  // Ensure we didn't reference deleted tracks in the playback store.
  const { playingList, activeId } = musicStore.getState();
  const currList = activeId ? playingList.concat(activeId) : playingList;
  const hasRemovedTrack = currList.some((tId) => unusedTrackIds.includes(tId));
  if (hasRemovedTrack) await musicStore.getState().reset();
  // Clear the queue of deleted tracks.
  await Queue.removeIds(unusedTrackIds);

  // Remove anything else that's unused.
  await removeUnusedCategories();
}

/** Remove any albums or artists that aren't used. */
export async function removeUnusedCategories() {
  // Remove unused albums.
  const allAlbums = await getAlbums({ columns: ["id"], trackColumns: ["id"] });
  const unusedAlbumIds = allAlbums
    .filter(({ tracks }) => tracks.length === 0)
    .map(({ id }) => id);
  
  // Clean up album-to-artist relationships for unused albums
  if (unusedAlbumIds.length > 0) {
    await db.delete(albumsToArtists).where(inArray(albumsToArtists.albumId, unusedAlbumIds));
  }
  await db.delete(albums).where(inArray(albums.id, unusedAlbumIds));

  // Remove unused artists.
  const allArtists = await db.query.artists.findMany({
    columns: { name: true },
    with: {
      albumsToArtists: { columns: { albumId: true } },
      tracksToArtists: { columns: { trackId: true } },
    },
  });
  const unusedArtistNames = allArtists
    .filter(({ albumsToArtists, tracksToArtists }) => 
      albumsToArtists.length === 0 && tracksToArtists.length === 0)
    .map(({ name }) => name);
  await db.delete(artists).where(inArray(artists.name, unusedArtistNames));

  // Remove these values from the recent list.
  const removedLists = [
    ...unusedAlbumIds.map((id) => ({ type: "album", id })),
    ...unusedArtistNames.map((name) => ({ type: "artist", id: name })),
  ] as Array<{ type: "album" | "artist"; id: string }>;
  if (removedLists.length > 0) RecentList.removeEntries(removedLists);
}
//#endregion
