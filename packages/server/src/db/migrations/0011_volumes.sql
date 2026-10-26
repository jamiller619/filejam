ALTER TABLE `libraries` RENAME TO `volumes`;
--> statement-breakpoint
ALTER TABLE `entries` RENAME COLUMN `library_id` TO `volume_id`;
--> statement-breakpoint
ALTER TABLE `volumes` ADD `kind` text DEFAULT 'internal' NOT NULL;
--> statement-breakpoint
DROP TABLE `initialization`;
