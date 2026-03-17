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
  heart_rate    DECIMAL(5,1),
  temperature   DECIMAL(4,1),
  eda           DECIMAL(5,2),
  wear_status   ENUM('worn','not_worn') DEFAULT 'worn',
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
  (3, 'Robert Johnson', 75, '103', 'real-watch-003', '+1-555-0125', 'active'),
  (4, 'Mary Wilson',    80, '104', 'real-watch-004', '+1-555-0126', 'active'),
  (5, 'Demo Patient',   70, 'Demo','demo-watch-001', '+1-555-0127', 'demo');

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
  heart_rate    DECIMAL(5,1),
  temperature   DECIMAL(4,1),
  eda           DECIMAL(5,2),
  wear_status   ENUM('worn','not_worn') DEFAULT 'worn',
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_watch_minute (watch_id, minute_slot),
  INDEX idx_watch_time (watch_id, minute_slot),
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
);
