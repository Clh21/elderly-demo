package com.polyu.elderlycare.repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class WatchDataRepository {

    private final JdbcTemplate jdbcTemplate;

    public WatchDataRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Map<String, Object>> findResidentByWatchId(String watchId) {
        return firstRow(
                "SELECT id, name, status, watch_id FROM residents WHERE watch_id = ? LIMIT 1",
                watchId
        );
    }

    public Optional<Integer> findResidentIdByWatchId(String watchId) {
        return findResidentByWatchId(watchId).map(row -> ((Number) row.get("id")).intValue());
    }

    public Optional<Map<String, Object>> findLatestMinuteReading(String watchId) {
        return firstRow(
                "SELECT * FROM minute_readings WHERE watch_id = ? ORDER BY minute_slot DESC LIMIT 1",
                watchId
        );
    }

    public List<Map<String, Object>> findRecentMinuteHistory(String watchId) {
        return jdbcTemplate.queryForList(
                """
                SELECT heart_rate, temperature, body_temperature, wrist_temperature, ambient_temperature,
                       eda, eda_label, wear_status, is_charging, minute_slot AS recorded_at
                FROM minute_readings
                WHERE watch_id = ? AND minute_slot >= NOW() - INTERVAL 1 HOUR
                ORDER BY minute_slot ASC
                """,
                watchId
        );
    }

    public Optional<Map<String, Object>> findLatestHeartRate(String watchId) {
        return firstRow(
                """
                SELECT heart_rate, minute_slot, source_timestamp
                FROM minute_readings
                WHERE watch_id = ? AND heart_rate IS NOT NULL AND minute_slot >= NOW() - INTERVAL 1 HOUR
                ORDER BY minute_slot DESC LIMIT 1
                """,
                watchId
        );
    }

    public Optional<Map<String, Object>> findLatestTemperature(String watchId) {
        return firstRow(
                """
                SELECT temperature, body_temperature, wrist_temperature, ambient_temperature, minute_slot, source_timestamp
                FROM minute_readings
                WHERE watch_id = ? AND temperature IS NOT NULL AND minute_slot >= NOW() - INTERVAL 1 HOUR
                ORDER BY minute_slot DESC LIMIT 1
                """,
                watchId
        );
    }

    public Optional<Map<String, Object>> findLatestEda(String watchId) {
        return firstRow(
                """
                SELECT eda, eda_label, minute_slot, source_timestamp
                FROM minute_readings
                WHERE watch_id = ? AND eda IS NOT NULL AND minute_slot >= NOW() - INTERVAL 1 HOUR
                ORDER BY minute_slot DESC LIMIT 1
                """,
                watchId
        );
    }

    public void ensureEdaBaselineProfileTable() {
        jdbcTemplate.execute(
                """
                CREATE TABLE IF NOT EXISTS eda_baseline_profiles (
                  id BIGINT AUTO_INCREMENT PRIMARY KEY,
                  resident_id INT NOT NULL,
                  watch_id VARCHAR(50) NOT NULL,
                  stage VARCHAR(24) NOT NULL,
                  lookback_days INT NOT NULL,
                  candidate_window_count INT NOT NULL,
                  qualified_window_count INT NOT NULL,
                  selected_window_count INT NOT NULL,
                  selected_day_count INT NOT NULL,
                  selected_daypart_count INT NOT NULL,
                  baseline_median DECIMAL(6,3) NOT NULL,
                  baseline_p25 DECIMAL(6,3) NOT NULL,
                  baseline_p75 DECIMAL(6,3) NOT NULL,
                  selected_days_json JSON,
                  daypart_counts_json JSON,
                  rejection_counts_json JSON,
                  model_version VARCHAR(64) NOT NULL,
                  built_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uq_eda_baseline_watch (watch_id),
                  INDEX idx_eda_baseline_resident (resident_id),
                  CONSTRAINT fk_eda_baseline_resident FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE CASCADE
                )
                """
        );
    }

    public Optional<Map<String, Object>> findEdaBaselineProfile(String watchId) {
        return firstRow(
                """
                SELECT resident_id, watch_id, stage, lookback_days, candidate_window_count,
                       qualified_window_count, selected_window_count, selected_day_count,
                       selected_daypart_count, baseline_median, baseline_p25, baseline_p75,
                       selected_days_json, daypart_counts_json, rejection_counts_json,
                       model_version, built_at, updated_at
                FROM eda_baseline_profiles
                WHERE watch_id = ?
                LIMIT 1
                """,
                watchId
        );
    }

    public List<Map<String, Object>> findEdaBaselineCandidateRows(String watchId, LocalDateTime cutoff) {
        return jdbcTemplate.queryForList(
                """
                SELECT minute_slot, source_timestamp, eda, eda_label, eda_valid_sample_count,
                       wear_status, is_charging, heart_rate, body_temperature, temperature_status
                FROM minute_readings
                WHERE watch_id = ?
                  AND minute_slot >= ?
                  AND eda IS NOT NULL
                ORDER BY minute_slot ASC
                """,
                watchId,
                Timestamp.valueOf(cutoff)
        );
    }

    public void upsertEdaBaselineProfile(Object[] args) {
        jdbcTemplate.update(
                """
                INSERT INTO eda_baseline_profiles (
                    resident_id, watch_id, stage, lookback_days,
                    candidate_window_count, qualified_window_count,
                    selected_window_count, selected_day_count, selected_daypart_count,
                    baseline_median, baseline_p25, baseline_p75,
                    selected_days_json, daypart_counts_json, rejection_counts_json,
                    model_version, built_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    resident_id = VALUES(resident_id),
                    stage = VALUES(stage),
                    lookback_days = VALUES(lookback_days),
                    candidate_window_count = VALUES(candidate_window_count),
                    qualified_window_count = VALUES(qualified_window_count),
                    selected_window_count = VALUES(selected_window_count),
                    selected_day_count = VALUES(selected_day_count),
                    selected_daypart_count = VALUES(selected_daypart_count),
                    baseline_median = VALUES(baseline_median),
                    baseline_p25 = VALUES(baseline_p25),
                    baseline_p75 = VALUES(baseline_p75),
                    selected_days_json = VALUES(selected_days_json),
                    daypart_counts_json = VALUES(daypart_counts_json),
                    rejection_counts_json = VALUES(rejection_counts_json),
                    model_version = VALUES(model_version),
                    built_at = VALUES(built_at),
                    updated_at = NOW()
                """,
                args
        );
    }

    public Optional<Map<String, Object>> findLatestWear(String watchId) {
        return firstRow(
                """
                SELECT wear_status, is_charging, charge_source, battery_level_percent, minute_slot, source_timestamp
                FROM minute_readings
                WHERE watch_id = ? AND wear_status IS NOT NULL
                ORDER BY minute_slot DESC LIMIT 1
                """,
                watchId
        );
    }

    public Optional<Map<String, Object>> findLatestEcg(String watchId) {
        return firstRow(
                """
                SELECT id, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result, recorded_at, source_timestamp
                FROM watch_readings
                WHERE watch_id = ? AND sensor_type = 'ecg'
                ORDER BY recorded_at DESC LIMIT 1
                """,
                watchId
        );
    }

    public int countEcgHistory(String watchId) {
        Number total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) AS total FROM watch_readings WHERE watch_id = ? AND sensor_type = 'ecg'",
                Number.class,
                watchId
        );
        return total == null ? 0 : total.intValue();
    }

    public List<Map<String, Object>> findEcgHistory(String watchId, int limit, int offset) {
        return jdbcTemplate.queryForList(
                """
                SELECT id, recorded_at, source_timestamp, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result
                FROM watch_readings
                WHERE watch_id = ? AND sensor_type = 'ecg'
                ORDER BY recorded_at DESC
                LIMIT ? OFFSET ?
                """,
                watchId, limit, offset
        );
    }

    public Optional<Map<String, Object>> findEcgHistoryDetail(String watchId, Long readingId) {
        return firstRow(
                """
                SELECT id, recorded_at, source_timestamp, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result
                FROM watch_readings
                WHERE watch_id = ? AND sensor_type = 'ecg' AND id = ?
                LIMIT 1
                """,
                watchId, readingId
        );
    }

    public List<Map<String, Object>> findNextEcgRowsByWatchId(String watchId, Long afterId, int limit) {
        return jdbcTemplate.queryForList(
                """
                SELECT id, watch_id, source_timestamp, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result, recorded_at
                FROM watch_readings
                WHERE watch_id = ? AND sensor_type = 'ecg' AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                watchId, afterId == null ? 0L : afterId, limit
        );
    }

    public List<Map<String, Object>> findNextEcgRows(Long afterId, int limit) {
        return jdbcTemplate.queryForList(
                """
                SELECT id, watch_id, source_timestamp, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result, recorded_at
                FROM watch_readings
                WHERE sensor_type = 'ecg' AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                afterId == null ? 0L : afterId, limit
        );
    }

    public List<Map<String, Object>> findNextEdaRowsByWatchId(String watchId, Long afterId, int limit) {
        return jdbcTemplate.queryForList(
                """
                SELECT id, watch_id, source_timestamp, eda_valid_sample_count, raw_payload, recorded_at
                FROM watch_readings
                WHERE watch_id = ? AND sensor_type = 'eda' AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                watchId, afterId == null ? 0L : afterId, limit
        );
    }

    public List<Map<String, Object>> findNextEdaRows(Long afterId, int limit) {
        return jdbcTemplate.queryForList(
                """
                SELECT id, watch_id, source_timestamp, eda_valid_sample_count, raw_payload, recorded_at
                FROM watch_readings
                WHERE sensor_type = 'eda' AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                afterId == null ? 0L : afterId, limit
        );
    }

    public int updateEcgReadingAnalysis(Long readingId, Double ecgHeartRate, Integer ecgSampleCount, String ecgResult, String rawPayload) {
        return jdbcTemplate.update(
                """
                UPDATE watch_readings
                SET ecg_heart_rate = ?,
                    ecg_sample_count = ?,
                    ecg_result = ?,
                    raw_payload = ?
                WHERE id = ?
                """,
                ecgHeartRate,
                ecgSampleCount,
                ecgResult,
                rawPayload,
                readingId
        );
    }

    public int updateEdaReadingValidSampleCount(Long readingId, Integer validSampleCount, String rawPayload) {
        return jdbcTemplate.update(
                """
                UPDATE watch_readings
                SET eda_valid_sample_count = ?,
                    raw_payload = COALESCE(?, raw_payload)
                WHERE id = ?
                """,
                validSampleCount,
                rawPayload,
                readingId
        );
    }

    public int updateMinuteReadingEdaValidSampleCount(String watchId, LocalDateTime minuteSlot, Integer validSampleCount) {
        return jdbcTemplate.update(
                """
                UPDATE minute_readings
                SET eda_valid_sample_count = ?,
                    updated_at = NOW()
                WHERE watch_id = ?
                  AND minute_slot = ?
                  AND eda IS NOT NULL
                """,
                validSampleCount,
                watchId,
                Timestamp.valueOf(minuteSlot)
        );
    }

    public int deleteEcgHistoryRecord(String watchId, Long readingId) {
        return jdbcTemplate.update(
                "DELETE FROM watch_readings WHERE watch_id = ? AND sensor_type = 'ecg' AND id = ?",
                watchId, readingId
        );
    }

    public List<Map<String, Object>> findAvailableMetricDates(String watchId, String column) {
        String sql = """
                    SELECT DISTINCT DATE_FORMAT(minute_slot, '%%Y-%%m-%%d') AS day
                FROM minute_readings
                WHERE watch_id = ? AND %s IS NOT NULL
                ORDER BY day DESC
                """.formatted(column);
        return jdbcTemplate.queryForList(sql, watchId);
    }

    public List<Map<String, Object>> findMetricRows(String watchId, String metricKey, String column, String selectedDate) {
        String sql;
        if ("wearStatus".equals(metricKey)) {
            sql = """
                    SELECT minute_slot, source_timestamp, wear_status, is_charging
                    FROM minute_readings
                    WHERE watch_id = ?
                      AND wear_status IS NOT NULL
                      AND DATE(minute_slot) = ?
                    ORDER BY minute_slot ASC
                    """;
        } else {
            String extra = "eda".equals(metricKey) ? ", eda_label" : "";
            sql = """
                    SELECT minute_slot, source_timestamp, %s%s
                    FROM minute_readings
                    WHERE watch_id = ?
                      AND %s IS NOT NULL
                      AND DATE(minute_slot) = ?
                    ORDER BY minute_slot ASC
                    """.formatted(column, extra, column);
        }

        return jdbcTemplate.queryForList(sql, watchId, selectedDate);
    }

    public void insertWatchReading(Object[] args) {
        jdbcTemplate.update(
                """
                INSERT INTO watch_readings
                    (resident_id, watch_id, sensor_type, event_type, source_timestamp,
                     heart_rate, heart_rate_status, temperature, body_temperature, wrist_temperature,
                     ambient_temperature, temperature_status, eda, eda_label, eda_valid_sample_count,
                     wear_status, is_charging, charge_source, battery_level_percent,
                     ecg_heart_rate, ecg_sample_count, ecg_result, raw_payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                args
        );
    }

    public void upsertMinuteReading(String updateClause, Object[] args) {
        String sql = """
                INSERT INTO minute_readings
                    (resident_id, watch_id, minute_slot, sensor_type, event_type, source_timestamp,
                     heart_rate, heart_rate_status, temperature, body_temperature, wrist_temperature,
                     ambient_temperature, temperature_status, eda, eda_label, eda_valid_sample_count,
                     wear_status, is_charging, charge_source, battery_level_percent,
                     ecg_heart_rate, ecg_sample_count, ecg_result, raw_payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE %s
                """.formatted(updateClause);
        jdbcTemplate.update(sql, args);
    }

    public void insertLegacyWatchReading(Object[] args) {
        jdbcTemplate.update(
                """
                INSERT INTO watch_readings (resident_id, watch_id, heart_rate, temperature, eda, wear_status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                args
        );
    }

    public Optional<Map<String, Object>> findActiveAlert(Integer residentId, String type, String message) {
        return firstRow(
                "SELECT id, severity FROM alerts WHERE resident_id = ? AND type = ? AND message = ? AND status = 'active' LIMIT 1",
                residentId, type, message
        );
    }

    public void createAlert(Integer residentId, String type, String severity, String message) {
        jdbcTemplate.update(
                "INSERT INTO alerts (resident_id, type, severity, message, status) VALUES (?, ?, ?, ?, 'active')",
                residentId, type, severity, message
        );
    }

    public void updateAlertSeverity(Integer id, String severity) {
        jdbcTemplate.update(
                "UPDATE alerts SET severity = ? WHERE id = ?",
                severity, id
        );
    }

    public void resolveAlert(Integer id) {
        jdbcTemplate.update(
                "UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = ?",
                id
        );
    }

    public void ensureAlertTypeEnum() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("SHOW COLUMNS FROM alerts LIKE 'type'");
        String columnType = rows.isEmpty() || rows.get(0).get("Type") == null ? "" : rows.get(0).get("Type").toString();
        if (!columnType.contains("'data_gap'")) {
            jdbcTemplate.update(
                    "ALTER TABLE alerts MODIFY COLUMN type ENUM('heart_rate','temperature','eda','fall_detection','wear_status','data_gap') NOT NULL"
            );
        }
    }

    public void seedDemoMinuteReading(Integer residentId, String slot, double heartRate, double temperature, double eda) {
        jdbcTemplate.update(
                """
                INSERT INTO minute_readings
                    (resident_id, watch_id, minute_slot, heart_rate, temperature, body_temperature, eda, wear_status)
                VALUES (?, 'demo-watch-001', ?, ?, ?, ?, ?, 'worn')
                ON DUPLICATE KEY UPDATE
                    heart_rate = VALUES(heart_rate),
                    temperature = VALUES(temperature),
                    body_temperature = VALUES(body_temperature),
                    eda = VALUES(eda),
                    updated_at = NOW()
                """,
                residentId, slot, heartRate, temperature, temperature, eda
        );
    }

    private Optional<Map<String, Object>> firstRow(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, args);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }
}