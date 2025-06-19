/**
 * Migration script to populate multi-artist junction tables with existing data
 * This should be run after the database schema migration creates the junction tables
 */

import { db } from "../index";
import { albums, artists, tracks, albumsToArtists, tracksToArtists } from "../schema";
import { parseArtistString } from "~/utils/artists";

export async function migrateToMultiArtist() {
  console.log("Starting multi-artist data migration...");

  try {
    // Check if junction tables exist by trying to query them
    try {
      await db.select().from(albumsToArtists).limit(1);
      await db.select().from(tracksToArtists).limit(1);
    } catch (error) {
      console.log("Junction tables don't exist yet, skipping data migration");
      return;
    }

    // Check if migration has already been run
    const existingAlbumArtists = await db.select().from(albumsToArtists).limit(1);
    const existingTrackArtists = await db.select().from(tracksToArtists).limit(1);
    
    if (existingAlbumArtists.length > 0 || existingTrackArtists.length > 0) {
      console.log("Multi-artist data already migrated, skipping...");
      return;
    }

    // Migrate album artists
    console.log("Migrating album artists...");
    const allAlbums = await db.select().from(albums);
    
    for (const album of allAlbums) {
      if (album.artistName) {
        const artistNames = parseArtistString(album.artistName);
        
        for (let i = 0; i < artistNames.length; i++) {
          const artistName = artistNames[i];
          if (!artistName?.trim()) continue; // Skip undefined/empty artist names
          
          // Ensure artist exists
          await db.insert(artists)
            .values({ name: artistName.trim() })
            .onConflictDoNothing();
          
          // Create album-artist relationship
          await db.insert(albumsToArtists)
            .values({
              albumId: album.id,
              artistName: artistName.trim(),
              position: i,
            })
            .onConflictDoNothing();
        }
      }
    }

    // Migrate track artists
    console.log("Migrating track artists...");
    const allTracks = await db.select().from(tracks);
    
    for (const track of allTracks) {
      if (track.artistName) {
        const artistNames = parseArtistString(track.artistName);
        
        for (let i = 0; i < artistNames.length; i++) {
          const artistName = artistNames[i];
          if (!artistName?.trim()) continue; // Skip undefined/empty artist names
          
          // Ensure artist exists
          await db.insert(artists)
            .values({ name: artistName.trim() })
            .onConflictDoNothing();
          
          // Create track-artist relationship
          await db.insert(tracksToArtists)
            .values({
              trackId: track.id,
              artistName: artistName.trim(),
              position: i,
            })
            .onConflictDoNothing();
        }
      }
    }

    console.log("Multi-artist data migration completed successfully!");
  } catch (error) {
    console.error("Error during multi-artist data migration:", error);
    throw error;
  }
}