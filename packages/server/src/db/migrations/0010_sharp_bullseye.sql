ALTER TABLE `libraries` ADD `type_id` text;
--> statement-breakpoint
UPDATE `libraries` SET `type_id` = 'applications' WHERE lower(`name`) = 'applications';
