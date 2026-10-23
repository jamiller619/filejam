DROP TABLE `collection_entries`;
--> statement-breakpoint
DROP TABLE `collections`;
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entry_states` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`last_opened_at` integer,
	`favorited_at` integer,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `collections` (`id`, `name`, `definition`, `created_at`, `updated_at`)
VALUES
	('recents', 'Recents', '{"version":1,"match":"all","rules":[{"field":"lastOpenedAt","operator":"isSet"}],"sort":[{"field":"lastOpenedAt","direction":"desc"}],"limit":null}', 1792728000000, 1792728000000),
	('favorites', 'Favorites', '{"version":1,"match":"all","rules":[{"field":"favoritedAt","operator":"isSet"}],"sort":[{"field":"favoritedAt","direction":"desc"}],"limit":null}', 1792728000000, 1792728000000);
