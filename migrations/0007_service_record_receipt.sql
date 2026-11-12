ALTER TABLE `service_records` ADD `minder_code` text;--> statement-breakpoint
ALTER TABLE `service_records` ADD `receipt_id` integer REFERENCES receipts(id);--> statement-breakpoint
CREATE UNIQUE INDEX `service_records_receipt_id_unique` ON `service_records` (`receipt_id`);