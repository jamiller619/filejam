DROP INDEX IF EXISTS `entries_library_path_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `entries_volume_path_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `entries_parent_name_idx`;
--> statement-breakpoint
ALTER TABLE `entries` RENAME COLUMN `relative_path` TO `stored_relative_path`;
--> statement-breakpoint
ALTER TABLE `entries` ADD `parent_path` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `entries` ADD `display_name` text;
--> statement-breakpoint
UPDATE `entries`
SET
	`parent_path` = CASE
		WHEN instr(`stored_relative_path`, '/') = 0 THEN ''
		ELSE rtrim(rtrim(`stored_relative_path`, replace(`stored_relative_path`, '/', '')), '/')
	END,
	`display_name` = CASE
		WHEN `stored_relative_path` = '' THEN `name`
		WHEN `name` = substr(
			`stored_relative_path`,
			length(rtrim(`stored_relative_path`, replace(`stored_relative_path`, '/', ''))) + 1
		) THEN NULL
		ELSE substr(
			`stored_relative_path`,
			length(rtrim(`stored_relative_path`, replace(`stored_relative_path`, '/', ''))) + 1
		)
	END,
	`name` = CASE
		WHEN `stored_relative_path` = '' THEN ''
		ELSE substr(
			`stored_relative_path`,
			length(rtrim(`stored_relative_path`, replace(`stored_relative_path`, '/', ''))) + 1
		)
	END;
--> statement-breakpoint
ALTER TABLE `entries` DROP COLUMN `stored_relative_path`;
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_volume_parent_name_unique` ON `entries` (`volume_id`, `parent_path`, `name`);
--> statement-breakpoint
CREATE INDEX `entries_parent_name_idx` ON `entries` (`parent_id`, `name`);
