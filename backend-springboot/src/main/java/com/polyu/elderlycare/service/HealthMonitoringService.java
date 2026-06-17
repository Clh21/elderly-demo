package com.polyu.elderlycare.service;

import com.polyu.elderlycare.repository.WatchDataRepository;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HealthMonitoringService {

    public static final String ANALYSIS_MARKER = "\n\n[AI Analysis]: ";

    private static final Logger LOGGER = LoggerFactory.getLogger(HealthMonitoringService.class);
    private static final double HR_WARNING_LOW = 50.0;
    private static final double HR_WARNING_HIGH = 100.0;
    private static final double HR_CRITICAL_LOW = 40.0;
    private static final double HR_CRITICAL_HIGH = 130.0;
    private static final double TEMP_WARNING_LOW = 35.0;
    private static final double TEMP_WARNING_HIGH = 37.8;
    private static final double TEMP_CRITICAL_LOW = 34.5;
    private static final double TEMP_CRITICAL_HIGH = 38.5;

    private final WatchDataRepository watchDataRepository;
    private final HeartRateOverrideRegistry heartRateOverrideRegistry;

    public HealthMonitoringService(
            WatchDataRepository watchDataRepository,
            HeartRateOverrideRegistry heartRateOverrideRegistry
    ) {
        this.watchDataRepository = watchDataRepository;
        this.heartRateOverrideRegistry = heartRateOverrideRegistry;
    }

    @Transactional
    public void evaluateAfterIngestion(
            Integer residentId,
            String watchId,
            String sensorType,
            String eventType,
            Integer edaValidSampleCount
    ) {
        evaluateDeviceState(residentId, watchId);

        WearContext wear = readWearContext(watchId);
        if (!wear.worn() || wear.charging()) {
            resolveHealthSignalAlerts(residentId, watchId);
            return;
        }

        if ("heart_rate".equals(sensorType)) {
            evaluateHeartRate(residentId, watchId);
        } else if ("temperature".equals(sensorType)) {
            evaluateTemperature(residentId, watchId);
        } else if ("eda".equals(sensorType)
                && (edaValidSampleCount == null
                || edaValidSampleCount >= 10 && edaValidSampleCount % 5 == 0)) {
            evaluateEda(residentId, watchId);
        }

        if ("wear_state".equals(eventType) || "power_state".equals(eventType)) {
            evaluateHeartRate(residentId, watchId);
            evaluateTemperature(residentId, watchId);
            evaluateEda(residentId, watchId);
        }
    }

    @Scheduled(initialDelay = 30_000, fixedDelay = 60_000)
    @Transactional
    public void evaluateMonitoredDevices() {
        for (Map<String, Object> resident : watchDataRepository.findMonitoredResidents()) {
            Integer residentId = toInteger(resident.get("id"));
            String watchId = asString(resident.get("watch_id"));
            if (residentId == null || watchId == null) {
                continue;
            }
            try {
                evaluateDeviceState(residentId, watchId);
                WearContext wear = readWearContext(watchId);
                if (!wear.worn() || wear.charging()) {
                    resolveHealthSignalAlerts(residentId, watchId);
                } else {
                    evaluateHeartRate(residentId, watchId);
                    evaluateTemperature(residentId, watchId);
                    evaluateEda(residentId, watchId);
                }
            } catch (RuntimeException ex) {
                LOGGER.warn("Health monitoring failed for watch {}: {}", watchId, ex.getMessage());
            }
        }
    }

    private void evaluateDeviceState(Integer residentId, String watchId) {
        LocalDateTime now = LocalDateTime.now();
        WearContext wear = readWearContext(watchId);
        LocalDateTime latestReadingAt = watchDataRepository.findLatestWatchReadingTime(watchId)
                .map(row -> toLocalDateTime(row.get("recorded_at")))
                .orElse(null);

        boolean dataGap = !wear.charging()
                && latestReadingAt != null
                && Duration.between(latestReadingAt, now).toMinutes() >= 60;
        syncAlert(
                residentId,
                "data_gap",
                "warning",
                "No watch data has been received for over one hour.",
                latestReadingAt == null
                        ? "No stored reading is available, so health status cannot be assessed."
                        : String.format(
                                Locale.US,
                                "Last watch reading was received at %s. Check Bluetooth, Wi-Fi and watch battery before treating this as a health event.",
                                latestReadingAt
                        ),
                dataGap
        );

        boolean prolongedNotWorn = !wear.charging()
                && !wear.worn()
                && wear.changedAt() != null
                && Duration.between(wear.changedAt(), now).toMinutes() >= 60;
        syncAlert(
                residentId,
                "wear_status",
                "warning",
                "The watch has not been worn for over one hour.",
                String.format(
                        Locale.US,
                        "The latest explicit wear-state change was at %s. Physiological readings collected while not worn are excluded from analysis.",
                        wear.changedAt()
                ),
                prolongedNotWorn
        );
    }

    private void evaluateHeartRate(Integer residentId, String watchId) {
        if (heartRateOverrideRegistry.find(watchId).isPresent()) {
            return;
        }

        List<Double> values = watchDataRepository
                .findRecentHeartRateReadings(watchId, LocalDateTime.now().minusMinutes(12))
                .stream()
                .map(row -> toDouble(row.get("heart_rate")))
                .filter(Objects::nonNull)
                .filter(value -> value >= 25.0 && value <= 240.0)
                .limit(3)
                .toList();

        if (values.isEmpty()) {
            syncAlert(residentId, "heart_rate", "warning", "", "", false);
            return;
        }

        double latest = values.get(0);
        long lowCount = values.stream().filter(value -> value < HR_WARNING_LOW).count();
        long highCount = values.stream().filter(value -> value > HR_WARNING_HIGH).count();
        boolean low = latest < HR_CRITICAL_LOW || values.size() >= 2 && lowCount >= 2;
        boolean high = latest > HR_CRITICAL_HIGH || values.size() >= 2 && highCount >= 2;

        if (!low && !high) {
            syncAlert(residentId, "heart_rate", "warning", "", "", false);
            return;
        }

        String direction = low ? "below" : "above";
        String severity = latest < HR_CRITICAL_LOW || latest > HR_CRITICAL_HIGH ? "critical" : "warning";
        syncAlert(
                residentId,
                "heart_rate",
                severity,
                String.format(Locale.US, "Heart rate is %s the expected range (latest %.0f bpm).", direction, latest),
                String.format(
                        Locale.US,
                        "%d of the latest %d valid readings were %s range. Confirm the resident is resting and recheck; symptoms should take priority over the wearable reading.",
                        low ? lowCount : highCount,
                        values.size(),
                        direction
                ),
                true
        );
    }

    private void evaluateTemperature(Integer residentId, String watchId) {
        List<Double> values = watchDataRepository
                .findRecentTemperatureReadings(watchId, LocalDateTime.now().minusMinutes(30))
                .stream()
                .filter(row -> {
                    String status = asString(row.get("temperature_status"));
                    return status == null || status.isBlank() || "SUCCESSFUL_MEASUREMENT".equalsIgnoreCase(status);
                })
                .map(row -> toDouble(row.get("body_temperature")))
                .filter(Objects::nonNull)
                .filter(value -> value >= 30.0 && value <= 43.0)
                .limit(3)
                .toList();

        if (values.isEmpty()) {
            syncAlert(residentId, "temperature", "warning", "", "", false);
            return;
        }

        double latest = values.get(0);
        long lowCount = values.stream().filter(value -> value <= TEMP_WARNING_LOW).count();
        long highCount = values.stream().filter(value -> value >= TEMP_WARNING_HIGH).count();
        boolean low = values.size() >= 2 && lowCount >= 2;
        boolean high = values.size() >= 2 && highCount >= 2;

        if (!low && !high) {
            syncAlert(residentId, "temperature", "warning", "", "", false);
            return;
        }

        String direction = low ? "below" : "above";
        String severity = latest <= TEMP_CRITICAL_LOW || latest >= TEMP_CRITICAL_HIGH ? "critical" : "warning";
        syncAlert(
                residentId,
                "temperature",
                severity,
                String.format(Locale.US, "Estimated body temperature is %s range (latest %.1f C).", direction, latest),
                String.format(
                        Locale.US,
                        "%d of the latest %d successful measurements were %s range while the watch was worn. Confirm with a clinical thermometer.",
                        low ? lowCount : highCount,
                        values.size(),
                        direction
                ),
                true
        );
    }

    private void evaluateEda(Integer residentId, String watchId) {
        List<Map<String, Object>> rows = watchDataRepository.findRecentEdaReadings(
                watchId,
                LocalDateTime.now().minusMinutes(2)
        );
        if (rows.isEmpty()) {
            syncAlert(residentId, "eda", "warning", "", "", false);
            return;
        }

        List<Map<String, Object>> latestSession = latestEdaSession(rows);
        List<Double> values = latestSession.stream()
                .map(row -> toDouble(row.get("eda")))
                .filter(Objects::nonNull)
                .filter(value -> value > 0.0 && value <= 5.0)
                .toList();
        if (values.size() < 10) {
            return;
        }

        double median = median(values);
        long highCount = values.stream().filter(value -> value >= 2.0).count();
        double highRatio = highCount / (double) values.size();
        boolean sustainedHigh = median >= 2.0 && highRatio >= 0.7;
        boolean recovered = median < 1.5 && highRatio < 0.3;

        if (sustainedHigh) {
            syncAlert(
                    residentId,
                    "eda",
                    "warning",
                    String.format(Locale.US, "EDA shows a sustained elevated response (median %.2f uS).", median),
                    String.format(
                            Locale.US,
                            "%d valid samples were reviewed; %.0f%% were at or above 2.0 uS. This may reflect stress or activity, so interpret it together with heart rate and the resident's condition.",
                            values.size(),
                            highRatio * 100.0
                    ),
                    true
            );
        } else if (recovered) {
            syncAlert(residentId, "eda", "warning", "", "", false);
        }
    }

    private List<Map<String, Object>> latestEdaSession(List<Map<String, Object>> rows) {
        List<Map<String, Object>> session = new ArrayList<>();
        LocalDateTime previousAt = null;
        Integer previousCount = null;

        for (Map<String, Object> row : rows) {
            LocalDateTime currentAt = toLocalDateTime(row.get("recorded_at"));
            Integer currentCount = toInteger(row.get("eda_valid_sample_count"));
            boolean newSession = previousAt != null
                    && (Duration.between(previousAt, currentAt).toSeconds() > 8
                    || currentCount != null && previousCount != null && currentCount <= previousCount);
            if (newSession) {
                session.clear();
            }
            session.add(row);
            previousAt = currentAt;
            previousCount = currentCount;
        }
        return session;
    }

    private WearContext readWearContext(String watchId) {
        Optional<Map<String, Object>> wearRow = watchDataRepository.findLatestExplicitWearState(watchId);
        Optional<Map<String, Object>> powerRow = watchDataRepository.findLatestPowerState(watchId);
        boolean worn = wearRow
                .map(row -> "worn".equalsIgnoreCase(asString(row.get("wear_status"))))
                .orElse(true);
        boolean charging = powerRow
                .map(row -> Boolean.TRUE.equals(toBoolean(row.get("is_charging"))))
                .orElseGet(() -> wearRow
                        .map(row -> Boolean.TRUE.equals(toBoolean(row.get("is_charging"))))
                        .orElse(false));
        LocalDateTime changedAt = wearRow.map(row -> toLocalDateTime(row.get("recorded_at"))).orElse(null);
        return new WearContext(worn, charging, changedAt);
    }

    @Transactional
    public void evaluateHeartRateNow(Integer residentId, String watchId) {
        WearContext wear = readWearContext(watchId);
        if (!wear.worn() || wear.charging()) {
            watchDataRepository.resolveActiveAlertsByType(residentId, "heart_rate");
            return;
        }
        evaluateHeartRate(residentId, watchId);
    }

    private void resolveHealthSignalAlerts(Integer residentId, String watchId) {
        if (heartRateOverrideRegistry.find(watchId).isEmpty()) {
            watchDataRepository.resolveActiveAlertsByType(residentId, "heart_rate");
        }
        watchDataRepository.resolveActiveAlertsByType(residentId, "temperature");
        watchDataRepository.resolveActiveAlertsByType(residentId, "eda");
    }

    private void syncAlert(
            Integer residentId,
            String type,
            String severity,
            String message,
            String analysis,
            boolean active
    ) {
        Optional<Map<String, Object>> existing = watchDataRepository.findActiveAlertByType(residentId, type);
        if (!active) {
            watchDataRepository.resolveActiveAlertsByType(residentId, type);
            return;
        }

        String finalMessage = message + ANALYSIS_MARKER + analysis;
        if (existing.isEmpty()) {
            watchDataRepository.createAlert(residentId, type, severity, finalMessage);
            existing = watchDataRepository.findActiveAlertByType(residentId, type);
        }

        if (existing.isEmpty()) {
            return;
        }

        Integer alertId = toInteger(existing.get().get("id"));
        String currentSeverity = asString(existing.get().get("severity"));
        String currentMessage = asString(existing.get().get("message"));
        if (alertId != null
                && (!Objects.equals(currentSeverity, severity) || !Objects.equals(currentMessage, finalMessage))) {
            watchDataRepository.updateAlert(alertId, severity, finalMessage);
        }
        if (alertId != null) {
            watchDataRepository.resolveDuplicateActiveAlerts(residentId, type, alertId);
        }
    }

    private double median(List<Double> values) {
        List<Double> sorted = values.stream().sorted(Comparator.naturalOrder()).toList();
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 0) {
            return (sorted.get(middle - 1) + sorted.get(middle)) / 2.0;
        }
        return sorted.get(middle);
    }

    private LocalDateTime toLocalDateTime(Object value) {
        if (value instanceof LocalDateTime dateTime) {
            return dateTime;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toLocalDateTime();
        }
        return value == null ? null : LocalDateTime.parse(value.toString().replace(' ', 'T'));
    }

    private Double toDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return value == null ? null : Double.parseDouble(value.toString());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Integer toInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value == null ? null : Integer.parseInt(value.toString());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Boolean toBoolean(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return value == null ? null : Boolean.parseBoolean(value.toString());
    }

    private String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private record WearContext(boolean worn, boolean charging, LocalDateTime changedAt) {
    }
}
