CREATE TABLE `odometer_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`date` text NOT NULL,
	`odometer` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `odometer_logs_vehicle_id_date_idx` ON `odometer_logs` (`vehicle_id`,`date`);