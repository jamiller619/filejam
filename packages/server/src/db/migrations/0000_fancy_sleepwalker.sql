CREATE TABLE `entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`library_id` integer NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`relative_path` text NOT NULL,
	`kind` text NOT NULL,
	`size` integer,
	`mime_type` text,
	`modified_at` integer,
	`indexed_at` integer NOT NULL,
	`children_scanned_at` integer,
	`children_dirty` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entries_kind_check" CHECK("entries"."kind" IN ('directory', 'file', 'symlink'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_library_path_unique` ON `entries` (`library_id`,`relative_path`);--> statement-breakpoint
CREATE INDEX `entries_parent_name_idx` ON `entries` (`parent_id`,`name`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `libraries_root_path_unique` ON `libraries` (`root_path`);