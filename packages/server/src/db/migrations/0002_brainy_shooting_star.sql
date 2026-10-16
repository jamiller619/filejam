ALTER TABLE `entries` ADD `app_tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `os_tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `embedded_tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `tag_read_error` text;