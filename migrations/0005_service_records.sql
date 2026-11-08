CREATE TABLE `service_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_record_id` integer NOT NULL,
	`description` text NOT NULL,
	`service_id` integer,
	`amount_cents` integer,
	FOREIGN KEY (`service_record_id`) REFERENCES `service_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_items_service_record_id_idx` ON `service_items` (`service_record_id`);--> statement-breakpoint
CREATE TABLE `service_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`date` text NOT NULL,
	`odometer` integer,
	`shop` text,
	`total_cents` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_records_vehicle_id_date_idx` ON `service_records` (`vehicle_id`,`date`);--> statement-breakpoint
ALTER TABLE `due_items` ADD `closed_by_service_item_id` integer REFERENCES service_items(id);--> statement-breakpoint
ALTER TABLE `odometer_logs` ADD `service_record_id` integer REFERENCES service_records(id);