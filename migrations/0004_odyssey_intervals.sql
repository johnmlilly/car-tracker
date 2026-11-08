-- The Odyssey starts with the Corolla's interval schedule (plan change 2026-11-07).
-- Intervals are pending verification against the Odyssey owner's manual.
INSERT INTO `schedule_items` (`vehicle_id`, `service_id`, `interval_miles`, `interval_months`)
SELECT o.`id`, c.`service_id`, c.`interval_miles`, c.`interval_months`
FROM `schedule_items` c
JOIN `vehicles` cv ON cv.`id` = c.`vehicle_id` AND cv.`name` = '2019 Toyota Corolla'
JOIN `vehicles` o ON o.`name` = '2024 Honda Odyssey';
