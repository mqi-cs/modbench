CREATE TABLE `families` (
	`key` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	CONSTRAINT "families_category_check" CHECK(category IN ('movement', 'case', 'dial', 'hands', 'bezel_insert', 'crystal', 'chapter_ring', 'crown', 'strap'))
);
--> statement-breakpoint
CREATE TABLE `family_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`part_id` text NOT NULL,
	`rule_key` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "family_exceptions_severity_check" CHECK(severity IN ('error', 'warning', 'info'))
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`part_id` text NOT NULL,
	`vendor_id` text NOT NULL,
	`source_url` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`in_stock` integer NOT NULL,
	`last_checked_at` integer NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "listings_currency_len_check" CHECK(length("listings"."currency") = 3),
	CONSTRAINT "listings_price_positive_check" CHECK("listings"."price_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_part_vendor_unique` ON `listings` (`part_id`,`vendor_id`);--> statement-breakpoint
CREATE TABLE `parts` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`family` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`attributes` text NOT NULL,
	`spec_source` text NOT NULL,
	`confidence` text NOT NULL,
	`evidence` text NOT NULL,
	`review_state` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`source_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family`) REFERENCES `families`(`key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "parts_category_check" CHECK(category IN ('movement', 'case', 'dial', 'hands', 'bezel_insert', 'crystal', 'chapter_ring', 'crown', 'strap')),
	CONSTRAINT "parts_spec_source_check" CHECK(spec_source IN ('vendor-stated', 'family-inferred', 'manual')),
	CONSTRAINT "parts_review_state_check" CHECK(review_state IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "parts_confidence_check" CHECK(confidence IN ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE INDEX `parts_family_idx` ON `parts` (`family`);--> statement-breakpoint
CREATE INDEX `parts_review_state_idx` ON `parts` (`review_state`);--> statement-breakpoint
CREATE TABLE `rejected_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_key` text NOT NULL,
	`source_url` text NOT NULL,
	`product_name` text NOT NULL,
	`reason` text NOT NULL,
	`raw_payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`country` text NOT NULL,
	`shipping_flat_minor` integer NOT NULL,
	`expected_currency` text NOT NULL,
	`feed_type` text DEFAULT 'shopify' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_key_unique` ON `vendors` (`key`);