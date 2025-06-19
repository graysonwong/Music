/**
 * Migration script to populate multi-artist junction tables with existing data
 */

import { db } from "../index";
import { albums, artists, tracks, albumsToArtists, tracksToArtists } from "../schema";
import { parseArtistString } from "~/utils/artists";

export async function migrateToMultiArtist() {
  console.log("Starting multi-artist migration...");

  try {
    // Migrate album artists
    console.log("Migrating album artists...");
    const allAlbums = await db.select().from(albums);
    
    for (const album of allAlbums) {
      if (album.artistName) {
        const artistNames = parseArtistString(album.artistName);
        
        for (let i = 0; i < artistNames.length; i++) {
          const artistName = artistNames[i];
          if (!artistName) continue; // Skip undefined/empty artist names
          
          // Ensure artist exists
          await db.insert(artists)
            .values({ name: artistName })
            .onConflictDoNothing();
          
          // Create album-artist relationship
          await db.insert(albumsToArtists)
            .values({
              albumId: album.id,
              artistName: artistName,
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
          if (!artistName) continue; // Skip undefined/empty artist names
          
          // Ensure artist exists
          await db.insert(artists)
            .values({ name: artistName })
            .onConflictDoNothing();
          
          // Create track-artist relationship
          await db.insert(tracksToArtists)
            .values({
              trackId: track.id,
              artistName: artistName,
              position: i,
            })
            .onConflictDoNothing();
        }
      }
    }

    console.log("Multi-artist migration completed successfully!");
  } catch (error) {
    console.error("Error during multi-artist migration:", error);
    throw error;
  }
}