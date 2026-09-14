CREATE TABLE `merge_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`part_ids` text NOT NULL,
	`submitted_urls` text NOT NULL,
	`unresolved_urls` text NOT NULL,
	`source` text NOT NULL,
	`phash_distance` integer,
	`colour_agreement` text,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_note` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	CONSTRAINT "merge_candidates_status_check" CHECK(status IN ('pending', 'accepted', 'rejected')),
	CONSTRAINT "merge_candidates_source_check" CHECK(source IN ('user-link', 'phash', 'both'))
);
--> statement-breakpoint
CREATE INDEX `merge_candidates_status_idx` ON `merge_candidates` (`status`);--> statement-breakpoint
CREATE TABLE `part_hashes` (
	`part_id` text PRIMARY KEY NOT NULL,
	`phash` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
