CREATE TABLE `submitted_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`family` text NOT NULL,
	`name` text NOT NULL,
	`attributes` text NOT NULL,
	`spec_source` text NOT NULL,
	`platform` text NOT NULL,
	`item_id` text NOT NULL,
	`source_url` text NOT NULL,
	`extraction` text NOT NULL,
	`review_state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "submitted_parts_category_check" CHECK(category IN ('movement', 'case', 'dial', 'hands', 'bezel_insert', 'bezel', 'crystal', 'chapter_ring', 'crown', 'strap')),
	CONSTRAINT "submitted_parts_spec_source_check" CHECK(spec_source IN ('marketplace-stated', 'user-entered')),
	CONSTRAINT "submitted_parts_platform_check" CHECK(platform IN ('ebay', 'aliexpress')),
	CONSTRAINT "submitted_parts_review_state_check" CHECK(review_state IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `submitted_parts_review_state_idx` ON `submitted_parts` (`review_state`);