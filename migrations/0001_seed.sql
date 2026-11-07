-- Reference data. Corolla intervals and Odyssey Minder meanings are pending
-- verification against the owner's manuals; correct them in a new migration.
INSERT INTO `vehicles` (`name`, `schedule_model`) VALUES
  ('2024 Honda Odyssey', 'minder'),
  ('2019 Toyota Corolla', 'interval');
--> statement-breakpoint
INSERT INTO `services` (`name`, `keywords`) VALUES
  ('Oil and filter change', '["oil","lube","lof","synthetic"]'),
  ('Multi-point inspection', '["inspection","inspect","multi-point"]'),
  ('Tire rotation', '["rotate","rotation"]'),
  ('Engine air filter', '["engine air filter","air filter"]'),
  ('Cabin air filter', '["cabin","pollen"]'),
  ('Drive belt inspection', '["drive belt","serpentine"]'),
  ('Transmission fluid', '["transmission","atf"]'),
  ('Spark plugs', '["spark plug"]'),
  ('Valve clearance inspection', '["valve"]'),
  ('Timing belt and water pump inspection', '["timing belt","water pump"]'),
  ('Engine coolant', '["coolant","antifreeze"]'),
  ('Brake fluid', '["brake fluid"]');
--> statement-breakpoint
INSERT INTO `schedule_items` (`vehicle_id`, `service_id`, `interval_miles`, `interval_months`)
WITH i(service, miles, months) AS (VALUES
  ('Oil and filter change', 10000, 12),
  ('Tire rotation', 5000, 6),
  ('Cabin air filter', 30000, 36),
  ('Engine air filter', 30000, 36),
  ('Brake fluid', 30000, 36),
  ('Engine coolant', 100000, 120),
  ('Spark plugs', 120000, NULL)
)
SELECT v.`id`, s.`id`, i.miles, i.months
FROM i
JOIN `services` s ON s.`name` = i.service
JOIN `vehicles` v ON v.`name` = '2019 Toyota Corolla';
--> statement-breakpoint
INSERT INTO `minder_codes` (`code`, `kind`, `service_id`)
WITH m(code, kind, service) AS (VALUES
  ('A', 'main', 'Oil and filter change'),
  ('B', 'main', 'Oil and filter change'),
  ('B', 'main', 'Multi-point inspection'),
  ('1', 'sub', 'Tire rotation'),
  ('2', 'sub', 'Engine air filter'),
  ('2', 'sub', 'Cabin air filter'),
  ('2', 'sub', 'Drive belt inspection'),
  ('3', 'sub', 'Transmission fluid'),
  ('4', 'sub', 'Spark plugs'),
  ('4', 'sub', 'Valve clearance inspection'),
  ('4', 'sub', 'Timing belt and water pump inspection'),
  ('5', 'sub', 'Engine coolant'),
  ('7', 'sub', 'Brake fluid')
)
SELECT m.code, m.kind, s.`id`
FROM m
JOIN `services` s ON s.`name` = m.service;
