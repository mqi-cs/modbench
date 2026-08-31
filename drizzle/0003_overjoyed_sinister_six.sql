CREATE TABLE `part_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_part_id` text NOT NULL,
	`merged_part_name` text NOT NULL,
	`merged_source_url` text NOT NULL,
	`merged_vendor_key` text NOT NULL,
	`merged_attributes` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`canonical_part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
