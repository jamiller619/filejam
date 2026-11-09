CREATE TABLE `entry_appearance` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`icon` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `icon_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_appearance` (
	`library_id` integer NOT NULL,
	`relative_path` text NOT NULL,
	`icon` text NOT NULL,
	PRIMARY KEY(`library_id`, `relative_path`),
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `collections` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `move_items` ADD `appearance` text;