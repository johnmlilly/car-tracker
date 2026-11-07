CREATE TABLE `minder_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`service_id` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `minder_codes_code_service_id_unique` ON `minder_codes` (`code`,`service_id`);--> statement-breakpoint
CREATE TABLE `schedule_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`interval_miles` integer,
	`interval_months` integer,
	`baseline_date` text,
	`baseline_odometer` integer,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "schedule_items_interval_set" CHECK("schedule_items"."interval_miles" IS NOT NULL OR "schedule_items"."interval_months" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_items_vehicle_id_service_id_unique` ON `schedule_items` (`vehicle_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`keywords` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_name_unique` ON `services` (`name`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`schedule_model` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_name_unique` ON `vehicles` (`name`);