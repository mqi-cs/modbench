PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_families` (
	`key` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	CONSTRAINT "families_category_check" CHECK(category IN ('movement', 'case', 'dial', 'hands', 'bezel_insert', 'bezel', 'crystal', 'chapter_ring', 'crown', 'strap'))
);
--> statement-breakpoint
INSERT INTO `__new_families`("key", "category", "label", "description") SELECT "key", "category", "label", "description" FROM `families`;--> statement-breakpoint
DROP TABLE `families`;--> statement-breakpoint
ALTER TABLE `__new_families` RENAME TO `families`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_parts` (
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
	CONSTRAINT "parts_category_check" CHECK(category IN ('movement', 'case', 'dial', 'hands', 'bezel_insert', 'bezel', 'crystal', 'chapter_ring', 'crown', 'strap')),
	CONSTRAINT "parts_spec_source_check" CHECK(spec_source IN ('vendor-stated', 'family-inferred', 'manual')),
	CONSTRAINT "parts_review_state_check" CHECK(review_state IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "parts_confidence_check" CHECK(confidence IN ('high', 'medium', 'low'))
);
--> statement-breakpoint
INSERT INTO `__new_parts`("id", "category", "family", "name", "brand", "attributes", "spec_source", "confidence", "evidence", "review_state", "notes", "source_url", "created_at", "updated_at") SELECT "id", "category", "family", "name", "brand", "attributes", "spec_source", "confidence", "evidence", "review_state", "notes", "source_url", "created_at", "updated_at" FROM `parts`;--> statement-breakpoint
DROP TABLE `parts`;--> statement-breakpoint
ALTER TABLE `__new_parts` RENAME TO `parts`;--> statement-breakpoint
CREATE INDEX `parts_family_idx` ON `parts` (`family`);--> statement-breakpoint
CREATE INDEX `parts_review_state_idx` ON `parts` (`review_state`);