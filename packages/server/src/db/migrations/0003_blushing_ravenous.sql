CREATE TABLE `collection_entries` (
	`collection_id` text NOT NULL,
	`entry_id` integer NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `entry_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);

--> statement-breakpoint
INSERT INTO collections (id, name) VALUES ('recents', 'Recents'), ('favorites', 'Favorites');
