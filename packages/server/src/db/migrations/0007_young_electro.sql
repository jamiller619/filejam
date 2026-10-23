CREATE TABLE `move_items` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`source_path` text NOT NULL,
	`target_path` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`operation_id`) REFERENCES `move_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `move_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`error` text
);
