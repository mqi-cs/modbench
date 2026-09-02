CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`slots` text NOT NULL,
	`created_at` integer NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "builds_id_length_check" CHECK(length("builds"."id") = 8)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
