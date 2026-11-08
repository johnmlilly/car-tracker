CREATE TABLE `due_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`minder_log_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	FOREIGN KEY (`minder_log_id`) REFERENCES `minder_logs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `due_items_minder_log_id_service_id_unique` ON `due_items` (`minder_log_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `minder_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`code` text NOT NULL,
	`logged_at` text NOT NULL,
	`odometer` integer,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `minder_logs_vehicle_id_logged_at_idx` ON `minder_logs` (`vehicle_id`,`logged_at`);