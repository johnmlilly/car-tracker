-- Corolla tracks transmission fluid (owner decision 2026-11-11): 60,000 mi / 72 months.
-- Corolla only; the Odyssey schedule is unchanged.
INSERT INTO `schedule_items` (`vehicle_id`, `service_id`, `interval_miles`, `interval_months`)
SELECT v.`id`, s.`id`, 60000, 72
FROM `vehicles` v
JOIN `services` s ON s.`name` = 'Transmission fluid'
WHERE v.`name` = '2019 Toyota Corolla';
