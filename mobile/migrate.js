const { drizzle } = require('drizzle-orm/expo-sqlite');
const { openDatabaseSync } = require('expo-sqlite');
const { eq } = require('drizzle-orm');

// Simple artist parsing function
function parseArtistString(artistString) {
  if (!artistString) return [];
  
  // Split by "; " first (higher priority), then by ", "
  let artists = artistString.split('; ');
  if (artists.length === 1) {
    artists = artistString.split(', ');
  }
  
  return artists
    .map(artist => artist.trim())
    .filter(artist => artist.length > 0);
}

// Database schema definitions (simplified)
const albums = {
  id: 'id',
  name: 'name',
  artistName: 'artistName',
  releaseYear: 'releaseYear',
  embeddedArtwork: 'embeddedArtwork',
  altArtwork: 'altArtwork',
  isFavorite: 'isFavorite',
  artwork: 'artwork'
};

const tracks = {
  id: 'id',
  name: 'name',
  artistName: 'artistName',
  duration: 'duration',
  artwork: 'artwork',
  isFavorite: 'isFavorite',
  albumId: 'albumId',
  disc: 'disc',
  track: 'track',
  format: 'format',
  bitrate: 'bitrate',
  sampleRate: 'sampleRate',
  size: 'size',
  uri: 'uri',
  modificationTime: 'modificationTime',
  fetchedArt: 'fetchedArt',
  parentFolder: 'parentFolder'
};

const artists = {
  name: 'name',
  artwork: 'artwork'
};

const albumsToArtists = {
  albumId: 'albumId',
  artistName: 'artistName',
  position: 'position'
};

const tracksToArtists = {
  trackId: 'trackId',
  artistName: 'artistName',
  position: 'position'
};

async function runMigration() {
  try {
    console.log('Starting multi-artist migration...');
    
    // Open database
    const database = openDatabaseSync('music.db');
    const db = drizzle(database);
    
    // Get all albums with artist names
    console.log('Migrating album artists...');
    const allAlbums = await db.select().from('albums');
    
    for (const album of allAlbums) {
      if (album.artistName) {
        const artistNames = parseArtistString(album.artistName);
        console.log(`Processing album "${album.name}" with artists: ${artistNames.join(', ')}`);
        
        for (let i = 0; i < artistNames.length; i++) {
          const artistName = artistNames[i];
          if (!artistName) continue;
          
          // Insert artist if not exists
          try {
            await db.run(`INSERT OR IGNORE INTO artists (name, artwork) VALUES (?, NULL)`, [artistName]);
          } catch (e) {
            console.log(`Artist ${artistName} already exists`);
          }
          
          // Insert album-artist relationship
          try {
            await db.run(`INSERT OR IGNORE INTO albums_to_artists (albumId, artistName, position) VALUES (?, ?, ?)`, 
              [album.id, artistName, i]);
          } catch (e) {
            console.log(`Album-artist relationship already exists: ${album.id} - ${artistName}`);
          }
        }
      }
    }
    
    // Get all tracks with artist names
    console.log('Migrating track artists...');
    const allTracks = await db.select().from('tracks');
    
    for (const track of allTracks) {
      if (track.artistName) {
        const artistNames = parseArtistString(track.artistName);
        console.log(`Processing track "${track.name}" with artists: ${artistNames.join(', ')}`);
        
        for (let i = 0; i < artistNames.length; i++) {
          const artistName = artistNames[i];
          if (!artistName) continue;
          
          // Insert artist if not exists
          try {
            await db.run(`INSERT OR IGNORE INTO artists (name, artwork) VALUES (?, NULL)`, [artistName]);
          } catch (e) {
            console.log(`Artist ${artistName} already exists`);
          }
          
          // Insert track-artist relationship
          try {
            await db.run(`INSERT OR IGNORE INTO tracks_to_artists (trackId, artistName, position) VALUES (?, ?, ?)`, 
              [track.id, artistName, i]);
          } catch (e) {
            console.log(`Track-artist relationship already exists: ${track.id} - ${artistName}`);
          }
        }
      }
    }
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();