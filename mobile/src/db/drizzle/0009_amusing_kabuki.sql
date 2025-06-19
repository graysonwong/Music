CREATE TABLE `albums_to_artists` (
	`album_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`album_id`, `artist_name`),
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_name`) REFERENCES `artists`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tracks_to_artists` (
	`track_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`track_id`, `artist_name`),
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_name`) REFERENCES `artists`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`artist_name` text,
	`release_year` integer DEFAULT -1,
	`artwork` text GENERATED ALWAYS AS (coalesce("alt_artwork", "embedded_artwork")) VIRTUAL,
	`embedded_artwork` text,
	`alt_artwork` text,
	`is_favorite` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`artist_name`) REFERENCES `artists`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_albums`("id", "name", "artist_name", "release_year", "embedded_artwork", "alt_artwork", "is_favorite") SELECT "id", "name", "artist_name", "release_year", "embedded_artwork", "alt_artwork", "is_favorite" FROM `albums`;
--> statement-breakpoint
DROP TABLE `albums`;
--> statement-breakpoint
ALTER TABLE `__new_albums` RENAME TO `albums`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_name_release_year_unique` ON `albums` (`name`,`release_year`);