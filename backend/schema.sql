-- Elderly Care System - MySQL Schema
-- Database: elderly

USE elderly;

-- ============================================================
-- Table: residents
-- Stores basic info about each elderly resident
-- ============================================================
CREATE TABLE IF NOT EXISTS residents (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  age         INT           NOT NULL,
  room        VARCHAR(20)   NOT NULL,
  watch_id    VARCHAR(50)   UNIQUE NOT NULL,
  emergency_contact VARCHAR(30),
  status      ENUM('active','inactive','demo') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: watch_readings
-- Stores every sensor reading from a smart watch
-- ============================================================
CREATE TABLE IF NOT EXISTS watch_readings (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  resident_id   INT           NOT NULL,
  watch_id      VARCHAR(50)   NOT NULL,
  sensor_type   VARCHAR(32),
  event_type    VARCHAR(32),
  source_timestamp BIGINT,
  heart_rate    DECIMAL(5,1),
  heart_rate_status INT,
  temperature   DECIMAL(4,1),
  body_temperature DECIMAL(4,1),
  wrist_temperature DECIMAL(4,1),
  ambient_temperature DECIMAL(4,1),
  temperature_status VARCHAR(64),
  eda           DECIMAL(5,2),
  eda_label     VARCHAR(32),
  eda_valid_sample_count INT,
  wear_status   ENUM('worn','not_worn') DEFAULT 'worn',
  is_charging   BOOLEAN,
  charge_source VARCHAR(32),
  battery_level_percent INT,
  ecg_heart_rate DECIMAL(5,1),
  ecg_sample_count INT,
  ecg_result VARCHAR(64),
  raw_payload   JSON,
  recorded_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_resident_time (resident_id, recorded_at),
  INDEX idx_watch_time    (watch_id, recorded_at),
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

-- ============================================================
-- Table: alerts
-- Stores health alerts triggered by abnormal readings
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  resident_id   INT           NOT NULL,
  type          ENUM('heart_rate','temperature','eda','fall_detection','wear_status') NOT NULL,
  severity      ENUM('warning','critical') NOT NULL,
  message       VARCHAR(255)  NOT NULL,
  status        ENUM('active','resolved') DEFAULT 'active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME,
  INDEX idx_resident (resident_id),
  INDEX idx_status   (status),
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

-- ============================================================
-- Table: daily_summaries
-- Pre-aggregated daily stats per resident (for history charts)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_summaries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  resident_id     INT  NOT NULL,
  summary_date    DATE NOT NULL,
  avg_heart_rate  DECIMAL(5,1),
  avg_temperature DECIMAL(4,1),
  avg_eda         DECIMAL(5,2),
  total_steps     INT DEFAULT 0,
  alert_count     INT DEFAULT 0,
  UNIQUE KEY uq_resident_date (resident_id, summary_date),
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

-- ============================================================
-- Seed: sample residents
-- ============================================================
INSERT IGNORE INTO residents (id, name, age, room, watch_id, emergency_contact, status) VALUES
  (1, 'John Doe',       78, '101', 'real-watch-001', '+1-555-0123', 'active'),
  (2, 'Jane Smith',     82, '102', 'real-watch-002', '+1-555-0124', 'active'),
  (3, 'Robert Johnson', 75, '103', 'real-watch-003', '+1-555-0125', 'inactive'),
  (4, 'Mary Wilson',    80, '104', 'real-watch-004', '+1-555-0126', 'inactive'),
  (5, 'Demo Patient',   70, 'Demo','demo-watch-001', '+1-555-0127', 'demo');

UPDATE residents
SET status = 'inactive'
WHERE watch_id IN ('real-watch-003', 'real-watch-004');

-- ============================================================
-- Table: minute_readings
-- One row per watch per minute (UPSERT every 10s, latest wins)
-- The row for minute HH:MM represents the last reading
-- received in that minute (i.e. approximately HH:MM:50).
-- ============================================================
CREATE TABLE IF NOT EXISTS minute_readings (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  resident_id   INT           NOT NULL,
  watch_id      VARCHAR(50)   NOT NULL,
  minute_slot   DATETIME      NOT NULL COMMENT 'Truncated to minute: YYYY-MM-DD HH:MM:00',
  sensor_type   VARCHAR(32),
  event_type    VARCHAR(32),
  source_timestamp BIGINT,
  heart_rate    DECIMAL(5,1),
  heart_rate_status INT,
  temperature   DECIMAL(4,1),
  body_temperature DECIMAL(4,1),
  wrist_temperature DECIMAL(4,1),
  ambient_temperature DECIMAL(4,1),
  temperature_status VARCHAR(64),
  eda           DECIMAL(5,2),
  eda_label     VARCHAR(32),
  eda_valid_sample_count INT,
  wear_status   ENUM('worn','not_worn') DEFAULT 'worn',
  is_charging   BOOLEAN,
  charge_source VARCHAR(32),
  battery_level_percent INT,
  ecg_heart_rate DECIMAL(5,1),
  ecg_sample_count INT,
  ecg_result VARCHAR(64),
  raw_payload   JSON,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_watch_minute (watch_id, minute_slot),
  INDEX idx_watch_time (watch_id, minute_slot),
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);

DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @sql = CONCAT(
      'ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ', p_definition
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('watch_readings', 'sensor_type', 'VARCHAR(32) AFTER `watch_id`');
CALL add_column_if_missing('watch_readings', 'event_type', 'VARCHAR(32) AFTER `sensor_type`');
CALL add_column_if_missing('watch_readings', 'source_timestamp', 'BIGINT AFTER `event_type`');
CALL add_column_if_missing('watch_readings', 'heart_rate_status', 'INT AFTER `heart_rate`');
CALL add_column_if_missing('watch_readings', 'body_temperature', 'DECIMAL(4,1) AFTER `temperature`');
CALL add_column_if_missing('watch_readings', 'wrist_temperature', 'DECIMAL(4,1) AFTER `temperature`');
CALL add_column_if_missing('watch_readings', 'ambient_temperature', 'DECIMAL(4,1) AFTER `wrist_temperature`');
CALL add_column_if_missing('watch_readings', 'temperature_status', 'VARCHAR(64) AFTER `ambient_temperature`');
CALL add_column_if_missing('watch_readings', 'eda_label', 'VARCHAR(32) AFTER `eda`');
CALL add_column_if_missing('watch_readings', 'eda_valid_sample_count', 'INT AFTER `eda_label`');
CALL add_column_if_missing('watch_readings', 'is_charging', 'BOOLEAN AFTER `wear_status`');
CALL add_column_if_missing('watch_readings', 'charge_source', 'VARCHAR(32) AFTER `is_charging`');
CALL add_column_if_missing('watch_readings', 'battery_level_percent', 'INT AFTER `charge_source`');
CALL add_column_if_missing('watch_readings', 'ecg_heart_rate', 'DECIMAL(5,1) AFTER `battery_level_percent`');
CALL add_column_if_missing('watch_readings', 'ecg_sample_count', 'INT AFTER `ecg_heart_rate`');
CALL add_column_if_missing('watch_readings', 'ecg_result', 'VARCHAR(64) AFTER `ecg_sample_count`');
CALL add_column_if_missing('watch_readings', 'raw_payload', 'JSON AFTER `battery_level_percent`');

CALL add_column_if_missing('minute_readings', 'sensor_type', 'VARCHAR(32) AFTER `minute_slot`');
CALL add_column_if_missing('minute_readings', 'event_type', 'VARCHAR(32) AFTER `sensor_type`');
CALL add_column_if_missing('minute_readings', 'source_timestamp', 'BIGINT AFTER `event_type`');
CALL add_column_if_missing('minute_readings', 'heart_rate_status', 'INT AFTER `heart_rate`');
CALL add_column_if_missing('minute_readings', 'body_temperature', 'DECIMAL(4,1) AFTER `temperature`');
CALL add_column_if_missing('minute_readings', 'wrist_temperature', 'DECIMAL(4,1) AFTER `temperature`');
CALL add_column_if_missing('minute_readings', 'ambient_temperature', 'DECIMAL(4,1) AFTER `wrist_temperature`');
CALL add_column_if_missing('minute_readings', 'temperature_status', 'VARCHAR(64) AFTER `ambient_temperature`');
CALL add_column_if_missing('minute_readings', 'eda_label', 'VARCHAR(32) AFTER `eda`');
CALL add_column_if_missing('minute_readings', 'eda_valid_sample_count', 'INT AFTER `eda_label`');
CALL add_column_if_missing('minute_readings', 'is_charging', 'BOOLEAN AFTER `wear_status`');
CALL add_column_if_missing('minute_readings', 'charge_source', 'VARCHAR(32) AFTER `is_charging`');
CALL add_column_if_missing('minute_readings', 'battery_level_percent', 'INT AFTER `charge_source`');
CALL add_column_if_missing('minute_readings', 'ecg_heart_rate', 'DECIMAL(5,1) AFTER `battery_level_percent`');
CALL add_column_if_missing('minute_readings', 'ecg_sample_count', 'INT AFTER `ecg_heart_rate`');
CALL add_column_if_missing('minute_readings', 'ecg_result', 'VARCHAR(64) AFTER `ecg_sample_count`');
CALL add_column_if_missing('minute_readings', 'raw_payload', 'JSON AFTER `battery_level_percent`');

DROP PROCEDURE IF EXISTS add_column_if_missing;
