/**
 * Script to run the multi-artist migration
 * Run this with: npx tsx src/db/migrations/run-migration.ts
 */

import { migrateToMultiArtist } from "./multi-artist-migration";

async function main() {
  try {
    await migrateToMultiArtist();
    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();