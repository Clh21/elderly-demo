package com.polyu.elderlycare.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.exception.ResourceNotFoundException;
import com.polyu.elderlycare.repository.WatchDataRepository;
import com.polyu.elderlycare.service.WatchService;
import com.polyu.elderlycare.service.WatchUpdateStreamService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WatchServiceImpl implements WatchService {

    private static final long ONE_HOUR_MS = 60L * 60L * 1000L;
    private static final DateTimeFormatter MINUTE_LABEL_FORMATTER = DateTimeFormatter.ofPattern("hh:mm a", Locale.US);
    private static final DateTimeFormatter SECOND_LABEL_FORMATTER = DateTimeFormatter.ofPattern("hh:mm:ss a", Locale.US);
    private static final DateTimeFormatter DAY_OPTION_FORMATTER = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US);
    private static final DateTimeFormatter MINUTE_SLOT_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:00");
    private static final double DEFAULT_ECG_SAMPLE_RATE_HZ = 500.0;
    private static final double ECG_DISPLAY_LOW_CUTOFF_HZ = 0.5;
    private static final double ECG_DISPLAY_HIGH_CUTOFF_HZ = 40.0;
    private static final double ECG_QRS_LOW_CUTOFF_HZ = 5.0;
    private static final double ECG_QRS_HIGH_CUTOFF_HZ = 15.0;
    private static final double ECG_INITIAL_SKIP_SECONDS = 2.0;
    private static final double ECG_STABLE_WINDOW_SECONDS = 0.5;
    private static final double ECG_MIN_ANALYSIS_SECONDS = 3.0;
    private static final double ECG_INTEGRATION_WINDOW_SECONDS = 0.15;
    private static final double ECG_REFRACTORY_SECONDS = 0.2;
    private static final double BUTTERWORTH_Q = 1.0 / Math.sqrt(2.0);
    private static final String ECG_ANALYSIS_VERSION = "2026-04-06-py-aligned-v2";
    private static final int ECG_REANALYSIS_BATCH_SIZE = 100;
    private static final int EDA_VALID_SAMPLE_BACKFILL_BATCH_SIZE = 500;
    private static final long EDA_VALID_SAMPLE_SESSION_GAP_MS = 60_000L;
    private static final int EDA_BASELINE_LOOKBACK_DAYS = 14;
    private static final int EDA_BASELINE_MIN_VALID_SAMPLE_COUNT = 4;
    private static final int EDA_BASELINE_MAX_WINDOWS_PER_DAYPART = 2;
    private static final int EDA_BASELINE_MAX_WINDOWS_PER_DAY = 8;
    private static final int EDA_BASELINE_PRELIMINARY_MIN_WINDOWS = 10;
    private static final int EDA_BASELINE_PRELIMINARY_MIN_DAYS = 2;
    private static final int EDA_BASELINE_PRELIMINARY_MIN_DAYPARTS = 4;
    private static final int EDA_BASELINE_ESTABLISHED_MIN_WINDOWS = 40;
    private static final int EDA_BASELINE_ESTABLISHED_MIN_DAYS = 5;
    private static final int EDA_BASELINE_ESTABLISHED_MIN_DAYPARTS = 5;
    private static final String EDA_BASELINE_MODEL_VERSION = "2026-04-06-manual-window-balance-v1";
    // Wrist-derived temperature estimates are less precise than clinical thermometry,
    // so alerts use a slightly wider normal band to reduce false positives.
    private static final double ESTIMATED_BODY_TEMP_WARNING_LOW_C = 35.0;
    private static final double ESTIMATED_BODY_TEMP_WARNING_HIGH_C = 37.8;
    private static final double ESTIMATED_BODY_TEMP_CRITICAL_LOW_C = 34.5;
    private static final double ESTIMATED_BODY_TEMP_CRITICAL_HIGH_C = 38.5;

    private static final Map<String, MetricConfig> METRIC_CONFIG = Map.of(
            "heartRate", new MetricConfig("heart_rate", "bpm", "Heart Rate"),
            "temperature", new MetricConfig("body_temperature", "°C", "Body Temperature"),
            "eda", new MetricConfig("eda", "", "Stress State"),
            "wearStatus", new MetricConfig("wear_status", "", "Wear Status")
    );

    private final WatchDataRepository watchDataRepository;
    private final ObjectMapper objectMapper;
    private final AccessScopeService accessScopeService;
    private final WatchUpdateStreamService watchUpdateStreamService;
    private volatile boolean edaBaselineStorageReady = false;

    public WatchServiceImpl(
            WatchDataRepository watchDataRepository,
            ObjectMapper objectMapper,
            AccessScopeService accessScopeService,
            WatchUpdateStreamService watchUpdateStreamService
    ) {
        this.watchDataRepository = watchDataRepository;
        this.objectMapper = objectMapper;
        this.accessScopeService = accessScopeService;
        this.watchUpdateStreamService = watchUpdateStreamService;
    }

    @Override
    @Transactional
    public Map<String, Object> getWatchSummary(String watchId) {
        accessScopeService.assertWatchAccess(watchId);
        ensureEdaBaselineStorage();

        Optional<Map<String, Object>> residentRow = watchDataRepository.findResidentByWatchId(watchId);
        boolean isDemoWatch = residentRow
                .map(row -> "demo".equalsIgnoreCase(asString(row.get("status"))))
                .orElse(false);
        Map<String, Object> edaBaselineProfile = watchDataRepository.findEdaBaselineProfile(watchId).orElse(null);

        Optional<Map<String, Object>> latestRow = watchDataRepository.findLatestMinuteReading(watchId);
        if (latestRow.isEmpty()) {
            Map<String, Object> emptySummary = buildEmptyWatchSummary(isDemoWatch);
            putEdaBaselineSummary(emptySummary, edaBaselineProfile);
            return emptySummary;
        }

        List<Map<String, Object>> history = watchDataRepository.findRecentMinuteHistory(watchId);
        Map<String, Object> row = latestRow.get();
        Map<String, Object> latestHeartRate = watchDataRepository.findLatestHeartRate(watchId).orElse(null);
        Map<String, Object> latestTemperature = watchDataRepository.findLatestTemperature(watchId).orElse(null);
        Map<String, Object> latestEda = watchDataRepository.findLatestEda(watchId).orElse(null);
        Map<String, Object> latestWear = watchDataRepository.findLatestWear(watchId).orElse(null);
        Map<String, Object> latestEcg = watchDataRepository.findLatestEcg(watchId).orElse(null);

        Double heartRate = toDouble(valueOf(latestHeartRate, "heart_rate"));
        Double temperature = toDouble(valueOf(latestTemperature, "temperature"));
        Double bodyTemperature = firstNonNull(
                toDouble(valueOf(latestTemperature, "body_temperature")),
                temperature
        );
        Double wristTemperature = toDouble(valueOf(latestTemperature, "wrist_temperature"));
        Double ambientTemperature = toDouble(valueOf(latestTemperature, "ambient_temperature"));
        Double eda = toDouble(valueOf(latestEda, "eda"));
        EdaInterpretation edaInterpretation = interpretEdaStressState(
            eda,
            asString(valueOf(latestEda, "eda_label")),
            edaBaselineProfile
        );

        String wearStatus = firstNonNull(
                asString(valueOf(latestWear, "wear_status")),
                asString(row.get("wear_status")),
                "unknown"
        );
        Boolean isCharging = valueOf(latestWear, "is_charging") != null
                ? toBoolean(valueOf(latestWear, "is_charging"))
                : (row.get("is_charging") == null ? null : toBoolean(row.get("is_charging")));
        String chargeSource = firstNonNull(asString(valueOf(latestWear, "charge_source")), asString(row.get("charge_source")));
        Integer batteryLevelPercent = valueOf(latestWear, "battery_level_percent") != null
                ? toInteger(valueOf(latestWear, "battery_level_percent"))
                : toInteger(row.get("battery_level_percent"));
        WearStatePresentation wearPresentation = getWearStatePresentation(wearStatus, Boolean.TRUE.equals(isCharging));

        Map<String, Object> ecgSummary = buildEcgResponseFromRow(latestEcg, true);

        List<Map<String, Object>> heartRateHistoryRows = history.stream()
                .filter(item -> item.get("heart_rate") != null)
                .toList();
        List<Map<String, Object>> temperatureHistoryRows = history.stream()
                .filter(item -> item.get("temperature") != null)
                .toList();
        List<Map<String, Object>> edaHistoryRows = history.stream()
                .filter(item -> item.get("eda") != null)
                .toList();
        List<Map<String, Object>> wearHistoryRows = history.stream()
                .filter(item -> item.get("wear_status") != null)
                .toList();

        String temperatureCardStatus = getTemperatureStatus(bodyTemperature);
        Integer residentId = residentRow.map(current -> toInteger(current.get("id"))).orElse(null);
        if (residentId != null) {
            Object latestDataTimestamp = row.get("minute_slot");
            Object latestWearTimestamp = firstNonNull(valueOf(latestWear, "minute_slot"), row.get("minute_slot"));
            boolean noRecentDataAlert = !Boolean.TRUE.equals(isCharging) && !isRecentWithinHour(latestDataTimestamp);
            boolean notWornAlert = !Boolean.TRUE.equals(isCharging) && "not_worn".equals(wearStatus) && !isRecentWithinHour(latestWearTimestamp);
            boolean lowHeartRateAlert = heartRate != null && heartRate < 50;
            boolean highHeartRateAlert = heartRate != null && heartRate > 100;
            boolean lowHeartRateCritical = heartRate != null && heartRate < 45;
            boolean highHeartRateCritical = heartRate != null && heartRate > 120;
            boolean lowTemperatureAlert = bodyTemperature != null && bodyTemperature <= ESTIMATED_BODY_TEMP_WARNING_LOW_C;
            boolean highTemperatureAlert = bodyTemperature != null && bodyTemperature >= ESTIMATED_BODY_TEMP_WARNING_HIGH_C;
            boolean lowTemperatureCritical = bodyTemperature != null && bodyTemperature <= ESTIMATED_BODY_TEMP_CRITICAL_LOW_C;
            boolean highTemperatureCritical = bodyTemperature != null && bodyTemperature >= ESTIMATED_BODY_TEMP_CRITICAL_HIGH_C;
            boolean edaStressAlert = edaInterpretation.stateLevel() != null && edaInterpretation.stateLevel() >= 4
                    && eda != null && eda <= 5.0; // Only alert on real high stress, not artifacts

            ensureAlertState(residentId, "data_gap", "warning",
                    "No watch data has been received for over one hour while the watch is not charging.",
                    noRecentDataAlert);
            ensureAlertState(residentId, "wear_status", "warning",
                    "The watch has not been worn for over one hour while it is not charging.",
                    notWornAlert);
            syncDirectionalAlert(residentId, "heart_rate",
                    lowHeartRateAlert,
                    lowHeartRateCritical ? "critical" : "warning",
                    "Heart rate is below the normal range.",
                    highHeartRateAlert,
                    highHeartRateCritical ? "critical" : "warning",
                    "Heart rate is above the normal range.");
            syncDirectionalAlert(residentId, "temperature",
                    lowTemperatureAlert,
                    lowTemperatureCritical ? "critical" : "warning",
                    "Body temperature is below the normal range.",
                    highTemperatureAlert,
                    highTemperatureCritical ? "critical" : "warning",
                    "Body temperature is above the normal range.");
            ensureAlertState(residentId, "eda", "warning",
                    String.format("EDA indicates high stress (%.2f µS).", eda != null ? eda : 0.0),
                    edaStressAlert);
        }

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("dataAvailable", true);
        response.put("dataSource", isDemoWatch ? "demo" : "real");
        response.put("heartRate", heartRate);
        response.put("heartRateStatus", heartRate == null ? "unavailable" : getStatusFromValue("heartRate", heartRate));
        response.put("heartRateTimestamp", pickRecordedTimestamp(latestHeartRate));
        response.put("temperature", bodyTemperature);
        response.put("bodyTemperature", bodyTemperature);
        response.put("wristTemperature", wristTemperature);
        response.put("ambientTemperature", ambientTemperature);
        response.put("temperatureStatus", temperatureCardStatus);
        response.put("temperatureTimestamp", pickRecordedTimestamp(latestTemperature));
        response.put("eda", eda);
        response.put("edaRaw", eda);
        response.put("edaLabel", asString(valueOf(latestEda, "eda_label")));
        response.put("edaState", edaInterpretation.stateLabel());
        response.put("edaStateLevel", edaInterpretation.stateLevel());
        response.put("edaStatus", edaInterpretation.uiStatus());
        response.put("edaTimestamp", pickRecordedTimestamp(latestEda));
        putEdaBaselineSummary(response, edaBaselineProfile);
        response.put("wearStatus", wearPresentation.label());
        response.put("wearCardStatus", wearPresentation.cardStatus());
        response.put("wearStateRaw", wearStatus);
        response.put("wearStatusTimestamp", firstNonNull(pickRecordedTimestamp(latestWear), toResponseTimeValue(row.get("minute_slot"))));
        response.put("isCharging", isCharging);
        response.put("chargeSource", chargeSource);
        response.put("batteryLevelPercent", batteryLevelPercent);
        response.put("ecg", ecgSummary.get("ecg"));
        response.put("ecgHeartRate", ecgSummary.get("ecgHeartRate"));
        response.put("ecgSampleCount", ecgSummary.get("ecgSampleCount"));
        response.put("ecgResult", ecgSummary.get("ecgResult"));
        response.put("ecgInterpretationBasis", ecgSummary.get("ecgInterpretationBasis"));
        response.put("ecgDurationSeconds", ecgSummary.get("ecgDurationSeconds"));
        response.put("ecgDisplayRangeMv", ecgSummary.get("ecgDisplayRangeMv"));
        response.put("ecgStatus", ecgSummary.get("ecgStatus"));
        response.put("ecgTimestamp", firstNonNull(ecgSummary.get("ecgTimestamp"), pickRecordedTimestamp(latestEcg)));
        response.put("timestamp", toResponseTimeValue(row.get("minute_slot")));
        response.put("heartRateHistory", heartRateHistoryRows.isEmpty() ? List.of() : buildHistory(heartRateHistoryRows, "heart_rate"));
        response.put("temperatureHistory", temperatureHistoryRows.isEmpty() ? List.of() : buildHistory(temperatureHistoryRows, "temperature"));
        response.put("edaHistory", edaHistoryRows.isEmpty() ? List.of() : buildEdaHistory(edaHistoryRows, edaBaselineProfile));
        response.put("wearHistory", wearHistoryRows.isEmpty() ? List.of() : buildWearHistory(wearHistoryRows));
        response.put("ecgHistory", ecgSummary.get("ecgHistory"));
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getEcgHistory(String watchId, int page, int pageSize) {
        accessScopeService.assertWatchAccess(watchId);

        int safePage = Math.max(1, page);
        int safePageSize = Math.min(10, Math.max(1, pageSize));
        int offset = (safePage - 1) * safePageSize;
        int total = watchDataRepository.countEcgHistory(watchId);
        List<Map<String, Object>> rows = watchDataRepository.findEcgHistory(watchId, safePageSize, offset);

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("page", safePage);
        response.put("pageSize", safePageSize);
        response.put("total", total);
        response.put("totalPages", Math.max(1, (int) Math.ceil(total / (double) safePageSize)));
        response.put("items", rows.stream().map(row -> {
            Map<String, Object> summary = buildEcgResponseFromRow(row, false);
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("id", summary.get("id"));
            item.put("recordedAt", toIsoString(row.get("recorded_at")));
            item.put("sourceTimestamp", toLong(row.get("source_timestamp")));
            item.put("timestampLabel", firstNonNull(toIsoFromEpoch(row.get("source_timestamp")), toIsoString(row.get("recorded_at"))));
            item.put("ecgHeartRate", summary.get("ecgHeartRate"));
            item.put("ecgSampleCount", summary.get("ecgSampleCount"));
            item.put("ecgResult", summary.get("ecgResult"));
            item.put("ecgStatus", summary.get("ecgStatus"));
            item.put("ecgDurationSeconds", summary.get("ecgDurationSeconds"));
            return item;
        }).toList());
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getEcgHistoryDetail(String watchId, Long readingId) {
        accessScopeService.assertWatchAccess(watchId);

        Map<String, Object> row = watchDataRepository.findEcgHistoryDetail(watchId, readingId)
                .orElseThrow(() -> new ResourceNotFoundException("ECG record not found"));
        return buildEcgResponseFromRow(row, true);
    }

    @Override
    @Transactional
    public Map<String, Object> deleteEcgHistoryRecord(String watchId, Long readingId) {
        accessScopeService.assertWatchAccess(watchId);

        int deletedCount = watchDataRepository.deleteEcgHistoryRecord(watchId, readingId);
        if (deletedCount == 0) {
            throw new ResourceNotFoundException("ECG record not found");
        }

        return Map.of(
                "success", true,
                "deletedId", readingId
        );
    }

    @Override
    public Map<String, Object> reanalyzeEcgHistory(String watchId) {
        accessScopeService.assertWatchAccess(watchId);
        return reanalyzeStoredEcgRows(watchId, false);
    }

    @Override
    public Map<String, Object> reanalyzeAllEcgHistory() {
        accessScopeService.requireAdmin();
        return reanalyzeStoredEcgRows(null, true);
    }

    @Override
    public Map<String, Object> backfillEdaValidSampleCounts(String watchId) {
        accessScopeService.assertWatchAccess(watchId);
        return backfillStoredEdaRows(watchId, false);
    }

    @Override
    public Map<String, Object> backfillAllEdaValidSampleCounts() {
        accessScopeService.requireAdmin();
        return backfillStoredEdaRows(null, true);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getMetricDetail(String watchId, String metric, String date) {
        accessScopeService.assertWatchAccess(watchId);

        MetricConfig config = METRIC_CONFIG.get(metric);
        if (config == null) {
            throw new IllegalArgumentException("Unsupported metric");
        }

        List<String> availableDates = watchDataRepository.findAvailableMetricDates(watchId, config.column()).stream()
                .map(row -> Objects.toString(row.get("day"), null))
                .filter(Objects::nonNull)
                .toList();

        if (availableDates.isEmpty()) {
            LinkedHashMap<String, Object> empty = new LinkedHashMap<>();
            empty.put("metric", metric);
            empty.put("label", config.label());
            empty.put("unit", config.unit());
            empty.put("availableDates", List.of());
            empty.put("selectedDate", null);
            LinkedHashMap<String, Object> summary = new LinkedHashMap<>();
            summary.put("min", null);
            summary.put("max", null);
            summary.put("latest", null);
            summary.put("latestTimestamp", null);
            summary.put("resting", null);
            empty.put("summary", summary);
            empty.put("points", List.of());
            return empty;
        }

        String selectedDate = availableDates.contains(date) ? date : availableDates.get(0);
        Map<String, Object> edaBaselineProfile = "eda".equals(metric)
            ? watchDataRepository.findEdaBaselineProfile(watchId).orElse(null)
            : null;
        List<Map<String, Object>> rows = watchDataRepository.findMetricRows(watchId, metric, config.column(), selectedDate);
        LinkedHashMap<String, Object> response = new LinkedHashMap<>(buildDailyMetricResponse(metric, config, selectedDate, rows, edaBaselineProfile));
        response.put("availableDates", availableDates.stream()
                .map(value -> Map.of("value", value, "label", formatDayOption(value)))
                .toList());
        return response;
    }

    @Override
    @Transactional
    public Map<String, Object> ingestSamsungWatch(String watchIdParam, String watchIdHeader, Map<String, Object> payload) {
        String watchId = firstNonNull(
                trimToNull(watchIdParam),
                trimToNull(watchIdHeader),
                trimToNull(asString(payload.get("watchId")))
        );

        if (watchId == null) {
            throw new IllegalArgumentException("watchId is required");
        }

        Map<String, Object> resident = watchDataRepository.findResidentByWatchId(watchId)
                .orElseThrow(() -> new ResourceNotFoundException("Unknown watchId: " + watchId));

        Integer residentId = toInteger(resident.get("id"));
        String effectiveWatchId = asString(resident.get("watch_id"));
        String slot = currentMinuteSlot();

        Double heartRate = null;
        Double temperature = null;
        Double bodyTemperature = null;
        Double wristTemperature = null;
        Double ambientTemperature = null;
        Double eda = null;
        String edaLabel = null;
        String wearStatus = null;
        Integer heartRateStatus = null;
        String temperatureStatus = null;
        Integer edaValidSampleCount = null;
        Long sourceTimestamp = toLong(payload.get("timestamp"));
        Boolean isCharging = null;
        String chargeSource = null;
        Integer batteryLevelPercent = null;
        Double ecgHeartRate = null;
        String ecgResult = null;
        Integer ecgSampleCount = null;
        Map<String, Object> minutePayload = payload;
        Map<String, Object> watchReadingPayload = payload;

        String sensorType = trimToNull(asString(payload.get("sensorType")));
        String event = trimToNull(asString(payload.get("event")));

        if ("eda".equals(sensorType) || payload.get("eda") != null) {
            Map<String, Object> edaData = asMap(payload.get("eda"));
            eda = toDouble(edaData.get("skinConductance"));
            edaLabel = trimToNull(asString(edaData.get("label")));
            edaValidSampleCount = toInteger(edaData.get("validSampleCount"));
            if (edaData.get("sampleTimestamp") != null) {
                sourceTimestamp = toLong(edaData.get("sampleTimestamp"));
            }
        }

        if ("heart_rate".equals(sensorType) || payload.get("heartRate") != null) {
            Map<String, Object> heartRateData = asMap(payload.get("heartRate"));
            heartRate = toDouble(heartRateData.get("bpm"));
            heartRateStatus = toInteger(heartRateData.get("status"));
            if (heartRateData.get("sampleTimestamp") != null) {
                sourceTimestamp = toLong(heartRateData.get("sampleTimestamp"));
            }
        }

        if ("temperature".equals(sensorType) || payload.get("temperature") != null) {
            Map<String, Object> temperatureData = asMap(payload.get("temperature"));
            wristTemperature = toDouble(temperatureData.get("wristSkinTemperature"));
            ambientTemperature = toDouble(temperatureData.get("ambientTemperature"));
            temperatureStatus = trimToNull(asString(temperatureData.get("status")));
            bodyTemperature = estimateBodyTemperature(wristTemperature, ambientTemperature);
            temperature = bodyTemperature;
        }

        if ("wear_state".equals(event)) {
            wearStatus = toBoolean(payload.get("isWorn")) ? "worn" : "not_worn";
            isCharging = payload.get("isCharging") == null ? null : toBoolean(payload.get("isCharging"));
            chargeSource = trimToNull(asString(payload.get("chargeSource")));
            batteryLevelPercent = toInteger(payload.get("batteryLevelPercent"));
        }

        if ("power_state".equals(event)) {
            isCharging = payload.get("isCharging") == null ? null : toBoolean(payload.get("isCharging"));
            chargeSource = trimToNull(asString(payload.get("chargeSource")));
            batteryLevelPercent = toInteger(payload.get("batteryLevelPercent"));
            if (payload.get("isWorn") != null) {
                wearStatus = toBoolean(payload.get("isWorn")) ? "worn" : "not_worn";
            }
        }

        if ("ecg".equals(sensorType) || payload.get("ecg") != null) {
            Map<String, Object> ecgData = asMap(payload.get("ecg"));
            EcgAnalysisResult ecgAnalysis = analyzeEcgMeasurement(ecgData);
            ecgHeartRate = ecgAnalysis.estimatedHeartRate();
            ecgResult = ecgAnalysis.result();
            ecgSampleCount = ecgAnalysis.sampleCount();
            watchReadingPayload = buildStoredWatchEcgPayload(payload, ecgData, ecgAnalysis);
            minutePayload = buildStoredMinuteEcgPayload(payload, ecgData, ecgAnalysis);
        }

        watchDataRepository.insertWatchReading(new Object[]{
                residentId,
                effectiveWatchId,
                sensorType,
                event,
                sourceTimestamp,
                heartRate,
                heartRateStatus,
                temperature,
                bodyTemperature,
                wristTemperature,
                ambientTemperature,
                temperatureStatus,
                eda,
                edaLabel,
                edaValidSampleCount,
                wearStatus == null ? "worn" : wearStatus,
                isCharging,
                chargeSource,
                batteryLevelPercent,
                ecgHeartRate,
                ecgSampleCount,
                ecgResult,
                writeJson(watchReadingPayload)
        });

        List<String> updates = new ArrayList<>();
        if (sensorType != null) {
            updates.add("sensor_type = VALUES(sensor_type)");
        }
        if (event != null) {
            updates.add("event_type = VALUES(event_type)");
        }
        if (sourceTimestamp != null) {
            updates.add("source_timestamp = VALUES(source_timestamp)");
        }
        if (heartRate != null) {
            updates.add("heart_rate = VALUES(heart_rate)");
        }
        if (heartRateStatus != null) {
            updates.add("heart_rate_status = VALUES(heart_rate_status)");
        }
        if (temperature != null) {
            updates.add("temperature = VALUES(temperature)");
        }
        if (bodyTemperature != null) {
            updates.add("body_temperature = VALUES(body_temperature)");
        }
        if (wristTemperature != null) {
            updates.add("wrist_temperature = VALUES(wrist_temperature)");
        }
        if (ambientTemperature != null) {
            updates.add("ambient_temperature = VALUES(ambient_temperature)");
        }
        if (temperatureStatus != null) {
            updates.add("temperature_status = VALUES(temperature_status)");
        }
        if (eda != null) {
            updates.add("eda = VALUES(eda)");
        }
        if (edaLabel != null) {
            updates.add("eda_label = VALUES(eda_label)");
        }
        if (edaValidSampleCount != null) {
            updates.add("eda_valid_sample_count = VALUES(eda_valid_sample_count)");
        }
        if (wearStatus != null) {
            updates.add("wear_status = VALUES(wear_status)");
        }
        if (isCharging != null) {
            updates.add("is_charging = VALUES(is_charging)");
        }
        if (chargeSource != null) {
            updates.add("charge_source = VALUES(charge_source)");
        }
        if (batteryLevelPercent != null) {
            updates.add("battery_level_percent = VALUES(battery_level_percent)");
        }
        if (ecgHeartRate != null) {
            updates.add("ecg_heart_rate = VALUES(ecg_heart_rate)");
        }
        if (ecgSampleCount != null) {
            updates.add("ecg_sample_count = VALUES(ecg_sample_count)");
        }
        if (ecgResult != null) {
            updates.add("ecg_result = VALUES(ecg_result)");
        }
        updates.add("raw_payload = VALUES(raw_payload)");
        updates.add("updated_at = NOW()");

        watchDataRepository.upsertMinuteReading(
                String.join(", ", updates),
                new Object[]{
                        residentId,
                        effectiveWatchId,
                        slot,
                        sensorType,
                        event,
                        sourceTimestamp,
                        heartRate,
                        heartRateStatus,
                        temperature,
                        bodyTemperature,
                        wristTemperature,
                        ambientTemperature,
                        temperatureStatus,
                        eda,
                        edaLabel,
                        edaValidSampleCount,
                        wearStatus == null ? "worn" : wearStatus,
                        isCharging,
                        chargeSource,
                        batteryLevelPercent,
                        ecgHeartRate,
                        ecgSampleCount,
                        ecgResult,
                        writeJson(minutePayload)
                }
        );

                watchUpdateStreamService.publishWatchUpdate(
                    effectiveWatchId,
                    residentId,
                    sensorType,
                    event,
                    sourceTimestamp
                );

        return Map.of(
                "success", true,
                "slot", slot,
                "watchId", effectiveWatchId
        );
    }

    @Override
    @Transactional
    public Map<String, Object> ingestLegacyWatchReading(Map<String, Object> payload) {
        String watchId = trimToNull(asString(payload.get("watchId")));
        if (watchId == null) {
            throw new IllegalArgumentException("watchId is required");
        }

        Integer residentId = watchDataRepository.findResidentIdByWatchId(watchId)
                .orElseThrow(() -> new ResourceNotFoundException("Watch not found"));

        watchDataRepository.insertLegacyWatchReading(new Object[]{
                residentId,
                watchId,
                toDouble(payload.get("heartRate")),
                toDouble(payload.get("temperature")),
                toDouble(payload.get("eda")),
                firstNonNull(trimToNull(asString(payload.get("wearStatus"))), "worn")
        });

        watchUpdateStreamService.publishWatchUpdate(
                watchId,
                residentId,
                "legacy_watch_reading",
                null,
                toLong(payload.get("timestamp"))
        );

        return Map.of("success", true);
    }

    private Map<String, Object> reanalyzeStoredEcgRows(String watchId, boolean allWatches) {
        int updatedCount = 0;
        int skippedCount = 0;
        int failedCount = 0;
        int totalCount = 0;
        Long lastSeenId = 0L;

        while (true) {
            List<Map<String, Object>> rows = watchId == null
                    ? watchDataRepository.findNextEcgRows(lastSeenId, ECG_REANALYSIS_BATCH_SIZE)
                    : watchDataRepository.findNextEcgRowsByWatchId(watchId, lastSeenId, ECG_REANALYSIS_BATCH_SIZE);
            if (rows.isEmpty()) {
                break;
            }

            for (Map<String, Object> row : rows) {
                totalCount++;
                try {
                    if (reanalyzeStoredEcgRow(row)) {
                        updatedCount++;
                    } else {
                        skippedCount++;
                    }
                } catch (Exception ignored) {
                    failedCount++;
                }

                Long rowId = toLong(row.get("id"));
                if (rowId != null) {
                    lastSeenId = rowId;
                }
            }
        }

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("scope", allWatches ? "all" : "watch");
        if (watchId != null) {
            response.put("watchId", watchId);
        }
        response.put("analysisVersion", ECG_ANALYSIS_VERSION);
        response.put("batchSize", ECG_REANALYSIS_BATCH_SIZE);
        response.put("total", totalCount);
        response.put("updated", updatedCount);
        response.put("skipped", skippedCount);
        response.put("failed", failedCount);
        return response;
    }

    private boolean reanalyzeStoredEcgRow(Map<String, Object> row) {
        Long readingId = toLong(row.get("id"));
        if (readingId == null) {
            return false;
        }

        Map<String, Object> payload = parseRawPayload(row.get("raw_payload"));
        Map<String, Object> ecgData = payload == null ? null : asMap(payload.get("ecg"));
        if (payload == null || ecgData.isEmpty()) {
            return false;
        }

        StoredEcgAnalysis storedAnalysis = extractStoredEcgAnalysis(ecgData);
        if (storedAnalysis != null && ECG_ANALYSIS_VERSION.equals(storedAnalysis.analysisVersion())) {
            return false;
        }

        EcgAnalysisResult analysis = analyzeEcgMeasurement(ecgData);
        Map<String, Object> storedPayload = buildStoredWatchEcgPayload(payload, ecgData, analysis);
        watchDataRepository.updateEcgReadingAnalysis(
                readingId,
                analysis.estimatedHeartRate(),
                analysis.sampleCount(),
                analysis.result(),
                writeJson(storedPayload)
        );
        return true;
    }

    private Map<String, Object> backfillStoredEdaRows(String watchId, boolean allWatches) {
        int updatedWatchReadingCount = 0;
        int updatedMinuteCount = 0;
        int skippedCount = 0;
        int failedCount = 0;
        int totalCount = 0;
        Long lastSeenId = 0L;
        Map<String, EdaBackfillState> stateByWatch = new HashMap<>();

        while (true) {
            List<Map<String, Object>> rows = watchId == null
                    ? watchDataRepository.findNextEdaRows(lastSeenId, EDA_VALID_SAMPLE_BACKFILL_BATCH_SIZE)
                    : watchDataRepository.findNextEdaRowsByWatchId(watchId, lastSeenId, EDA_VALID_SAMPLE_BACKFILL_BATCH_SIZE);
            if (rows.isEmpty()) {
                break;
            }

            LinkedHashMap<EdaMinuteKey, Integer> minuteUpdates = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                totalCount++;
                try {
                    EdaBackfillUpdate update = buildEdaBackfillUpdate(row, stateByWatch);
                    if (update == null) {
                        skippedCount++;
                    } else {
                        if (update.watchReadingNeedsUpdate()) {
                            watchDataRepository.updateEdaReadingValidSampleCount(
                                    update.readingId(),
                                    update.expectedValidSampleCount(),
                                    update.updatedRawPayload()
                            );
                            updatedWatchReadingCount++;
                            if (update.minuteSlot() != null) {
                                minuteUpdates.put(
                                        new EdaMinuteKey(update.watchId(), update.minuteSlot()),
                                        update.expectedValidSampleCount()
                                );
                            }
                        } else {
                            skippedCount++;
                        }
                    }
                } catch (Exception ignored) {
                    failedCount++;
                }

                Long rowId = toLong(row.get("id"));
                if (rowId != null) {
                    lastSeenId = rowId;
                }
            }

            for (Map.Entry<EdaMinuteKey, Integer> entry : minuteUpdates.entrySet()) {
                updatedMinuteCount += watchDataRepository.updateMinuteReadingEdaValidSampleCount(
                        entry.getKey().watchId(),
                        entry.getKey().minuteSlot(),
                        entry.getValue()
                );
            }
        }

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("scope", allWatches ? "all" : "watch");
        if (watchId != null) {
            response.put("watchId", watchId);
        }
        response.put("batchSize", EDA_VALID_SAMPLE_BACKFILL_BATCH_SIZE);
        response.put("sessionGapMillis", EDA_VALID_SAMPLE_SESSION_GAP_MS);
        response.put("total", totalCount);
        response.put("updatedWatchReadings", updatedWatchReadingCount);
        response.put("updatedMinuteReadings", updatedMinuteCount);
        response.put("skipped", skippedCount);
        response.put("failed", failedCount);
        return response;
    }

    private EdaBackfillUpdate buildEdaBackfillUpdate(Map<String, Object> row, Map<String, EdaBackfillState> stateByWatch) {
        Long readingId = toLong(row.get("id"));
        String watchId = trimToNull(asString(row.get("watch_id")));
        if (readingId == null || watchId == null) {
            return null;
        }

        Map<String, Object> payload = parseRawPayload(row.get("raw_payload"));
        Long sampleTimestamp = firstNonNull(
                toLong(row.get("source_timestamp")),
                extractEdaSampleTimestamp(payload),
                toEpochMillis(row.get("recorded_at"))
        );
        if (sampleTimestamp == null) {
            return null;
        }

        EdaBackfillState previousState = stateByWatch.get(watchId);
        int expectedValidSampleCount = deriveExpectedEdaValidSampleCount(previousState, sampleTimestamp);
        stateByWatch.put(watchId, new EdaBackfillState(sampleTimestamp, expectedValidSampleCount));

        Integer currentValidSampleCount = toInteger(row.get("eda_valid_sample_count"));
        String updatedRawPayload = buildBackfilledEdaRawPayload(payload, expectedValidSampleCount);
        boolean rawPayloadNeedsUpdate = updatedRawPayload != null;
        boolean watchReadingNeedsUpdate = !Objects.equals(currentValidSampleCount, expectedValidSampleCount) || rawPayloadNeedsUpdate;
        LocalDateTime minuteSlot = toLocalDateTime(row.get("recorded_at"));
        if (minuteSlot != null) {
            minuteSlot = minuteSlot.truncatedTo(ChronoUnit.MINUTES);
        }

        return new EdaBackfillUpdate(
                readingId,
                watchId,
                minuteSlot,
                expectedValidSampleCount,
                watchReadingNeedsUpdate,
                updatedRawPayload
        );
    }

    private int deriveExpectedEdaValidSampleCount(EdaBackfillState previousState, long sampleTimestamp) {
        if (previousState == null || previousState.lastSampleTimestamp() == null) {
            return 1;
        }

        long previousTimestamp = previousState.lastSampleTimestamp();
        if (sampleTimestamp <= previousTimestamp || sampleTimestamp - previousTimestamp > EDA_VALID_SAMPLE_SESSION_GAP_MS) {
            return 1;
        }

        return previousState.lastValidSampleCount() + 1;
    }

    private Long extractEdaSampleTimestamp(Map<String, Object> payload) {
        if (payload == null) {
            return null;
        }
        Map<String, Object> edaData = asMap(payload.get("eda"));
        return firstNonNull(
                toLong(edaData.get("sampleTimestamp")),
                toLong(payload.get("timestamp"))
        );
    }

    private String buildBackfilledEdaRawPayload(Map<String, Object> payload, int validSampleCount) {
        if (payload == null) {
            return null;
        }

        Map<String, Object> edaData = asMap(payload.get("eda"));
        if (edaData.isEmpty()) {
            return null;
        }

        Integer existingCount = toInteger(edaData.get("validSampleCount"));
        if (Objects.equals(existingCount, validSampleCount)) {
            return null;
        }

        LinkedHashMap<String, Object> updatedPayload = copyAsMap(payload);
        LinkedHashMap<String, Object> updatedEdaData = copyAsMap(edaData);
        updatedEdaData.put("validSampleCount", validSampleCount);
        updatedPayload.put("eda", updatedEdaData);
        return writeJson(updatedPayload);
    }

    private Map<String, Object> buildStoredWatchEcgPayload(Map<String, Object> payload, Map<String, Object> ecgData, EcgAnalysisResult analysis) {
        LinkedHashMap<String, Object> storedPayload = copyAsMap(payload);
        LinkedHashMap<String, Object> storedEcg = copyAsMap(ecgData);
        storedEcg.put("sampleCount", analysis.sampleCount());
        storedEcg.put("leadOff", Boolean.TRUE.equals(toBoolean(ecgData.get("leadOff"))));
        storedEcg.put("analysis", buildStoredEcgAnalysisMap(analysis));
        storedEcg.put("estimatedHeartRate", analysis.estimatedHeartRate());
        storedEcg.put("result", analysis.result());
        storedEcg.put("rhythmStatus", analysis.rhythmStatus());
        storedEcg.put("interpretationBasis", analysis.interpretationBasis());
        storedEcg.put("durationSeconds", analysis.durationSeconds());
        storedEcg.put("displayRangeMv", analysis.displayRangeMv());
        storedEcg.put("preview", analysis.preview());
        storedPayload.put("sensorType", "ecg");
        storedPayload.put("ecg", storedEcg);
        return storedPayload;
    }

    private Map<String, Object> buildStoredMinuteEcgPayload(Map<String, Object> payload, Map<String, Object> ecgData, EcgAnalysisResult analysis) {
        LinkedHashMap<String, Object> minutePayload = new LinkedHashMap<>();
        minutePayload.put("timestamp", payload.get("timestamp"));
        minutePayload.put("sensorType", "ecg");
        if (payload.get("watchId") != null) {
            minutePayload.put("watchId", payload.get("watchId"));
        }

        LinkedHashMap<String, Object> ecgPayload = new LinkedHashMap<>();
        ecgPayload.put("sampleCount", analysis.sampleCount());
        ecgPayload.put("leadOff", Boolean.TRUE.equals(toBoolean(ecgData.get("leadOff"))));
        ecgPayload.put("analysis", buildStoredEcgAnalysisMap(analysis));
        ecgPayload.put("estimatedHeartRate", analysis.estimatedHeartRate());
        ecgPayload.put("result", analysis.result());
        ecgPayload.put("rhythmStatus", analysis.rhythmStatus());
        ecgPayload.put("interpretationBasis", analysis.interpretationBasis());
        ecgPayload.put("durationSeconds", analysis.durationSeconds());
        ecgPayload.put("displayRangeMv", analysis.displayRangeMv());
        ecgPayload.put("preview", analysis.preview());
        minutePayload.put("ecg", ecgPayload);
        return minutePayload;
    }

    private Map<String, Object> buildStoredEcgAnalysisMap(EcgAnalysisResult analysis) {
        LinkedHashMap<String, Object> storedAnalysis = new LinkedHashMap<>();
        storedAnalysis.put("version", ECG_ANALYSIS_VERSION);
        storedAnalysis.put("estimatedHeartRate", analysis.estimatedHeartRate());
        storedAnalysis.put("sampleCount", analysis.sampleCount());
        storedAnalysis.put("result", analysis.result());
        storedAnalysis.put("rhythmStatus", analysis.rhythmStatus());
        storedAnalysis.put("interpretationBasis", analysis.interpretationBasis());
        storedAnalysis.put("durationSeconds", analysis.durationSeconds());
        storedAnalysis.put("displayRangeMv", analysis.displayRangeMv());
        storedAnalysis.put("preview", analysis.preview());
        return storedAnalysis;
    }

    private StoredEcgAnalysis extractStoredEcgAnalysis(Map<String, Object> ecgData) {
        if (ecgData == null || ecgData.isEmpty()) {
            return null;
        }

        Map<String, Object> nestedAnalysis = asMap(ecgData.get("analysis"));
        Map<String, Object> source = hasStoredEcgAnalysisFields(nestedAnalysis) ? nestedAnalysis : ecgData;
        if (!hasStoredEcgAnalysisFields(source)) {
            return null;
        }

        return new StoredEcgAnalysis(
                toDouble(source.get("estimatedHeartRate")),
                firstNonNull(toInteger(source.get("sampleCount")), toInteger(ecgData.get("sampleCount"))),
                asString(source.get("result")),
                asString(source.get("rhythmStatus")),
                asString(source.get("interpretationBasis")),
                toDouble(source.get("durationSeconds")),
                toDoubleList(source.get("displayRangeMv")),
                toPreviewList(source.get("preview")),
                asString(source.get("version"))
        );
    }

    private boolean hasStoredEcgAnalysisFields(Map<String, Object> source) {
        return source != null && (
                source.get("estimatedHeartRate") != null
                        || source.get("result") != null
                        || source.get("rhythmStatus") != null
                        || source.get("interpretationBasis") != null
                        || source.get("durationSeconds") != null
                        || source.get("preview") != null
                        || source.get("version") != null
        );
    }

    private LinkedHashMap<String, Object> copyAsMap(Object value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(value, new TypeReference<LinkedHashMap<String, Object>>() { });
    }

    private List<Double> toDoubleList(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }
        List<Double> converted = new ArrayList<>();
        for (Object item : items) {
            Double number = toDouble(item);
            if (number != null) {
                converted.add(number);
            }
        }
        return converted;
    }

    private List<Map<String, Object>> toPreviewList(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }
        List<Map<String, Object>> preview = new ArrayList<>();
        for (Object item : items) {
            preview.add(asMap(item));
        }
        return preview;
    }

    private Map<String, Object> buildEmptyWatchSummary(boolean isDemoWatch) {
        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("dataAvailable", false);
        response.put("dataSource", isDemoWatch ? "demo" : "real");
        response.put("heartRate", null);
        response.put("heartRateStatus", "unavailable");
        response.put("heartRateTimestamp", null);
        response.put("temperature", null);
        response.put("temperatureStatus", "unavailable");
        response.put("bodyTemperature", null);
        response.put("temperatureTimestamp", null);
        response.put("wristTemperature", null);
        response.put("ambientTemperature", null);
        response.put("eda", null);
        response.put("edaLabel", null);
        response.put("edaStatus", "unavailable");
        response.put("edaTimestamp", null);
        response.put("edaState", null);
        response.put("edaStateLevel", null);
        response.put("edaBaselineBuilt", false);
        response.put("edaBaselineStage", EdaBaselineStage.NOT_BUILT.code());
        response.put("edaBaselineStageLabel", EdaBaselineStage.NOT_BUILT.label());
        response.put("edaBaselineWindowCount", 0);
        response.put("edaBaselineDayCount", 0);
        response.put("edaBaselineDaypartCount", 0);
        response.put("edaBaselineMedian", null);
        response.put("edaBaselineP25", null);
        response.put("edaBaselineP75", null);
        response.put("edaBaselineBuiltAt", null);
        response.put("wearStatus", "unknown");
        response.put("wearStatusTimestamp", null);
        response.put("isCharging", null);
        response.put("chargeSource", null);
        response.put("batteryLevelPercent", null);
        response.put("ecg", null);
        response.put("ecgHeartRate", null);
        response.put("ecgSampleCount", null);
        response.put("ecgResult", null);
        response.put("ecgInterpretationBasis", null);
        response.put("ecgDurationSeconds", null);
        response.put("ecgDisplayRangeMv", List.of(-1.5, 1.5));
        response.put("ecgStatus", "unavailable");
        response.put("ecgTimestamp", null);
        response.put("timestamp", null);
        response.put("heartRateHistory", List.of());
        response.put("temperatureHistory", List.of());
        response.put("edaHistory", List.of());
        response.put("wearHistory", List.of());
        response.put("ecgHistory", List.of());
        return response;
    }

    private List<Map<String, Object>> buildHistory(List<Map<String, Object>> rows, String valueKey) {
        return rows.stream().<Map<String, Object>>map(row -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", formatClockLabel(firstNonNull(row.get("recorded_at"), row.get("minute_slot")), false));
            item.put("value", toDouble(row.get(valueKey)));
            return item;
        }).toList();
    }

    private List<Map<String, Object>> buildEdaHistory(List<Map<String, Object>> rows, Map<String, Object> edaBaselineProfile) {
        return rows.stream().<Map<String, Object>>map(row -> {
            Double rawEda = toDouble(row.get("eda"));
            EdaInterpretation interpretation = interpretEdaStressState(rawEda, asString(row.get("eda_label")), edaBaselineProfile);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", formatClockLabel(row.get("recorded_at"), false));
            item.put("value", interpretation.stateLevel());
            item.put("stateLabel", interpretation.stateLabel());
            item.put("rawEda", rawEda != null ? round(rawEda, 3) : null);
            return item;
        }).toList();
    }

    private List<Map<String, Object>> buildWearHistory(List<Map<String, Object>> rows) {
        return rows.stream().<Map<String, Object>>map(row -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", formatClockLabel(row.get("recorded_at"), false));
            item.put("value", "worn".equals(asString(row.get("wear_status"))) ? 1 : 0);
            item.put("isCharging", toBoolean(row.get("is_charging")));
            return item;
        }).toList();
    }

    private void ensureAlertState(Integer residentId, String type, String severity, String message, boolean shouldBeActive) {
        Optional<Map<String, Object>> activeAlert = watchDataRepository.findActiveAlert(residentId, type, message);
        if (shouldBeActive) {
            if (activeAlert.isEmpty()) {
                watchDataRepository.createAlert(residentId, type, severity, message);
            } else {
                Integer activeAlertId = toInteger(activeAlert.get().get("id"));
                String activeSeverity = asString(activeAlert.get().get("severity"));
                if (activeAlertId != null && !Objects.equals(activeSeverity, severity)) {
                    watchDataRepository.updateAlertSeverity(activeAlertId, severity);
                }
            }
            return;
        }

        activeAlert
                .map(alert -> toInteger(alert.get("id")))
                .ifPresent(watchDataRepository::resolveAlert);
    }

    private void syncDirectionalAlert(
            Integer residentId,
            String type,
            boolean lowActive,
            String lowSeverity,
            String lowMessage,
            boolean highActive,
            String highSeverity,
            String highMessage
    ) {
        ensureAlertState(residentId, type, lowSeverity, lowMessage, lowActive);
        ensureAlertState(residentId, type, highSeverity, highMessage, highActive);
    }

    private String getStatusFromValue(String metric, double value) {
        if ("heartRate".equals(metric)) {
            return value > 100 || value < 50 ? "warning" : "normal";
        }
        if ("temperature".equals(metric)) {
            return getTemperatureStatus(value);
        }
        if ("eda".equals(metric)) {
            return value > 3.5 ? "warning" : "normal";
        }
        return "normal";
    }

    private String getTemperatureStatus(Double estimatedBodyTemperature) {
        if (estimatedBodyTemperature == null) {
            return "unavailable";
        }
        if (estimatedBodyTemperature <= ESTIMATED_BODY_TEMP_CRITICAL_LOW_C
                || estimatedBodyTemperature >= ESTIMATED_BODY_TEMP_CRITICAL_HIGH_C) {
            return "critical";
        }
        if (estimatedBodyTemperature <= ESTIMATED_BODY_TEMP_WARNING_LOW_C
                || estimatedBodyTemperature >= ESTIMATED_BODY_TEMP_WARNING_HIGH_C) {
            return "warning";
        }
        return "normal";
    }

    /**
     * Estimate core body temperature from wrist skin temperature and ambient temperature.
     *
     * Uses a heat-flux-aware model:
     *   T_core ≈ T_wrist + offset(T_wrist) + ambientCorrection(T_ambient)
     *
     * The offset is a continuous piecewise-linear function (no step-function
     * discontinuities) calibrated against real Samsung Galaxy Watch wrist data
     * in subtropical (Hong Kong) indoor/outdoor conditions.
     *
     * The ambient correction accounts for environmental heating/cooling of the wrist:
     *   - When ambient > reference 25 °C, the wrist is externally heated and reads
     *     warmer than it would from core perfusion alone → reduce the offset.
     *   - When ambient < reference 25 °C, more heat is lost through the skin →
     *     wrist is cooler → increase the offset.
     *
     * Key improvements over the previous step-function approach:
     *   1. Continuous offset curve — eliminates ≤ 0.9 °C jumps at boundaries
     *   2. Ambient correction range extended to 10–45 °C (was capped at 35 °C)
     *   3. Higher offsets for cold wrists (≤ 31 °C) to reduce excessive clamping
     *   4. Lower clamp at 34.0 °C to allow mild hypothermia detection in elderly
     *
     * Reference principles:
     *   - Niedermann et al. (2014), Int J Biometeorol: Heat-flux core temp prediction
     *   - Burton (1935): Two-compartment core–shell body temperature model
     */
    private Double estimateBodyTemperature(Double wristTemperature, Double ambientTemperature) {
        if (wristTemperature == null) {
            return null;
        }
        if (wristTemperature < 20.0 || wristTemperature > 42.0) {
            return null; // implausible sensor reading
        }

        // ── 1. Continuous piecewise-linear wrist→offset interpolation ──
        // Each pair: {wristTemp °C, offset °C to add}.
        // Calibrated so a healthy resting person in ~25 °C ambient ≈ 36.5 °C core.
        double[][] offsetTable = {
                {25, 8.5}, {28, 7.0}, {31, 5.0}, {33, 3.5},
                {35, 1.8}, {36.5, 0.8}, {38, 0.2}, {40, 0.0}
        };
        double offset = interpolateLinear(offsetTable, wristTemperature);

        // ── 2. Ambient correction (heat-flux principle) ──
        // Reference ambient = 25 °C. Coefficient: 0.06 °C per °C deviation.
        double ambientAdj = 0;
        if (ambientTemperature != null && ambientTemperature >= 10 && ambientTemperature <= 45) {
            ambientAdj = clamp((25.0 - ambientTemperature) * 0.06, -1.0, 1.0);
        }

        double estimated = wristTemperature + offset + ambientAdj;
        // 34.0 lower bound: allows mild hypothermia detection (important for elderly)
        // 40.5 upper bound: allows high-fever detection
        return round(clamp(estimated, 34.0, 40.5), 1);
    }

    /**
     * Linear interpolation on a sorted (x, y) table.
     * Clamps to the first/last y value when x is outside the table range.
     */
    private static double interpolateLinear(double[][] table, double x) {
        if (x <= table[0][0]) return table[0][1];
        if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
        for (int i = 0; i < table.length - 1; i++) {
            if (x <= table[i + 1][0]) {
                double x0 = table[i][0], y0 = table[i][1];
                double x1 = table[i + 1][0], y1 = table[i + 1][1];
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
            }
        }
        return table[table.length - 1][1];
    }

    private Map<String, Object> buildDailyMetricResponse(String metricKey, MetricConfig config, String selectedDate, List<Map<String, Object>> rows, Map<String, Object> edaBaselineProfile) {
        if ("wearStatus".equals(metricKey)) {
            List<Map<String, Object>> points = rows.stream()
                    .<Map<String, Object>>map(row -> {
                        LocalDateTime dateTime = toLocalDateTime(firstNonNull(row.get("source_timestamp"), row.get("minute_slot")));
                        if (dateTime == null) {
                            return null;
                        }
                        WearStatePresentation presentation = getWearStatePresentation(
                                asString(row.get("wear_status")),
                            Boolean.TRUE.equals(toBoolean(row.get("is_charging")))
                        );
                        if (presentation.lane() == null) {
                            return null;
                        }

                        Map<String, Object> point = new LinkedHashMap<>();
                        point.put("timestamp", pickRecordedTimestamp(row));
                        point.put("time", formatClockLabel(dateTime, false));
                        point.put("hourOfDay", round(dateTime.getHour() + dateTime.getMinute() / 60.0 + dateTime.getSecond() / 3600.0, 3));
                        point.put("value", presentation.lane());
                        point.put("stateLabel", presentation.label());
                        point.put("laneLabel", presentation.laneLabel());
                        point.put("color", presentation.color());
                        point.put("isCharging", toBoolean(row.get("is_charging")));
                        return point;
                    })
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(point -> toLocalDateTime(point.get("timestamp")) == null
                            ? LocalDateTime.MIN
                            : toLocalDateTime(point.get("timestamp"))))
                    .toList();

            Map<String, Object> latestPoint = points.isEmpty() ? null : points.get(points.size() - 1);
            LinkedHashMap<String, Object> summary = new LinkedHashMap<>();
            summary.put("latest", latestPoint == null ? null : latestPoint.get("value"));
            summary.put("latestLabel", latestPoint == null ? null : latestPoint.get("stateLabel"));
            summary.put("latestTimestamp", latestPoint == null ? null : latestPoint.get("timestamp"));

            int stateChanges = 0;
            Integer previousState = null;
            for (Map<String, Object> point : points) {
                Integer currentState = toInteger(point.get("value"));
                if (currentState == null) {
                    continue;
                }
                if (previousState != null && !Objects.equals(previousState, currentState)) {
                    stateChanges++;
                }
                previousState = currentState;
            }
            summary.put("stateChanges", stateChanges);

            LinkedHashMap<String, Object> response = new LinkedHashMap<>();
            response.put("metric", metricKey);
            response.put("label", config.label());
            response.put("unit", "");
            response.put("selectedDate", selectedDate);
            response.put("summary", summary);
            response.put("points", points);
            return response;
        }

        if ("eda".equals(metricKey)) {
            List<Map<String, Object>> points = rows.stream()
                    .<Map<String, Object>>map(row -> {
                        LocalDateTime dateTime = toLocalDateTime(firstNonNull(row.get("source_timestamp"), row.get("minute_slot")));
                        if (dateTime == null) {
                            return null;
                        }
                        Double rawEda = toDouble(row.get("eda"));
                        EdaInterpretation interpretation = interpretEdaStressState(rawEda, asString(row.get("eda_label")), edaBaselineProfile);
                        if (interpretation.stateLevel() == null) {
                            return null;
                        }

                        Map<String, Object> point = new LinkedHashMap<>();
                        point.put("timestamp", pickRecordedTimestamp(row));
                        point.put("time", formatClockLabel(dateTime, false));
                        point.put("hourOfDay", round(dateTime.getHour() + dateTime.getMinute() / 60.0 + dateTime.getSecond() / 3600.0, 3));
                        point.put("value", interpretation.stateLevel());
                        point.put("stateLabel", interpretation.stateLabel());
                        point.put("rawEda", rawEda != null ? round(rawEda, 3) : null);
                        return point;
                    })
                    .filter(Objects::nonNull)
                    .toList();

            Map<String, Object> latestPoint = points.isEmpty() ? null : points.get(points.size() - 1);
            List<Integer> levels = points.stream().map(point -> toInteger(point.get("value"))).filter(Objects::nonNull).toList();
            List<Double> rawValues = points.stream().map(point -> toDouble(point.get("rawEda"))).filter(Objects::nonNull).toList();
            Integer lowestLevel = levels.isEmpty() ? null : levels.stream().min(Integer::compareTo).orElse(null);
            Integer highestLevel = levels.isEmpty() ? null : levels.stream().max(Integer::compareTo).orElse(null);
            Integer dominantLevel = null;
            if (!levels.isEmpty()) {
                dominantLevel = levels.stream()
                        .collect(Collectors.groupingBy(level -> level, Collectors.counting()))
                        .entrySet().stream()
                        .max(Map.Entry.<Integer, Long>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
                        .map(Map.Entry::getKey)
                        .orElse(null);
            }

            LinkedHashMap<String, Object> summary = new LinkedHashMap<>();
            summary.put("min", lowestLevel);
            summary.put("max", highestLevel);
            summary.put("minLabel", lowestLevel == null ? null : getEdaStateLabel(lowestLevel));
            summary.put("maxLabel", highestLevel == null ? null : getEdaStateLabel(highestLevel));
            summary.put("latest", latestPoint == null ? null : latestPoint.get("value"));
            summary.put("latestLabel", latestPoint == null ? null : latestPoint.get("stateLabel"));
            summary.put("latestRawEda", latestPoint == null ? null : latestPoint.get("rawEda"));
            summary.put("latestTimestamp", latestPoint == null ? null : latestPoint.get("timestamp"));
            summary.put("dominant", dominantLevel);
            summary.put("dominantLabel", dominantLevel == null ? null : getEdaStateLabel(dominantLevel));
            summary.put("rawEdaMin", rawValues.isEmpty() ? null : round(rawValues.stream().min(Double::compareTo).orElse(null), 3));
            summary.put("rawEdaMax", rawValues.isEmpty() ? null : round(rawValues.stream().max(Double::compareTo).orElse(null), 3));
            summary.put("rawEdaAvg", rawValues.isEmpty() ? null : round(rawValues.stream().mapToDouble(Double::doubleValue).average().orElse(0), 3));

            LinkedHashMap<String, Object> response = new LinkedHashMap<>();
            response.put("metric", metricKey);
            response.put("label", config.label());
            response.put("unit", "µS");
            response.put("selectedDate", selectedDate);
            response.put("summary", summary);
            response.put("points", points);
            return response;
        }

        // Non-EDA metrics default to the fixed-threshold interpretation.
        // (Keep a backwards-compatible overload so existing call sites stay simple.)

        List<Map<String, Object>> points = rows.stream()
                .<Map<String, Object>>map(row -> {
                    LocalDateTime dateTime = toLocalDateTime(firstNonNull(row.get("source_timestamp"), row.get("minute_slot")));
                    Double value = toDouble(row.get(config.column()));
                    if (dateTime == null || value == null) {
                        return null;
                    }
                    Map<String, Object> point = new LinkedHashMap<>();
                    point.put("timestamp", pickRecordedTimestamp(row));
                    point.put("time", formatClockLabel(dateTime, false));
                    point.put("hourOfDay", round(dateTime.getHour() + dateTime.getMinute() / 60.0 + dateTime.getSecond() / 3600.0, 3));
                    point.put("value", round(value, 3));
                    return point;
                })
                .filter(Objects::nonNull)
                .toList();

        List<Double> values = points.stream().map(point -> toDouble(point.get("value"))).filter(Objects::nonNull).toList();
        Map<String, Object> latestPoint = points.isEmpty() ? null : points.get(points.size() - 1);
        Double minValue = values.isEmpty() ? null : values.stream().min(Double::compareTo).orElse(null);
        Double maxValue = values.isEmpty() ? null : values.stream().max(Double::compareTo).orElse(null);
        Double restingValue = "heartRate".equals(metricKey) && !values.isEmpty()
                ? round(values.stream().min(Double::compareTo).orElse(0.0), 1)
                : null;

        LinkedHashMap<String, Object> summary = new LinkedHashMap<>();
        summary.put("min", minValue == null ? null : round(minValue, 1));
        summary.put("max", maxValue == null ? null : round(maxValue, 1));
        summary.put("latest", latestPoint == null ? null : round(toDouble(latestPoint.get("value")), 1));
        summary.put("latestTimestamp", latestPoint == null ? null : latestPoint.get("timestamp"));
        summary.put("resting", restingValue);

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("metric", metricKey);
        response.put("label", config.label());
        response.put("unit", config.unit());
        response.put("selectedDate", selectedDate);
        response.put("summary", summary);
        response.put("points", points);
        return response;
    }

    private Map<String, Object> buildDailyMetricResponse(String metricKey, MetricConfig config, String selectedDate, List<Map<String, Object>> rows) {
        return buildDailyMetricResponse(metricKey, config, selectedDate, rows, null);
    }

    @Override
    @Transactional
    public Map<String, Object> buildEdaBaseline(String watchId) {
        accessScopeService.assertWatchAccess(watchId);
        ensureEdaBaselineStorage();

        Integer residentId = watchDataRepository.findResidentIdByWatchId(watchId)
                .orElseThrow(() -> new ResourceNotFoundException("Watch not found"));
        Map<String, Object> existingProfile = watchDataRepository.findEdaBaselineProfile(watchId).orElse(null);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(EDA_BASELINE_LOOKBACK_DAYS);
        List<Map<String, Object>> candidateRows = watchDataRepository.findEdaBaselineCandidateRows(watchId, cutoff);
        EdaBaselineComputation computation = buildEdaBaselineComputation(candidateRows);

        boolean built = computation.stage().buildable();
        if (built) {
            watchDataRepository.upsertEdaBaselineProfile(new Object[]{
                    residentId,
                    watchId,
                    computation.stage().code(),
                    EDA_BASELINE_LOOKBACK_DAYS,
                    computation.candidateWindowCount(),
                    computation.qualifiedWindowCount(),
                    computation.selectedWindowCount(),
                    computation.selectedDayCount(),
                    computation.selectedDaypartCount(),
                    computation.baselineMedian(),
                    computation.baselineP25(),
                    computation.baselineP75(),
                    writeJson(computation.selectedDays()),
                    writeJson(computation.daypartCounts()),
                    writeJson(computation.rejectionCounts()),
                    EDA_BASELINE_MODEL_VERSION
            });
            watchUpdateStreamService.publishWatchUpdate(
                    watchId,
                    residentId,
                    "eda",
                    "eda_baseline_build",
                    System.currentTimeMillis()
            );
        }

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("watchId", watchId);
        response.put("built", built);
        response.put("stored", built);
        response.put("retainedExistingBaseline", !built && existingProfile != null);
        response.put("stage", built ? computation.stage().code() : EdaBaselineStage.NOT_BUILT.code());
        response.put("stageLabel", built ? computation.stage().label() : EdaBaselineStage.NOT_BUILT.label());
        response.put("message", buildEdaBaselineMessage(computation, existingProfile != null && !built));
        response.put("lookbackDays", EDA_BASELINE_LOOKBACK_DAYS);
        response.put("candidateWindowCount", computation.candidateWindowCount());
        response.put("qualifiedWindowCount", computation.qualifiedWindowCount());
        response.put("selectedWindowCount", computation.selectedWindowCount());
        response.put("selectedDayCount", computation.selectedDayCount());
        response.put("selectedDaypartCount", computation.selectedDaypartCount());
        response.put("selectedDays", computation.selectedDays());
        response.put("daypartCounts", computation.daypartCounts());
        response.put("rejectionCounts", computation.rejectionCounts());
        response.put("unmetRequirements", computation.unmetRequirements());
        response.put("baselineMedian", built ? computation.baselineMedian() : null);
        response.put("baselineP25", built ? computation.baselineP25() : null);
        response.put("baselineP75", built ? computation.baselineP75() : null);
        response.put("requirements", Map.of(
                "preliminaryWindows", EDA_BASELINE_PRELIMINARY_MIN_WINDOWS,
                "preliminaryDays", EDA_BASELINE_PRELIMINARY_MIN_DAYS,
                "preliminaryDayparts", EDA_BASELINE_PRELIMINARY_MIN_DAYPARTS,
                "establishedWindows", EDA_BASELINE_ESTABLISHED_MIN_WINDOWS,
                "establishedDays", EDA_BASELINE_ESTABLISHED_MIN_DAYS,
                "establishedDayparts", EDA_BASELINE_ESTABLISHED_MIN_DAYPARTS
        ));
        return response;
    }

    private Map<String, Object> buildEcgResponseFromRow(Map<String, Object> row, boolean includeWaveform) {
        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        if (row == null) {
            response.put("id", null);
            response.put("ecg", null);
            response.put("ecgHeartRate", null);
            response.put("ecgSampleCount", null);
            response.put("ecgResult", null);
            response.put("ecgInterpretationBasis", null);
            response.put("ecgDurationSeconds", null);
            response.put("ecgDisplayRangeMv", List.of(-1.5, 1.5));
            response.put("ecgStatus", "unavailable");
            response.put("ecgTimestamp", null);
            response.put("recordedAt", null);
            response.put("sourceTimestamp", null);
            response.put("ecgHistory", List.of());
            return response;
        }

        Map<String, Object> ecgPayload = parseRawPayload(row.get("raw_payload"));
        Map<String, Object> ecgData = ecgPayload == null ? null : asMap(ecgPayload.get("ecg"));
        StoredEcgAnalysis storedAnalysis = extractStoredEcgAnalysis(ecgData);
        boolean useStoredAnalysis = storedAnalysis != null && Objects.equals(storedAnalysis.analysisVersion(), ECG_ANALYSIS_VERSION);
        EcgAnalysisResult analysis = !useStoredAnalysis && ecgData != null ? analyzeEcgMeasurement(ecgData) : null;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> preview = includeWaveform
            ? useStoredAnalysis
                ? storedAnalysis.preview()
                : (analysis == null ? List.of() : analysis.preview())
                : List.of();
        Map<String, Object> latestPoint = preview.isEmpty() ? null : preview.get(preview.size() - 1);
        List<Double> displayRangeMv = useStoredAnalysis && !storedAnalysis.displayRangeMv().isEmpty()
            ? storedAnalysis.displayRangeMv()
            : (analysis == null ? List.of(-1.5, 1.5) : analysis.displayRangeMv());

        response.put("id", toLong(row.get("id")));
        response.put("ecg", latestPoint == null ? null : toDouble(latestPoint.get("value")));
        response.put("ecgHeartRate", firstNonNull(
            useStoredAnalysis ? storedAnalysis.estimatedHeartRate() : null,
            analysis == null ? null : analysis.estimatedHeartRate(),
            toDouble(row.get("ecg_heart_rate"))
        ));
        response.put("ecgSampleCount", firstNonNull(
            useStoredAnalysis ? storedAnalysis.sampleCount() : null,
            analysis == null ? null : analysis.sampleCount(),
            toInteger(row.get("ecg_sample_count"))
        ));
        response.put("ecgResult", firstNonNull(
            useStoredAnalysis ? storedAnalysis.result() : null,
            analysis == null ? null : analysis.result(),
            asString(row.get("ecg_result"))
        ));
        response.put("ecgInterpretationBasis", firstNonNull(
            useStoredAnalysis ? storedAnalysis.interpretationBasis() : null,
            analysis == null ? null : analysis.interpretationBasis()
        ));
        response.put("ecgDurationSeconds", firstNonNull(
            useStoredAnalysis ? storedAnalysis.durationSeconds() : null,
            analysis == null ? null : analysis.durationSeconds()
        ));
        response.put("ecgDisplayRangeMv", displayRangeMv);
        response.put("ecgStatus", firstNonNull(
            useStoredAnalysis ? storedAnalysis.rhythmStatus() : null,
            analysis == null ? null : analysis.rhythmStatus(),
            "unavailable"
        ));
        response.put("ecgTimestamp", firstNonNull(toLong(row.get("source_timestamp")), toIsoString(row.get("recorded_at"))));
        response.put("recordedAt", toIsoString(row.get("recorded_at")));
        response.put("sourceTimestamp", toLong(row.get("source_timestamp")));
        response.put("ecgHistory", includeWaveform ? preview : List.of());
        return response;
    }

    private EcgAnalysisResult analyzeEcgMeasurement(Map<String, Object> ecgData) {
        List<EcgSample> normalizedSamples = normalizeEcgSamples(ecgData.get("samples"));
        boolean leadOff = Boolean.TRUE.equals(toBoolean(ecgData.get("leadOff")));
        EcgTiming timing = inferEcgTiming(normalizedSamples, toInteger(ecgData.get("sampleCount")));
        List<Double> rawValues = normalizedSamples.stream().map(EcgSample::mv).toList();
        int sampleCount = firstNonNull(toInteger(ecgData.get("sampleCount")), normalizedSamples.size());
        int previewPointTarget = Math.max(1800, Math.min(3600, Math.round((float) (timing.durationMs() / 1000.0 * 120))));
        List<Map<String, Object>> rawPreview = downsampleEcgSamples(normalizedSamples, rawValues, timing.sampleRateHz(), previewPointTarget);
        List<Double> rawDisplayRange = getEcgDisplayRange(rawValues);

        if (normalizedSamples.isEmpty() || leadOff) {
            return new EcgAnalysisResult(
                    sampleCount,
                    null,
                    leadOff ? "Poor contact" : "Unavailable",
                    leadOff ? "warning" : "unavailable",
                    leadOff ? "Lead-off detected during the latest single-lead ECG test." : null,
                    round(timing.durationMs() / 1000.0, 1),
                    rawDisplayRange,
                    rawPreview
            );
        }

        if (rawValues.size() < 100) {
            return new EcgAnalysisResult(
                    sampleCount,
                    null,
                    "Too short",
                    "warning",
                    "The latest ECG test is too short for rhythm classification.",
                    round(timing.durationMs() / 1000.0, 1),
                    rawDisplayRange,
                    rawPreview
            );
        }

        double sampleRate = sanitizeEcgSampleRate(timing.sampleRateHz());
        int stableStartIndex = Math.min(detectStableOnset(rawValues, sampleRate), rawValues.size());
        double stableStartSeconds = round(stableStartIndex / sampleRate, 2);

        List<EcgSample> stableSamples = normalizedSamples.subList(stableStartIndex, normalizedSamples.size());
        List<Double> stableValues = rawValues.subList(stableStartIndex, rawValues.size());
        List<Map<String, Object>> stableRawPreview = downsampleEcgSamples(stableSamples, stableValues, sampleRate, previewPointTarget);
        List<Double> stableRawDisplayRange = getEcgDisplayRange(stableValues);
        double usableDurationSeconds = round(stableValues.size() / sampleRate, 1);

        if (stableValues.size() < Math.max(100, (int) Math.round(sampleRate * ECG_MIN_ANALYSIS_SECONDS))) {
            return new EcgAnalysisResult(
                    sampleCount,
                    null,
                    "Too short",
                    "warning",
                    "The backend skipped the first " + stableStartSeconds
                            + "s while waiting for the finger contact to stabilize, leaving only "
                            + usableDurationSeconds + "s of usable ECG for analysis.",
                    usableDurationSeconds,
                    stableRawDisplayRange,
                    stableRawPreview
            );
        }

                double stableMean = mean(stableValues);
                List<Double> centeredStableValues = stableValues.stream()
                    .map(value -> value - stableMean)
                    .toList();

                List<Double> displaySignal = zeroPhaseBandpass(centeredStableValues, sampleRate, ECG_DISPLAY_LOW_CUTOFF_HZ, ECG_DISPLAY_HIGH_CUTOFF_HZ);
                List<Double> qrsSignal = zeroPhaseBandpass(centeredStableValues, sampleRate, ECG_QRS_LOW_CUTOFF_HZ, ECG_QRS_HIGH_CUTOFF_HZ);
        List<Map<String, Object>> preview = downsampleEcgSamples(stableSamples, displaySignal, sampleRate, previewPointTarget);
        List<Double> displayRange = getEcgDisplayRange(displaySignal);
        EcgSignalQuality signalQuality = assessEcgSignalQuality(stableValues, displaySignal, sampleRate);

        List<Double> differentiated = differentiate(qrsSignal);
        List<Double> squared = differentiated.stream().map(value -> value * value).toList();
        int integrationWindow = Math.max(1, (int) Math.round(sampleRate * ECG_INTEGRATION_WINDOW_SECONDS));
        List<Double> integrated = movingAverageCentered(squared, integrationWindow);
        List<Integer> peaks = detectRPeaks(integrated, displaySignal, sampleRate);
        List<Double> rrIntervalsMs = computeRrIntervalsMs(peaks, sampleRate);
        List<Double> validRrIntervalsMs = rrIntervalsMs.stream()
                .filter(interval -> interval > 200.0 && interval < 2500.0)
                .toList();
        HeartRateStats heartRateStats = computeHeartRateStats(validRrIntervalsMs);
        EcgRhythmAssessment rhythmAssessment = assessEcgRhythm(validRrIntervalsMs, peaks.size(), signalQuality, heartRateStats);
        String interpretationBasis = buildEcgInterpretationBasis(
                stableStartSeconds,
                usableDurationSeconds,
                peaks.size(),
                signalQuality,
                heartRateStats,
                rhythmAssessment
        );

        return new EcgAnalysisResult(
                sampleCount,
                heartRateStats.meanHeartRate(),
                rhythmAssessment.result(),
                rhythmAssessment.rhythmStatus(),
                interpretationBasis,
                usableDurationSeconds,
                displayRange,
                preview
        );
    }

    private double sanitizeEcgSampleRate(Double sampleRateHz) {
        if (sampleRateHz == null || Double.isNaN(sampleRateHz) || Double.isInfinite(sampleRateHz)) {
            return DEFAULT_ECG_SAMPLE_RATE_HZ;
        }
        return clamp(sampleRateHz, 100.0, 1000.0);
    }

    private int detectStableOnset(List<Double> signal, double sampleRateHz) {
        int minSkip = Math.max(0, (int) Math.round(sampleRateHz * ECG_INITIAL_SKIP_SECONDS));
        int windowSize = Math.max(1, (int) Math.round(sampleRateHz * ECG_STABLE_WINDOW_SECONDS));
        if (signal.size() < minSkip + windowSize) {
            return Math.min(minSkip, signal.size());
        }

        int step = Math.max(1, windowSize / 4);
        List<Double> windowStd = new ArrayList<>();
        for (int start = 0; start + windowSize <= signal.size(); start += step) {
            windowStd.add(standardDeviation(signal.subList(start, start + windowSize)));
        }

        if (windowStd.isEmpty()) {
            return Math.min(minSkip, signal.size());
        }

        List<Double> latterHalfStd = windowStd.subList(windowStd.size() / 2, windowStd.size());
        Double medianStd = median(latterHalfStd);
        if (medianStd == null || medianStd <= 0.0) {
            return Math.min(minSkip, signal.size());
        }

        int minSkipWindowIndex = Math.min(windowStd.size() - 1, minSkip / step);
        for (int index = minSkipWindowIndex; index < windowStd.size(); index++) {
            double currentStd = windowStd.get(index);
            if (currentStd > medianStd * 0.3 && currentStd < medianStd * 3.0) {
                return Math.min(index * step, signal.size());
            }
        }

        return Math.min(minSkip, signal.size());
    }

    private List<Double> zeroPhaseBandpass(List<Double> values, double sampleRateHz, double lowCutoffHz, double highCutoffHz) {
        if (values.isEmpty()) {
            return List.of();
        }
        List<Double> highPassed = applyZeroPhaseBiquad(values, buildHighPassCoefficients(sampleRateHz, lowCutoffHz));
        return applyZeroPhaseBiquad(highPassed, buildLowPassCoefficients(sampleRateHz, highCutoffHz));
    }

    private List<Double> zeroPhaseLowPass(List<Double> values, double sampleRateHz, double cutoffHz) {
        if (values.isEmpty()) {
            return List.of();
        }
        return applyZeroPhaseBiquad(values, buildLowPassCoefficients(sampleRateHz, cutoffHz));
    }

    private BiquadCoefficients buildLowPassCoefficients(double sampleRateHz, double cutoffHz) {
        double omega = 2.0 * Math.PI * clamp(cutoffHz, 0.001, sampleRateHz / 2.0 - 0.001) / sampleRateHz;
        double sin = Math.sin(omega);
        double cos = Math.cos(omega);
        double alpha = sin / (2.0 * BUTTERWORTH_Q);
        double b0 = (1.0 - cos) / 2.0;
        double b1 = 1.0 - cos;
        double b2 = (1.0 - cos) / 2.0;
        double a0 = 1.0 + alpha;
        double a1 = -2.0 * cos;
        double a2 = 1.0 - alpha;
        return new BiquadCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
    }

    private BiquadCoefficients buildHighPassCoefficients(double sampleRateHz, double cutoffHz) {
        double omega = 2.0 * Math.PI * clamp(cutoffHz, 0.001, sampleRateHz / 2.0 - 0.001) / sampleRateHz;
        double sin = Math.sin(omega);
        double cos = Math.cos(omega);
        double alpha = sin / (2.0 * BUTTERWORTH_Q);
        double b0 = (1.0 + cos) / 2.0;
        double b1 = -(1.0 + cos);
        double b2 = (1.0 + cos) / 2.0;
        double a0 = 1.0 + alpha;
        double a1 = -2.0 * cos;
        double a2 = 1.0 - alpha;
        return new BiquadCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
    }

    private List<Double> applyZeroPhaseBiquad(List<Double> values, BiquadCoefficients coefficients) {
        List<Double> forward = applyBiquad(values, coefficients);
        List<Double> reversed = reverse(forward);
        return reverse(applyBiquad(reversed, coefficients));
    }

    private List<Double> applyBiquad(List<Double> values, BiquadCoefficients coefficients) {
        List<Double> filtered = new ArrayList<>(values.size());
        double x1 = 0.0;
        double x2 = 0.0;
        double y1 = 0.0;
        double y2 = 0.0;
        for (Double value : values) {
            double x0 = value == null ? 0.0 : value;
            double y0 = coefficients.b0() * x0
                    + coefficients.b1() * x1
                    + coefficients.b2() * x2
                    - coefficients.a1() * y1
                    - coefficients.a2() * y2;
            filtered.add(y0);
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
        }
        return filtered;
    }

    private <T> List<T> reverse(List<T> values) {
        List<T> reversed = new ArrayList<>(values.size());
        for (int index = values.size() - 1; index >= 0; index--) {
            reversed.add(values.get(index));
        }
        return reversed;
    }

    private List<Double> differentiate(List<Double> values) {
        if (values.isEmpty()) {
            return List.of();
        }
        List<Double> differentiated = new ArrayList<>(values.size());
        for (int index = 0; index < values.size() - 1; index++) {
            differentiated.add(values.get(index + 1) - values.get(index));
        }
        differentiated.add(0.0);
        return differentiated;
    }

    private List<Double> movingAverageCentered(List<Double> values, int windowSize) {
        if (values.isEmpty()) {
            return List.of();
        }
        int halfWindow = Math.max(0, windowSize / 2);
        List<Double> averaged = new ArrayList<>(values.size());
        for (int index = 0; index < values.size(); index++) {
            int start = Math.max(0, index - halfWindow);
            int end = Math.min(values.size(), index + halfWindow + 1);
            double sum = 0.0;
            for (int cursor = start; cursor < end; cursor++) {
                sum += values.get(cursor);
            }
            averaged.add(sum / (end - start));
        }
        return averaged;
    }

    private List<Integer> detectRPeaks(List<Double> integratedSignal, List<Double> filteredSignal, double sampleRateHz) {
        if (integratedSignal.size() < 3 || filteredSignal.isEmpty()) {
            return List.of();
        }

        Double percentile70 = quantile(integratedSignal, 0.70);
        List<Double> upperBand = integratedSignal.stream()
                .filter(value -> percentile70 == null || value > percentile70)
                .toList();
        double threshold = upperBand.isEmpty() ? 0.0 : 0.3 * mean(upperBand);
        double maxIntegrated = integratedSignal.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
        if (!(threshold > 0.0) || Double.isNaN(threshold)) {
            threshold = maxIntegrated * 0.1;
        }

        int minDistance = Math.max(1, (int) Math.round(sampleRateHz * ECG_REFRACTORY_SECONDS));
        List<Integer> candidatePeaks = new ArrayList<>();
        for (int index = 1; index < integratedSignal.size() - 1; index++) {
            double current = integratedSignal.get(index);
            if (current < threshold) {
                continue;
            }
            if (current <= integratedSignal.get(index - 1) || current < integratedSignal.get(index + 1)) {
                continue;
            }
            if (!candidatePeaks.isEmpty() && index - candidatePeaks.get(candidatePeaks.size() - 1) < minDistance) {
                int previousIndex = candidatePeaks.get(candidatePeaks.size() - 1);
                if (current > integratedSignal.get(previousIndex)) {
                    candidatePeaks.set(candidatePeaks.size() - 1, index);
                }
                continue;
            }
            candidatePeaks.add(index);
        }

        int searchWindow = Math.max(1, (int) Math.round(sampleRateHz * 0.05));
        List<Integer> refinedPeaks = new ArrayList<>();
        for (Integer candidate : candidatePeaks) {
            int start = Math.max(0, candidate - searchWindow);
            int end = Math.min(filteredSignal.size() - 1, candidate + searchWindow);
            int refinedPeak = start;
            double strongestMagnitude = Math.abs(filteredSignal.get(start));
            for (int index = start + 1; index <= end; index++) {
                double magnitude = Math.abs(filteredSignal.get(index));
                if (magnitude > strongestMagnitude) {
                    strongestMagnitude = magnitude;
                    refinedPeak = index;
                }
            }
            if (!refinedPeaks.isEmpty() && refinedPeak - refinedPeaks.get(refinedPeaks.size() - 1) < minDistance) {
                int previousPeak = refinedPeaks.get(refinedPeaks.size() - 1);
                if (Math.abs(filteredSignal.get(refinedPeak)) > Math.abs(filteredSignal.get(previousPeak))) {
                    refinedPeaks.set(refinedPeaks.size() - 1, refinedPeak);
                }
                continue;
            }
            refinedPeaks.add(refinedPeak);
        }
        return refinedPeaks;
    }

    private List<Double> computeRrIntervalsMs(List<Integer> peaks, double sampleRateHz) {
        if (peaks.size() < 2) {
            return List.of();
        }
        List<Double> rrIntervals = new ArrayList<>(peaks.size() - 1);
        for (int index = 1; index < peaks.size(); index++) {
            rrIntervals.add((peaks.get(index) - peaks.get(index - 1)) * (1000.0 / sampleRateHz));
        }
        return rrIntervals;
    }

    private HeartRateStats computeHeartRateStats(List<Double> rrIntervalsMs) {
        if (rrIntervalsMs.isEmpty()) {
            return new HeartRateStats(null, null, null, null, null, 0);
        }
        List<Double> heartRates = rrIntervalsMs.stream().map(interval -> 60000.0 / interval).toList();
        return new HeartRateStats(
                round(mean(heartRates), 1),
                round(firstNonNull(median(heartRates), 0.0), 1),
                round(standardDeviation(heartRates), 1),
                round(heartRates.stream().min(Double::compareTo).orElse(0.0), 1),
                round(heartRates.stream().max(Double::compareTo).orElse(0.0), 1),
                rrIntervalsMs.size() + 1
        );
    }

    private EcgSignalQuality assessEcgSignalQuality(List<Double> rawSignal, List<Double> filteredSignal, double sampleRateHz) {
        if (rawSignal.isEmpty() || filteredSignal.isEmpty()) {
            return new EcgSignalQuality(0.0, 0.0, 0.0, 0.0, "Unavailable", false);
        }

        List<Double> lowPassed = zeroPhaseLowPass(rawSignal, sampleRateHz, ECG_DISPLAY_HIGH_CUTOFF_HZ);
        List<Double> highFrequencyNoise = subtractSignals(rawSignal, lowPassed);
        double signalPower = meanSquare(filteredSignal);
        double noisePower = meanSquare(highFrequencyNoise);
        double snrDb = noisePower <= 0.0
                ? 99.0
                : 10.0 * Math.log10(Math.max(signalPower, 1.0e-9) / Math.max(noisePower, 1.0e-9));

        double kurtosis = calculateExcessKurtosis(filteredSignal);
        double clippingRatio = calculateClippingRatio(rawSignal);
        List<Double> baseline = zeroPhaseLowPass(rawSignal, sampleRateHz, ECG_DISPLAY_LOW_CUTOFF_HZ);
        double baselineWanderStdMv = standardDeviation(baseline);

        String assessment = "Good";
        if (snrDb < 5.0) {
            assessment = "Poor";
        } else if (snrDb < 10.0) {
            assessment = "Fair";
        }
        if (clippingRatio > 0.05) {
            assessment = "Poor";
        } else if (kurtosis < 3.0 && "Good".equals(assessment)) {
            assessment = "Fair";
        }

        boolean readable = clippingRatio <= 0.10 && !(snrDb < 3.0 && kurtosis < 2.0);
        return new EcgSignalQuality(
                round(snrDb, 1),
                round(kurtosis, 1),
                round(clippingRatio, 3),
                round(baselineWanderStdMv, 2),
                assessment,
                readable
        );
    }

    private EcgRhythmAssessment assessEcgRhythm(List<Double> rrIntervalsMs, int peakCount, EcgSignalQuality signalQuality, HeartRateStats heartRateStats) {
        if (peakCount < 5 || rrIntervalsMs.size() < 2 || heartRateStats.meanHeartRate() == null) {
            return new EcgRhythmAssessment(
                    "Unreadable single-lead ECG",
                    "warning",
                    null,
                    null,
                    null,
                    false,
                    "Too few plausible R-peaks were detected for reliable rhythm classification."
            );
        }

        double meanRrMs = mean(rrIntervalsMs);
        double rrStdMs = standardDeviation(rrIntervalsMs);
        double rrCoefficientOfVariation = meanRrMs <= 0.0 ? 0.0 : rrStdMs / meanRrMs;
        List<Double> successiveDifferences = new ArrayList<>();
        for (int index = 1; index < rrIntervalsMs.size(); index++) {
            successiveDifferences.add(rrIntervalsMs.get(index) - rrIntervalsMs.get(index - 1));
        }
        double rmssdMs = successiveDifferences.isEmpty()
                ? 0.0
                : Math.sqrt(mean(successiveDifferences.stream().map(value -> value * value).toList()));
        double pnn50Percent = successiveDifferences.isEmpty()
                ? 0.0
                : successiveDifferences.stream().filter(value -> Math.abs(value) > 50.0).count() * 100.0 / successiveDifferences.size();

        Double meanHeartRate = heartRateStats.meanHeartRate();
        if (meanHeartRate != null && (meanHeartRate > 200.0 || meanHeartRate < 30.0)) {
            return new EcgRhythmAssessment(
                    "Unreadable single-lead ECG",
                    "warning",
                    round(rrCoefficientOfVariation, 3),
                    round(rmssdMs, 1),
                    round(pnn50Percent, 1),
                    false,
                    "The detected R-R intervals correspond to a physiologically implausible heart rate."
            );
        }

        if (!signalQuality.readable() && peakCount < 8) {
            return new EcgRhythmAssessment(
                    "Unreadable single-lead ECG",
                    "warning",
                    round(rrCoefficientOfVariation, 3),
                    round(rmssdMs, 1),
                    round(pnn50Percent, 1),
                    false,
                    "Signal quality is too weak for reliable rhythm classification."
            );
        }

        boolean irregularRhythm = rrCoefficientOfVariation > 0.20;
        if (irregularRhythm) {
            return new EcgRhythmAssessment(
                    "Irregular rhythm suspected",
                    "warning",
                    round(rrCoefficientOfVariation, 3),
                    round(rmssdMs, 1),
                    round(pnn50Percent, 1),
                    true,
                    null
            );
        }
        if (meanHeartRate != null && meanHeartRate > 100.0) {
            return new EcgRhythmAssessment(
                    "Regular tachycardic rhythm",
                    "warning",
                    round(rrCoefficientOfVariation, 3),
                    round(rmssdMs, 1),
                    round(pnn50Percent, 1),
                    true,
                    null
            );
        }
        if (meanHeartRate != null && meanHeartRate < 60.0) {
            return new EcgRhythmAssessment(
                    "Regular bradycardic rhythm",
                    "warning",
                    round(rrCoefficientOfVariation, 3),
                    round(rmssdMs, 1),
                    round(pnn50Percent, 1),
                    true,
                    null
            );
        }
        return new EcgRhythmAssessment(
                "Likely sinus rhythm",
                "normal",
                round(rrCoefficientOfVariation, 3),
                round(rmssdMs, 1),
                round(pnn50Percent, 1),
                true,
                null
        );
    }

    private String buildEcgInterpretationBasis(
            double stableStartSeconds,
            double usableDurationSeconds,
            int peakCount,
            EcgSignalQuality signalQuality,
            HeartRateStats heartRateStats,
            EcgRhythmAssessment rhythmAssessment
    ) {
        StringBuilder builder = new StringBuilder();
        builder.append("The backend skipped the first ")
                .append(stableStartSeconds)
                .append("s of unstable finger contact, then applied 0.5-40 Hz band-pass filtering for display and 5-15 Hz band-pass filtering with a Pan-Tompkins-style detector for R-peak detection. ")
                .append("It found ")
                .append(peakCount)
                .append(" plausible R-peaks across ")
                .append(usableDurationSeconds)
                .append("s of usable ECG. ");

        if (!rhythmAssessment.reliable()) {
            builder.append(rhythmAssessment.reason());
            builder.append(" Signal quality was ")
                    .append(signalQuality.assessment().toLowerCase(Locale.US))
                    .append(" (SNR ")
                    .append(signalQuality.snrDb())
                    .append(" dB, clipping ")
                    .append(round(signalQuality.clippingRatio() * 100.0, 1))
                    .append("%).");
            return builder.toString();
        }

        builder.append("Estimated mean heart rate was ")
                .append(heartRateStats.meanHeartRate())
                .append(" bpm");
        if (heartRateStats.minHeartRate() != null && heartRateStats.maxHeartRate() != null) {
            builder.append(" (range ")
                    .append(heartRateStats.minHeartRate())
                    .append("-")
                    .append(heartRateStats.maxHeartRate())
                    .append(" bpm)");
        }
        builder.append(". RR variability metrics were CV ")
                .append(round(firstNonNull(rhythmAssessment.rrCoefficientOfVariation(), 0.0) * 100.0, 1))
                .append("%, RMSSD ")
                .append(firstNonNull(rhythmAssessment.rmssdMs(), 0.0))
                .append(" ms, and pNN50 ")
                .append(firstNonNull(rhythmAssessment.pnn50Percent(), 0.0))
                .append("%. Signal quality was ")
                .append(signalQuality.assessment().toLowerCase(Locale.US))
                .append(" (SNR ")
                .append(signalQuality.snrDb())
                .append(" dB, kurtosis ")
                .append(signalQuality.kurtosis())
                .append(").");
        return builder.toString();
    }

    private List<EcgSample> normalizeEcgSamples(Object samples) {
        if (!(samples instanceof List<?> sampleList)) {
            return List.of();
        }

        List<EcgSample> normalized = new ArrayList<>();
        int index = 0;
        for (Object sample : sampleList) {
            Map<String, Object> sampleMap = asMap(sample);
            Long timestamp = toLong(sampleMap.get("timestamp"));
            Double mv = toDouble(sampleMap.get("mv"));
            if (timestamp != null && mv != null) {
                normalized.add(new EcgSample(timestamp, mv, index));
            }
            index++;
        }
        return normalized;
    }

    private EcgTiming inferEcgTiming(List<EcgSample> normalizedSamples, Integer declaredSampleCount) {
        if (normalizedSamples.isEmpty()) {
            return new EcgTiming(30_000L, null);
        }

        long startTimestamp = normalizedSamples.get(0).timestamp();
        long endTimestamp = normalizedSamples.get(normalizedSamples.size() - 1).timestamp();
        long observedDuration = Math.max(endTimestamp - startTimestamp, 0L);
        long fallbackDuration = declaredSampleCount == null ? 30_000L : Math.max(30_000L, declaredSampleCount.longValue() * 2L);
        long duration = Math.max(Math.max(observedDuration, fallbackDuration), 1L);
        Double sampleRate = normalizedSamples.size() > 1
                ? ((normalizedSamples.size() - 1) * 1000.0) / duration
                : null;
        return new EcgTiming(duration, sampleRate);
    }

    private List<Double> getEcgDisplayRange(List<Double> values) {
        if (values.isEmpty()) {
            return List.of(-1.5, 1.5);
        }

        Double lower = firstNonNull(quantile(values, 0.02), values.stream().min(Double::compareTo).orElse(-1.5));
        Double upper = firstNonNull(quantile(values, 0.98), values.stream().max(Double::compareTo).orElse(1.5));
        double spread = Math.max(upper - lower, 0.3);
        double padding = Math.max(spread * 0.12, 0.08);
        return List.of(round(lower - padding, 3), round(upper + padding, 3));
    }

    private List<Double> subtractSignals(List<Double> left, List<Double> right) {
        int size = Math.min(left.size(), right.size());
        List<Double> result = new ArrayList<>(size);
        for (int index = 0; index < size; index++) {
            result.add(left.get(index) - right.get(index));
        }
        return result;
    }

    private double mean(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return 0.0;
        }
        double sum = 0.0;
        for (Double value : values) {
            sum += value;
        }
        return sum / values.size();
    }

    private double meanSquare(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return 0.0;
        }
        double sum = 0.0;
        for (Double value : values) {
            sum += value * value;
        }
        return sum / values.size();
    }

    private double standardDeviation(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return 0.0;
        }
        double mean = mean(values);
        double varianceSum = 0.0;
        for (Double value : values) {
            double delta = value - mean;
            varianceSum += delta * delta;
        }
        return Math.sqrt(varianceSum / values.size());
    }

    private double calculateExcessKurtosis(List<Double> values) {
        if (values == null || values.size() < 4) {
            return 0.0;
        }
        double mean = mean(values);
        double secondMoment = 0.0;
        double fourthMoment = 0.0;
        for (Double value : values) {
            double centered = value - mean;
            double squared = centered * centered;
            secondMoment += squared;
            fourthMoment += squared * squared;
        }
        secondMoment /= values.size();
        fourthMoment /= values.size();
        if (secondMoment <= 0.0) {
            return 0.0;
        }
        return fourthMoment / (secondMoment * secondMoment) - 3.0;
    }

    private double calculateClippingRatio(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return 0.0;
        }
        double minimum = values.stream().min(Double::compareTo).orElse(0.0);
        double maximum = values.stream().max(Double::compareTo).orElse(0.0);
        double spread = maximum - minimum;
        double threshold = spread <= 0.0 ? 1.0 : spread * 0.01;
        long clippedCount = values.stream()
                .filter(value -> value <= minimum + threshold || value >= maximum - threshold)
                .count();
        return clippedCount / (double) values.size();
    }

    private List<Map<String, Object>> downsampleEcgSamples(List<EcgSample> normalizedSamples, List<Double> signalValues, Double sampleRateHz, int maxPoints) {
        if (normalizedSamples.isEmpty()) {
            return List.of();
        }

        if (normalizedSamples.size() <= maxPoints) {
            List<Map<String, Object>> preview = new ArrayList<>(normalizedSamples.size());
            for (int index = 0; index < normalizedSamples.size(); index++) {
                preview.add(toPreviewPoint(normalizedSamples.get(index), signalValues.get(index), sampleRateHz, index));
            }
            return preview;
        }

        int bucketSize = (int) Math.ceil(normalizedSamples.size() / (double) Math.max(1, Math.floor(maxPoints / 2.0)));
        List<Map<String, Object>> preview = new ArrayList<>();

        for (int index = 0; index < normalizedSamples.size(); index += bucketSize) {
            int bucketEnd = Math.min(normalizedSamples.size(), index + bucketSize);
            int minIndex = index;
            int maxIndex = index;
            for (int cursor = index + 1; cursor < bucketEnd; cursor++) {
                if (signalValues.get(cursor) < signalValues.get(minIndex)) {
                    minIndex = cursor;
                }
                if (signalValues.get(cursor) > signalValues.get(maxIndex)) {
                    maxIndex = cursor;
                }
            }
            if (minIndex == maxIndex) {
                preview.add(toPreviewPoint(normalizedSamples.get(minIndex), signalValues.get(minIndex), sampleRateHz, minIndex));
                continue;
            }
            int first = Math.min(minIndex, maxIndex);
            int second = Math.max(minIndex, maxIndex);
            preview.add(toPreviewPoint(normalizedSamples.get(first), signalValues.get(first), sampleRateHz, first));
            preview.add(toPreviewPoint(normalizedSamples.get(second), signalValues.get(second), sampleRateHz, second));
            if (preview.size() >= maxPoints) {
                break;
            }
        }

        return preview.size() > maxPoints ? preview.subList(0, maxPoints) : preview;
    }

    private Map<String, Object> toPreviewPoint(EcgSample sample, double signalValue, Double sampleRateHz, int relativeIndex) {
        LinkedHashMap<String, Object> point = new LinkedHashMap<>();
        point.put("time", formatClockLabel(sample.timestamp(), true));
        point.put("timestamp", sample.timestamp());
        point.put("seconds", sampleRateHz != null && sampleRateHz > 0
                ? round(relativeIndex / sampleRateHz, 3)
                : round(relativeIndex * 10 / 1000.0, 3));
        point.put("value", round(signalValue, 3));
        return point;
    }

    private Map<String, Object> parseRawPayload(Object rawPayload) {
        if (rawPayload == null) {
            return null;
        }
        if (rawPayload instanceof Map<?, ?> map) {
            return map.entrySet().stream().collect(Collectors.toMap(
                    entry -> String.valueOf(entry.getKey()),
                    Map.Entry::getValue,
                    (left, right) -> right,
                    LinkedHashMap::new
            ));
        }
        try {
            if (rawPayload instanceof String rawString) {
                return objectMapper.readValue(rawString, new TypeReference<LinkedHashMap<String, Object>>() { });
            }
            if (rawPayload instanceof byte[] rawBytes) {
                return objectMapper.readValue(rawBytes, new TypeReference<LinkedHashMap<String, Object>>() { });
            }
            return objectMapper.convertValue(rawPayload, new TypeReference<LinkedHashMap<String, Object>>() { });
        } catch (Exception ignored) {
            return null;
        }
    }

    private Object pickRecordedTimestamp(Map<String, Object> row) {
        if (row == null) {
            return null;
        }
        return firstNonNull(toLong(row.get("source_timestamp")), toResponseTimeValue(row.get("minute_slot")));
    }

    /**
     * Interpret EDA (Electrodermal Activity) stress state from raw skin conductance.
     *
     * Strategy: numeric-value-first with artifact filtering.
     * Samsung Watch labels are unreliable (always "STABLE"), so we rely on the
     * raw skinConductance (µS) value.  Only fall back to label semantics when
     * the label clearly indicates a non-default stress keyword AND no numeric
     * value is available.
     *
     * Thresholds are calibrated against real wrist-worn Samsung Watch data:
     *   - 99.5 % of readings fall within 0 – 2.8 µS
     *   - Readings > 5 µS are almost certainly artifacts (water, poor contact)
     *   - Typical resting range at wrist: 0.05 – 0.8 µS
     *   - Moderate arousal: 0.8 – 1.5 µS
     *   - Elevated: 1.5 – 2.5 µS
     *   - High (or near-artifact): > 2.5 µS
     */
    private EdaInterpretation interpretEdaStressState(Double edaValue, String edaLabel) {
        // ── 1. If we have a numeric value, use it (primary path) ──
        if (edaValue != null) {
            // Artifact filter: wrist EDA > 5 µS is almost certainly non-physiological
            if (edaValue > 5.0) {
                return new EdaInterpretation("Artifact", null, "unavailable");
            }
            // Thresholds calibrated from real Samsung Watch wrist data distribution
            if (edaValue < 0.3) {
                return new EdaInterpretation("Relaxed", 1, "normal");
            }
            if (edaValue < 1.0) {
                return new EdaInterpretation("Stable", 2, "normal");
            }
            if (edaValue < 2.0) {
                return new EdaInterpretation("Elevated stress", 3, "warning");
            }
            return new EdaInterpretation("High stress", 4, "warning");
        }

        // ── 2. No numeric value → fall back to label if meaningful ──
        String normalizedLabel = edaLabel == null ? "" : edaLabel.trim().toUpperCase(Locale.US);
        if (normalizedLabel.contains("RELAX") || normalizedLabel.contains("CALM") || "LOW".equals(normalizedLabel)) {
            return new EdaInterpretation("Relaxed", 1, "normal");
        }
        if (normalizedLabel.contains("ELEVAT") || normalizedLabel.contains("RISING") || normalizedLabel.contains("MEDIUM") || normalizedLabel.contains("MODERATE")) {
            return new EdaInterpretation("Elevated stress", 3, "warning");
        }
        if (normalizedLabel.contains("HIGH") || normalizedLabel.contains("STRESS") || normalizedLabel.contains("PEAK")) {
            return new EdaInterpretation("High stress", 4, "warning");
        }
        // STABLE / NORMAL / BASELINE / unknown label with no numeric → Stable
        if (!normalizedLabel.isEmpty()) {
            return new EdaInterpretation("Stable", 2, "normal");
        }
        return new EdaInterpretation(null, null, "unavailable");
    }

    /**
     * Baseline-aware EDA interpretation.
     *
     * Rule:
     * - If a buildable baseline profile exists (PRELIMINARY / ESTABLISHED) and has valid P25/P75,
     *   classify relative to that person's baseline band.
     * - Otherwise, fall back to the fixed-threshold method.
     */
    private EdaInterpretation interpretEdaStressState(Double edaValue, String edaLabel, Map<String, Object> edaBaselineProfile) {
        EdaBaselineStage stage = edaBaselineProfile == null
                ? EdaBaselineStage.NOT_BUILT
                : EdaBaselineStage.fromCode(asString(valueOf(edaBaselineProfile, "stage")));
        if (!stage.buildable()) {
            return interpretEdaStressState(edaValue, edaLabel);
        }

        // Preserve label-based fallback when numeric value is missing.
        if (edaValue == null) {
            return interpretEdaStressState(null, edaLabel);
        }

        // Preserve the existing artifact filter.
        if (edaValue > 5.0) {
            return new EdaInterpretation("Artifact", null, "unavailable");
        }

        Double baselineP25 = toDouble(valueOf(edaBaselineProfile, "baseline_p25"));
        Double baselineP75 = toDouble(valueOf(edaBaselineProfile, "baseline_p75"));
        if (baselineP25 == null || baselineP75 == null) {
            return interpretEdaStressState(edaValue, edaLabel);
        }

        double spread = baselineP75 - baselineP25;
        if (!(spread > 0.0) || Double.isNaN(spread) || Double.isInfinite(spread)) {
            return interpretEdaStressState(edaValue, edaLabel);
        }

        // Guard against an overly narrow baseline band.
        double iqr = Math.max(spread, 0.2);

        if (edaValue <= baselineP25) {
            return new EdaInterpretation("Relaxed", 1, "normal");
        }
        if (edaValue <= baselineP75) {
            return new EdaInterpretation("Stable", 2, "normal");
        }
        if (edaValue <= baselineP75 + iqr) {
            return new EdaInterpretation("Elevated stress", 3, "warning");
        }
        return new EdaInterpretation("High stress", 4, "warning");
    }

    private WearStatePresentation getWearStatePresentation(String wearStatus, boolean isCharging) {
        if (isCharging) {
            return new WearStatePresentation("Charging", "normal", 3, "Charging", "#fb923c");
        }
        if ("worn".equals(wearStatus)) {
            return new WearStatePresentation("Worn", "normal", 2, "Worn", "#14b8a6");
        }
        if ("not_worn".equals(wearStatus)) {
            return new WearStatePresentation("Not worn", "warning", 1, "Not worn", "#8b5cf6");
        }
        return new WearStatePresentation("Unknown", "unavailable", null, "Unknown", "#94a3b8");
    }

    private String getEdaStateLabel(Integer level) {
        return switch (level) {
            case 1 -> "Relaxed";
            case 2 -> "Stable";
            case 3 -> "Elevated stress";
            case 4 -> "High stress";
            default -> "Unknown";
        };
    }

    private Double median(List<Double> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        List<Double> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        if (sorted.size() % 2 == 0) {
            return (sorted.get(middle - 1) + sorted.get(middle)) / 2.0;
        }
        return sorted.get(middle);
    }

    private Double quantile(List<Double> values, double ratio) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        List<Double> sorted = values.stream().sorted().toList();
        int index = Math.max(0, Math.min(sorted.size() - 1, (int) Math.floor((sorted.size() - 1) * ratio)));
        return sorted.get(index);
    }

    private void ensureEdaBaselineStorage() {
        if (edaBaselineStorageReady) {
            return;
        }
        synchronized (this) {
            if (edaBaselineStorageReady) {
                return;
            }
            watchDataRepository.ensureEdaBaselineProfileTable();
            edaBaselineStorageReady = true;
        }
    }

    private void putEdaBaselineSummary(Map<String, Object> response, Map<String, Object> profile) {
        if (response == null) {
            return;
        }

        EdaBaselineStage stage = EdaBaselineStage.fromCode(asString(valueOf(profile, "stage")));
        response.put("edaBaselineBuilt", profile != null && stage.buildable());
        response.put("edaBaselineStage", stage.code());
        response.put("edaBaselineStageLabel", stage.label());
        response.put("edaBaselineLookbackDays", firstNonNull(toInteger(valueOf(profile, "lookback_days")), EDA_BASELINE_LOOKBACK_DAYS));
        response.put("edaBaselineCandidateWindowCount", firstNonNull(toInteger(valueOf(profile, "candidate_window_count")), 0));
        response.put("edaBaselineQualifiedWindowCount", firstNonNull(toInteger(valueOf(profile, "qualified_window_count")), 0));
        response.put("edaBaselineWindowCount", firstNonNull(toInteger(valueOf(profile, "selected_window_count")), 0));
        response.put("edaBaselineDayCount", firstNonNull(toInteger(valueOf(profile, "selected_day_count")), 0));
        response.put("edaBaselineDaypartCount", firstNonNull(toInteger(valueOf(profile, "selected_daypart_count")), 0));
        response.put("edaBaselineMedian", toRoundedNullable(valueOf(profile, "baseline_median"), 3));
        response.put("edaBaselineP25", toRoundedNullable(valueOf(profile, "baseline_p25"), 3));
        response.put("edaBaselineP75", toRoundedNullable(valueOf(profile, "baseline_p75"), 3));
        response.put("edaBaselineSelectedDays", parseStringListJson(valueOf(profile, "selected_days_json")));
        response.put("edaBaselineDaypartCounts", parseIntegerMapJson(valueOf(profile, "daypart_counts_json")));
        response.put("edaBaselineBuiltAt", toIsoString(firstNonNull(valueOf(profile, "built_at"), valueOf(profile, "updated_at"))));
    }

    private EdaBaselineComputation buildEdaBaselineComputation(List<Map<String, Object>> candidateRows) {
        LinkedHashMap<String, Integer> rejectionCounts = new LinkedHashMap<>();
        List<EdaBaselineWindow> qualifiedWindows = new ArrayList<>();
        for (Map<String, Object> row : firstNonNull(candidateRows, List.<Map<String, Object>>of())) {
            EdaBaselineWindow window = toQualifiedEdaBaselineWindow(row, rejectionCounts);
            if (window != null) {
                qualifiedWindows.add(window);
            }
        }

        List<EdaBaselineWindow> selectedWindows = selectBalancedEdaBaselineWindows(qualifiedWindows);
        List<Double> selectedValues = selectedWindows.stream().map(EdaBaselineWindow::edaValue).toList();
        List<String> selectedDays = selectedWindows.stream()
                .map(EdaBaselineWindow::day)
                .distinct()
                .sorted()
                .toList();
        LinkedHashMap<String, Integer> daypartCounts = new LinkedHashMap<>();
        for (EdaBaselineDaypart daypart : EdaBaselineDaypart.values()) {
            int count = (int) selectedWindows.stream().filter(window -> window.daypart() == daypart).count();
            if (count > 0) {
                daypartCounts.put(daypart.label(), count);
            }
        }

        int selectedDayCount = selectedDays.size();
        int selectedDaypartCount = daypartCounts.size();
        EdaBaselineStage stage = determineEdaBaselineStage(selectedWindows.size(), selectedDayCount, selectedDaypartCount);
        List<String> unmetRequirements = stage.buildable()
                ? List.of()
                : describeEdaBaselineGaps(selectedWindows.size(), selectedDayCount, selectedDaypartCount);

        Double baselineMedian = null;
        Double baselineP25 = null;
        Double baselineP75 = null;
        if (stage.buildable()) {
            baselineMedian = toRoundedNullable(median(selectedValues), 3);
            baselineP25 = toRoundedNullable(quantile(selectedValues, 0.25), 3);
            baselineP75 = toRoundedNullable(quantile(selectedValues, 0.75), 3);
        }

        return new EdaBaselineComputation(
                stage,
                candidateRows == null ? 0 : candidateRows.size(),
                qualifiedWindows.size(),
                selectedWindows.size(),
                selectedDayCount,
                selectedDaypartCount,
                baselineMedian,
                baselineP25,
                baselineP75,
                selectedDays,
                daypartCounts,
                rejectionCounts,
                unmetRequirements
        );
    }

    private EdaBaselineWindow toQualifiedEdaBaselineWindow(Map<String, Object> row, Map<String, Integer> rejectionCounts) {
        LocalDateTime timestamp = toLocalDateTime(firstNonNull(valueOf(row, "minute_slot"), valueOf(row, "source_timestamp")));
        if (timestamp == null) {
            incrementCounter(rejectionCounts, "missing_timestamp");
            return null;
        }

        Double edaValue = toDouble(valueOf(row, "eda"));
        if (edaValue == null || edaValue <= 0.0 || edaValue > 5.0) {
            incrementCounter(rejectionCounts, "eda_artifact_or_out_of_range");
            return null;
        }

        String edaLabel = trimToNull(asString(valueOf(row, "eda_label")));
        String normalizedLabel = edaLabel == null ? "" : edaLabel.trim().toUpperCase(Locale.ROOT);
        if (normalizedLabel.contains("ARTIFACT") || normalizedLabel.contains("INVALID") || normalizedLabel.contains("UNAVAILABLE")) {
            incrementCounter(rejectionCounts, "eda_sensor_artifact");
            return null;
        }

        Integer validSampleCount = toInteger(valueOf(row, "eda_valid_sample_count"));
        if (validSampleCount != null && validSampleCount < EDA_BASELINE_MIN_VALID_SAMPLE_COUNT) {
            incrementCounter(rejectionCounts, "too_few_valid_samples");
            return null;
        }

        String wearStatus = trimToNull(asString(valueOf(row, "wear_status")));
        if ("not_worn".equalsIgnoreCase(wearStatus)) {
            incrementCounter(rejectionCounts, "watch_not_worn");
            return null;
        }

        if (Boolean.TRUE.equals(toBoolean(valueOf(row, "is_charging")))) {
            incrementCounter(rejectionCounts, "charging");
            return null;
        }

        String temperatureStatus = trimToNull(asString(valueOf(row, "temperature_status")));
        if (temperatureStatus != null && !"normal".equalsIgnoreCase(temperatureStatus)) {
            incrementCounter(rejectionCounts, "temperature_out_of_range");
            return null;
        }

        Double bodyTemperature = toDouble(valueOf(row, "body_temperature"));
        if (bodyTemperature != null && (bodyTemperature <= ESTIMATED_BODY_TEMP_WARNING_LOW_C || bodyTemperature >= ESTIMATED_BODY_TEMP_WARNING_HIGH_C)) {
            incrementCounter(rejectionCounts, "temperature_out_of_range");
            return null;
        }

        Double heartRate = toDouble(valueOf(row, "heart_rate"));
        if (heartRate != null && heartRate > 100.0) {
            incrementCounter(rejectionCounts, "elevated_heart_rate");
            return null;
        }

        EdaInterpretation interpretation = interpretEdaStressState(edaValue, edaLabel);
        if (interpretation.stateLevel() == null) {
            incrementCounter(rejectionCounts, "unclassified_eda");
            return null;
        }
        if (interpretation.stateLevel() >= 3) {
            incrementCounter(rejectionCounts, "stress_window_excluded");
            return null;
        }

        return new EdaBaselineWindow(
                timestamp.toLocalDate().toString(),
                timestamp,
                getEdaBaselineDaypart(timestamp),
                round(edaValue, 3)
        );
    }

    private List<EdaBaselineWindow> selectBalancedEdaBaselineWindows(List<EdaBaselineWindow> qualifiedWindows) {
        if (qualifiedWindows == null || qualifiedWindows.isEmpty()) {
            return List.of();
        }

        Map<String, List<EdaBaselineWindow>> byDay = qualifiedWindows.stream()
                .sorted(Comparator.comparing(EdaBaselineWindow::timestamp))
                .collect(Collectors.groupingBy(
                        EdaBaselineWindow::day,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        List<EdaBaselineWindow> selected = new ArrayList<>();
        for (List<EdaBaselineWindow> dayWindows : byDay.values()) {
            Map<EdaBaselineDaypart, List<EdaBaselineWindow>> byDaypart = dayWindows.stream()
                    .collect(Collectors.groupingBy(
                            EdaBaselineWindow::daypart,
                            LinkedHashMap::new,
                            Collectors.toList()
                    ));

            LinkedHashMap<EdaBaselineDaypart, List<EdaBaselineWindow>> daypartQueues = new LinkedHashMap<>();
            for (EdaBaselineDaypart daypart : EdaBaselineDaypart.values()) {
                List<EdaBaselineWindow> windows = byDaypart.get(daypart);
                if (windows == null || windows.isEmpty()) {
                    continue;
                }
                daypartQueues.put(daypart, new ArrayList<>(takeEvenlySpacedWindows(windows, EDA_BASELINE_MAX_WINDOWS_PER_DAYPART)));
            }

            List<EdaBaselineWindow> daySelection = new ArrayList<>();
            boolean added = true;
            while (daySelection.size() < EDA_BASELINE_MAX_WINDOWS_PER_DAY && added) {
                added = false;
                for (List<EdaBaselineWindow> queue : daypartQueues.values()) {
                    if (queue.isEmpty()) {
                        continue;
                    }
                    daySelection.add(queue.remove(0));
                    added = true;
                    if (daySelection.size() >= EDA_BASELINE_MAX_WINDOWS_PER_DAY) {
                        break;
                    }
                }
            }

            daySelection.sort(Comparator.comparing(EdaBaselineWindow::timestamp));
            selected.addAll(daySelection);
        }

        return selected;
    }

    private List<EdaBaselineWindow> takeEvenlySpacedWindows(List<EdaBaselineWindow> windows, int limit) {
        if (windows == null || windows.isEmpty() || limit <= 0) {
            return List.of();
        }
        List<EdaBaselineWindow> sorted = windows.stream().sorted(Comparator.comparing(EdaBaselineWindow::timestamp)).toList();
        if (sorted.size() <= limit) {
            return sorted;
        }

        List<EdaBaselineWindow> selected = new ArrayList<>(limit);
        for (int index = 0; index < limit; index++) {
            int candidateIndex = (int) Math.round(index * (sorted.size() - 1.0) / Math.max(1, limit - 1));
            selected.add(sorted.get(candidateIndex));
        }
        return selected;
    }

    private EdaBaselineStage determineEdaBaselineStage(int selectedWindowCount, int selectedDayCount, int selectedDaypartCount) {
        if (selectedWindowCount >= EDA_BASELINE_ESTABLISHED_MIN_WINDOWS
                && selectedDayCount >= EDA_BASELINE_ESTABLISHED_MIN_DAYS
                && selectedDaypartCount >= EDA_BASELINE_ESTABLISHED_MIN_DAYPARTS) {
            return EdaBaselineStage.ESTABLISHED;
        }
        if (selectedWindowCount >= EDA_BASELINE_PRELIMINARY_MIN_WINDOWS
                && selectedDayCount >= EDA_BASELINE_PRELIMINARY_MIN_DAYS
                && selectedDaypartCount >= EDA_BASELINE_PRELIMINARY_MIN_DAYPARTS) {
            return EdaBaselineStage.PRELIMINARY;
        }
        return EdaBaselineStage.NOT_BUILT;
    }

    private List<String> describeEdaBaselineGaps(int selectedWindowCount, int selectedDayCount, int selectedDaypartCount) {
        List<String> gaps = new ArrayList<>();
        int missingWindows = Math.max(0, EDA_BASELINE_PRELIMINARY_MIN_WINDOWS - selectedWindowCount);
        int missingDays = Math.max(0, EDA_BASELINE_PRELIMINARY_MIN_DAYS - selectedDayCount);
        int missingDayparts = Math.max(0, EDA_BASELINE_PRELIMINARY_MIN_DAYPARTS - selectedDaypartCount);
        if (missingWindows > 0) {
            gaps.add("Need " + missingWindows + " more qualifying windows for a preliminary baseline.");
        }
        if (missingDays > 0) {
            gaps.add("Need " + missingDays + " more day(s) with usable EDA data.");
        }
        if (missingDayparts > 0) {
            gaps.add("Need coverage in " + missingDayparts + " more daypart(s).");
        }
        return gaps;
    }

    private String buildEdaBaselineMessage(EdaBaselineComputation computation, boolean retainedExistingBaseline) {
        if (computation.stage().buildable()) {
            return String.format(
                    Locale.US,
                    "Built a %s using %d window(s) from %d day(s) across %d daypart(s).",
                    computation.stage().label().toLowerCase(Locale.ROOT),
                    computation.selectedWindowCount(),
                    computation.selectedDayCount(),
                    computation.selectedDaypartCount()
            );
        }

        String retainedSuffix = retainedExistingBaseline ? " Existing baseline kept." : "";
        return String.format(
                Locale.US,
                "Not enough qualifying EDA data to build a baseline. Selected %d window(s) from %d day(s) across %d daypart(s) within the last %d days.%s",
                computation.selectedWindowCount(),
                computation.selectedDayCount(),
                computation.selectedDaypartCount(),
                EDA_BASELINE_LOOKBACK_DAYS,
                retainedSuffix
        );
    }

    private EdaBaselineDaypart getEdaBaselineDaypart(LocalDateTime timestamp) {
        int hour = timestamp.getHour();
        if (hour < 4) {
            return EdaBaselineDaypart.OVERNIGHT;
        }
        if (hour < 8) {
            return EdaBaselineDaypart.EARLY_MORNING;
        }
        if (hour < 12) {
            return EdaBaselineDaypart.MORNING;
        }
        if (hour < 16) {
            return EdaBaselineDaypart.AFTERNOON;
        }
        if (hour < 20) {
            return EdaBaselineDaypart.EVENING;
        }
        return EdaBaselineDaypart.NIGHT;
    }

    private List<String> parseStringListJson(Object value) {
        if (value == null) {
            return List.of();
        }
        try {
            if (value instanceof List<?> items) {
                return items.stream().map(this::asString).filter(Objects::nonNull).toList();
            }
            if (value instanceof String rawString) {
                return objectMapper.readValue(rawString, new TypeReference<List<String>>() { });
            }
            if (value instanceof byte[] rawBytes) {
                return objectMapper.readValue(rawBytes, new TypeReference<List<String>>() { });
            }
            return objectMapper.convertValue(value, new TypeReference<List<String>>() { });
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private Map<String, Integer> parseIntegerMapJson(Object value) {
        if (value == null) {
            return Map.of();
        }
        try {
            Map<String, Object> rawMap;
            if (value instanceof String rawString) {
                rawMap = objectMapper.readValue(rawString, new TypeReference<LinkedHashMap<String, Object>>() { });
            } else if (value instanceof byte[] rawBytes) {
                rawMap = objectMapper.readValue(rawBytes, new TypeReference<LinkedHashMap<String, Object>>() { });
            } else if (value instanceof Map<?, ?>) {
                rawMap = asMap(value);
            } else {
                rawMap = objectMapper.convertValue(value, new TypeReference<LinkedHashMap<String, Object>>() { });
            }

            LinkedHashMap<String, Integer> parsed = new LinkedHashMap<>();
            rawMap.forEach((key, rawValue) -> {
                Integer parsedValue = toInteger(rawValue);
                if (key != null && parsedValue != null) {
                    parsed.put(key, parsedValue);
                }
            });
            return parsed;
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private Double toRoundedNullable(Object value, int scale) {
        Double parsed = toDouble(value);
        return parsed == null ? null : round(parsed, scale);
    }

    private void incrementCounter(Map<String, Integer> counters, String key) {
        if (counters == null || key == null) {
            return;
        }
        counters.merge(key, 1, Integer::sum);
    }

    private Double medianAbsoluteDeviation(List<Double> values, Double center) {
        if (values == null || values.isEmpty() || center == null) {
            return null;
        }
        List<Double> deviations = values.stream().map(value -> Math.abs(value - center)).toList();
        return median(deviations);
    }

    private boolean isRecentWithinHour(Object timestamp) {
        Long epochMs = toEpochMillis(timestamp);
        return epochMs != null && (System.currentTimeMillis() - epochMs) <= ONE_HOUR_MS;
    }

    private String formatDayOption(String dateValue) {
        if (dateValue == null) {
            return null;
        }
        try {
            return LocalDate.parse(dateValue).format(DAY_OPTION_FORMATTER);
        } catch (DateTimeParseException ex) {
            return dateValue;
        }
    }

    private String currentMinuteSlot() {
        return LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES).format(MINUTE_SLOT_FORMATTER);
    }

    private String formatClockLabel(Object value, boolean includeSeconds) {
        LocalDateTime dateTime = toLocalDateTime(value);
        if (dateTime == null) {
            return null;
        }
        return dateTime.format(includeSeconds ? SECOND_LABEL_FORMATTER : MINUTE_LABEL_FORMATTER);
    }

    private String writeJson(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize payload", ex);
        }
    }

    private Map<String, Object> asMap(Object value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }
        if (value instanceof Map<?, ?> map) {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            map.forEach((key, currentValue) -> result.put(String.valueOf(key), currentValue));
            return result;
        }
        return objectMapper.convertValue(value, new TypeReference<LinkedHashMap<String, Object>>() { });
    }

    private Object valueOf(Map<String, Object> row, String key) {
        return row == null ? null : row.get(key);
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private Double toDouble(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Boolean toBoolean(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private LocalDateTime toLocalDateTime(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDateTime localDateTime) {
            return localDateTime;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toLocalDateTime();
        }
        if (value instanceof java.util.Date date) {
            return LocalDateTime.ofInstant(date.toInstant(), ZoneId.systemDefault());
        }
        if (value instanceof Number number) {
            return LocalDateTime.ofInstant(Instant.ofEpochMilli(number.longValue()), ZoneId.systemDefault());
        }
        String text = String.valueOf(value);
        try {
            return LocalDateTime.parse(text);
        } catch (DateTimeParseException ignored) {
        }
        try {
            return LocalDateTime.parse(text.replace(' ', 'T'));
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.valueOf(text).toLocalDateTime();
        } catch (IllegalArgumentException ignored) {
        }
        try {
            return LocalDateTime.ofInstant(Instant.parse(text), ZoneId.systemDefault());
        } catch (DateTimeParseException ignored) {
        }
        return null;
    }

    private Long toEpochMillis(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        LocalDateTime localDateTime = toLocalDateTime(value);
        if (localDateTime == null) {
            return null;
        }
        return localDateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private String toIsoString(Object value) {
        LocalDateTime dateTime = toLocalDateTime(value);
        if (dateTime == null) {
            return null;
        }
        return dateTime.atZone(ZoneId.systemDefault()).toOffsetDateTime().toString();
    }

    private String toIsoFromEpoch(Object value) {
        Long epoch = toLong(value);
        if (epoch == null) {
            return null;
        }
        return Instant.ofEpochMilli(epoch).atZone(ZoneId.systemDefault()).toOffsetDateTime().toString();
    }

    private Object toResponseTimeValue(Object value) {
        return value instanceof Number ? toLong(value) : toIsoString(value);
    }

    @SafeVarargs
    private final <T> T firstNonNull(T... values) {
        for (T value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private double round(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }

    private double safeSubtract(Double upper, Double lower) {
        if (upper == null || lower == null) {
            return 0.0;
        }
        return upper - lower;
    }

    private record EdaMinuteKey(String watchId, LocalDateTime minuteSlot) {
    }

    private record EdaBackfillState(Long lastSampleTimestamp, int lastValidSampleCount) {
    }

    private record EdaBackfillUpdate(
            Long readingId,
            String watchId,
            LocalDateTime minuteSlot,
            int expectedValidSampleCount,
            boolean watchReadingNeedsUpdate,
            String updatedRawPayload
    ) {
    }

    private record MetricConfig(String column, String unit, String label) {
    }

    private record EdaInterpretation(String stateLabel, Integer stateLevel, String uiStatus) {
    }

    private enum EdaBaselineStage {
        NOT_BUILT("not_built", "Baseline not built", false),
        PRELIMINARY("preliminary", "Preliminary baseline", true),
        ESTABLISHED("established", "Established baseline", true);

        private final String code;
        private final String label;
        private final boolean buildable;

        EdaBaselineStage(String code, String label, boolean buildable) {
            this.code = code;
            this.label = label;
            this.buildable = buildable;
        }

        private String code() {
            return code;
        }

        private String label() {
            return label;
        }

        private boolean buildable() {
            return buildable;
        }

        private static EdaBaselineStage fromCode(String code) {
            if (code == null) {
                return NOT_BUILT;
            }
            for (EdaBaselineStage stage : values()) {
                if (stage.code.equalsIgnoreCase(code)) {
                    return stage;
                }
            }
            return NOT_BUILT;
        }
    }

    private enum EdaBaselineDaypart {
        OVERNIGHT("overnight", "Overnight"),
        EARLY_MORNING("early_morning", "Early morning"),
        MORNING("morning", "Morning"),
        AFTERNOON("afternoon", "Afternoon"),
        EVENING("evening", "Evening"),
        NIGHT("night", "Night");

        private final String code;
        private final String label;

        EdaBaselineDaypart(String code, String label) {
            this.code = code;
            this.label = label;
        }

        private String code() {
            return code;
        }

        private String label() {
            return label;
        }
    }

    private record EdaBaselineWindow(
            String day,
            LocalDateTime timestamp,
            EdaBaselineDaypart daypart,
            Double edaValue
    ) {
    }

    private record EdaBaselineComputation(
            EdaBaselineStage stage,
            int candidateWindowCount,
            int qualifiedWindowCount,
            int selectedWindowCount,
            int selectedDayCount,
            int selectedDaypartCount,
            Double baselineMedian,
            Double baselineP25,
            Double baselineP75,
            List<String> selectedDays,
            Map<String, Integer> daypartCounts,
            Map<String, Integer> rejectionCounts,
            List<String> unmetRequirements
    ) {
    }

    private record WearStatePresentation(String label, String cardStatus, Integer lane, String laneLabel, String color) {
    }

    private record EcgSample(long timestamp, double mv, int index) {
    }

    private record EcgTiming(long durationMs, Double sampleRateHz) {
    }

        private record BiquadCoefficients(double b0, double b1, double b2, double a1, double a2) {
        }

        private record EcgSignalQuality(
            double snrDb,
            double kurtosis,
            double clippingRatio,
            double baselineWanderStdMv,
            String assessment,
            boolean readable
        ) {
        }

        private record HeartRateStats(
            Double meanHeartRate,
            Double medianHeartRate,
            Double standardDeviation,
            Double minHeartRate,
            Double maxHeartRate,
            int beatCount
        ) {
        }

        private record EcgRhythmAssessment(
            String result,
            String rhythmStatus,
            Double rrCoefficientOfVariation,
            Double rmssdMs,
            Double pnn50Percent,
            boolean reliable,
            String reason
        ) {
        }

            private record StoredEcgAnalysis(
                Double estimatedHeartRate,
                Integer sampleCount,
                String result,
                String rhythmStatus,
                String interpretationBasis,
                Double durationSeconds,
                List<Double> displayRangeMv,
                List<Map<String, Object>> preview,
                String analysisVersion
            ) {
            }

    private record EcgAnalysisResult(
            int sampleCount,
            Double estimatedHeartRate,
            String result,
            String rhythmStatus,
            String interpretationBasis,
            Double durationSeconds,
            List<Double> displayRangeMv,
            List<Map<String, Object>> preview
    ) {
    }
}