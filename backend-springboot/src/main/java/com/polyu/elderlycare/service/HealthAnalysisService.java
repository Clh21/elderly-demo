package com.polyu.elderlycare.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.exception.ResourceNotFoundException;
import com.polyu.elderlycare.repository.WatchDataRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HealthAnalysisService {

    private static final Logger LOGGER = LoggerFactory.getLogger(HealthAnalysisService.class);
    private static final DateTimeFormatter DISPLAY_TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final WatchDataRepository watchDataRepository;
    private final AccessScopeService accessScopeService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${app.ai.enabled:true}")
    private boolean aiEnabled;

    @Value("${app.ai.zhipu-api-key:}")
    private String zhipuApiKey;

    @Value("${app.ai.endpoint:https://open.bigmodel.cn/api/paas/v4/chat/completions}")
    private String aiEndpoint;

    @Value("${app.ai.model:glm-4-flash}")
    private String aiModel;

    public HealthAnalysisService(
            WatchDataRepository watchDataRepository,
            AccessScopeService accessScopeService,
            ObjectMapper objectMapper
    ) {
        this.watchDataRepository = watchDataRepository;
        this.accessScopeService = accessScopeService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> analyzeDay(String watchId, LocalDate date) {
        accessScopeService.assertWatchAccess(watchId);
        Map<String, Object> resident = watchDataRepository.findResidentByWatchId(watchId)
                .orElseThrow(() -> new ResourceNotFoundException("Unknown watchId: " + watchId));
        Integer residentId = toInteger(resident.get("id"));

        List<Map<String, Object>> rawRows = watchDataRepository.findDailyRawReadings(watchId, date);
        List<Map<String, Object>> minuteRows = watchDataRepository.findDailyMinuteReadings(watchId, date);
        List<Map<String, Object>> alerts = watchDataRepository.findAlertsForDay(residentId, date);

        if (rawRows.isEmpty() && minuteRows.isEmpty()) {
            return buildEmptyResponse(watchId, date);
        }

        AnalysisAccumulator accumulator = analyzeRows(watchId, date, rawRows, minuteRows, alerts);
        LinkedHashMap<String, Object> response = accumulator.toResponse();
        String localAnalysis = buildLocalNarrative(accumulator);
        String enhancedAnalysis = requestAiNarrative(response, localAnalysis);
        response.put("analysis", enhancedAnalysis);
        response.put("analysisSource", Objects.equals(enhancedAnalysis, localAnalysis) ? "local-rules" : "zhipu-glm");
        return response;
    }

    private AnalysisAccumulator analyzeRows(
            String watchId,
            LocalDate date,
            List<Map<String, Object>> rawRows,
            List<Map<String, Object>> minuteRows,
            List<Map<String, Object>> alerts
    ) {
        LocalDateTime start = date.atStartOfDay();
        boolean worn = watchDataRepository.findLatestWearStateBefore(watchId, start)
                .map(row -> "worn".equalsIgnoreCase(asString(row.get("wear_status"))))
                .orElse(true);
        boolean charging = watchDataRepository.findLatestPowerStateBefore(watchId, start)
                .map(row -> Boolean.TRUE.equals(toBoolean(row.get("is_charging"))))
                .orElse(false);

        List<Double> heartRates = new ArrayList<>();
        List<Double> temperatures = new ArrayList<>();
        List<EdaSample> edaSamples = new ArrayList<>();
        int excludedNotWorn = 0;
        int artifactEdaSamples = 0;
        int wornStateEvents = 0;
        int notWornStateEvents = 0;

        for (Map<String, Object> row : rawRows) {
            String eventType = asString(row.get("event_type"));
            LocalDateTime recordedAt = toLocalDateTime(row.get("recorded_at"));

            if ("wear_state".equals(eventType)) {
                worn = "worn".equalsIgnoreCase(asString(row.get("wear_status")));
                wornStateEvents++;
                if (!worn) {
                    notWornStateEvents++;
                }
            }
            if ("power_state".equals(eventType) && row.get("is_charging") != null) {
                charging = Boolean.TRUE.equals(toBoolean(row.get("is_charging")));
            }

            Double heartRate = toDouble(row.get("heart_rate"));
            Double temperature = toDouble(row.get("body_temperature"));
            Double eda = toDouble(row.get("eda"));
            boolean hasHealthValue = heartRate != null || temperature != null || eda != null;
            if (hasHealthValue && (!worn || charging)) {
                excludedNotWorn++;
            }

            if (worn && !charging && heartRate != null && heartRate >= 25.0 && heartRate <= 240.0) {
                heartRates.add(heartRate);
            }
            if (worn && !charging && temperature != null && temperature >= 30.0 && temperature <= 43.0) {
                String status = asString(row.get("temperature_status"));
                if (status == null || status.isBlank() || "SUCCESSFUL_MEASUREMENT".equalsIgnoreCase(status)) {
                    temperatures.add(temperature);
                }
            }
            if (eda != null) {
                if (eda <= 0.0 || eda > 5.0) {
                    artifactEdaSamples++;
                }
                edaSamples.add(new EdaSample(
                        recordedAt,
                        eda,
                        toInteger(row.get("eda_valid_sample_count")),
                        worn,
                        charging
                ));
            }
        }

        List<EdaEpisode> edaEpisodes = buildEdaEpisodes(edaSamples);
        int highEdaEpisodes = (int) edaEpisodes.stream().filter(EdaEpisode::sustainedHigh).count();
        List<Double> validEdaValues = edaEpisodes.stream()
                .flatMap(episode -> episode.validValues().stream())
                .toList();

        LocalDateTime firstAt = rawRows.isEmpty() ? null : toLocalDateTime(rawRows.get(0).get("recorded_at"));
        LocalDateTime lastAt = rawRows.isEmpty()
                ? null
                : toLocalDateTime(rawRows.get(rawRows.size() - 1).get("recorded_at"));
        int spanMinutes = firstAt == null || lastAt == null
                ? minuteRows.size()
                : Math.max(1, (int) Duration.between(firstAt, lastAt).toMinutes() + 1);
        int elapsedDayMinutes = elapsedMinutesFor(date);
        double sessionCoverage = spanMinutes == 0 ? 0.0 : minuteRows.size() * 100.0 / spanMinutes;
        double dayCoverage = elapsedDayMinutes == 0 ? 0.0 : minuteRows.size() * 100.0 / elapsedDayMinutes;

        MetricStats heartRate = MetricStats.of(heartRates, 50.0, 100.0);
        MetricStats temperature = MetricStats.of(temperatures, 35.0, 37.8);
        MetricStats eda = MetricStats.of(validEdaValues, 0.0, 2.0);
        long criticalAlerts = alerts.stream()
                .filter(row -> "critical".equalsIgnoreCase(asString(row.get("severity"))))
                .count();
        long warningAlerts = alerts.size() - criticalAlerts;

        String quality = determineQuality(rawRows.size(), heartRates.size(), temperatures.size(), validEdaValues.size(), sessionCoverage);
        String status = determineStatus(quality, heartRate, temperature, highEdaEpisodes);

        List<String> findings = new ArrayList<>();
        findings.add(String.format(
                Locale.US,
                "%d raw events and %d minute trend points were recorded from %s to %s.",
                rawRows.size(),
                minuteRows.size(),
                formatTime(firstAt),
                formatTime(lastAt)
        ));
        findings.add(String.format(
                Locale.US,
                "Session sampling coverage was %.1f%%; full-day coverage was %.1f%%.",
                sessionCoverage,
                dayCoverage
        ));
        if (!heartRates.isEmpty()) {
            findings.add(String.format(
                    Locale.US,
                    "Heart rate averaged %.1f bpm with a range of %.0f-%.0f bpm; %d readings were outside 50-100 bpm.",
                    heartRate.average(),
                    heartRate.min(),
                    heartRate.max(),
                    heartRate.outOfRangeCount()
            ));
        }
        if (!temperatures.isEmpty()) {
            findings.add(String.format(
                    Locale.US,
                    "Estimated body temperature averaged %.1f C with a range of %.1f-%.1f C; %d worn-state readings were outside 35.0-37.8 C.",
                    temperature.average(),
                    temperature.min(),
                    temperature.max(),
                    temperature.outOfRangeCount()
            ));
        }
        if (!validEdaValues.isEmpty()) {
            findings.add(String.format(
                    Locale.US,
                    "%d usable EDA samples formed %d sessions, including %d sustained elevated-response sessions.",
                    validEdaValues.size(),
                    edaEpisodes.size(),
                    highEdaEpisodes
            ));
        }
        if (excludedNotWorn > 0) {
            findings.add(excludedNotWorn + " physiological observations were excluded because the watch was not worn or was charging.");
        }
        if (artifactEdaSamples > 0) {
            findings.add(artifactEdaSamples + " EDA samples were excluded as zero or above the 5.0 uS artifact ceiling.");
        }
        if (wornStateEvents >= 10) {
            findings.add(String.format(
                    Locale.US,
                    "Wear detection changed state %d times, including %d not-worn events; frequent toggling can indicate loose contact.",
                    wornStateEvents,
                    notWornStateEvents
            ));
        }
        if (!alerts.isEmpty()) {
            findings.add(String.format(
                    Locale.US,
                    "%d alerts were recorded by the system: %d critical and %d warning. Historical alert severity is shown for audit only and does not determine this daily health status.",
                    alerts.size(),
                    criticalAlerts,
                    warningAlerts
            ));
        }

        List<String> recommendations = new ArrayList<>();
        if ("poor".equals(quality)) {
            recommendations.add("Improve wear time and network continuity before using this day for a health conclusion.");
        }
        if (wornStateEvents >= 10) {
            recommendations.add("Check watch fit and skin contact because wear-state switching was unusually frequent.");
        }
        if (highEdaEpisodes > 0) {
            recommendations.add("Review elevated EDA periods together with activity, heart rate and the resident's reported condition.");
        }
        if (temperature.outOfRangeCount() > 0) {
            recommendations.add("Confirm abnormal wearable temperature with a clinical thermometer.");
        }
        if (heartRate.outOfRangeCount() > 0) {
            recommendations.add("Repeat heart-rate measurement at rest and escalate if symptoms or repeated abnormal readings are present.");
        }
        if (recommendations.isEmpty()) {
            recommendations.add("Continue routine monitoring and compare trends across several days.");
        }

        return new AnalysisAccumulator(
                watchId,
                date,
                status,
                quality,
                rawRows.size(),
                minuteRows.size(),
                firstAt,
                lastAt,
                round(sessionCoverage, 1),
                round(dayCoverage, 1),
                excludedNotWorn,
                artifactEdaSamples,
                wornStateEvents,
                notWornStateEvents,
                heartRate,
                temperature,
                eda,
                edaEpisodes.size(),
                highEdaEpisodes,
                alerts.size(),
                (int) criticalAlerts,
                (int) warningAlerts,
                findings,
                recommendations
        );
    }

    private List<EdaEpisode> buildEdaEpisodes(List<EdaSample> samples) {
        List<EdaEpisode> episodes = new ArrayList<>();
        List<EdaSample> current = new ArrayList<>();
        EdaSample previous = null;

        for (EdaSample sample : samples) {
            boolean newSession = previous != null
                    && (sample.recordedAt() == null
                    || previous.recordedAt() == null
                    || Duration.between(previous.recordedAt(), sample.recordedAt()).toSeconds() > 8
                    || sample.validSampleCount() != null
                    && previous.validSampleCount() != null
                    && sample.validSampleCount() <= previous.validSampleCount());
            if (newSession && !current.isEmpty()) {
                episodes.add(EdaEpisode.of(current));
                current = new ArrayList<>();
            }
            current.add(sample);
            previous = sample;
        }
        if (!current.isEmpty()) {
            episodes.add(EdaEpisode.of(current));
        }
        return episodes;
    }

    private Map<String, Object> buildEmptyResponse(String watchId, LocalDate date) {
        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("watchId", watchId);
        response.put("date", date.toString());
        response.put("generatedAt", LocalDateTime.now().toString());
        response.put("dataAvailable", false);
        response.put("lastAvailableDate", watchDataRepository.findLatestAvailableReadingDate(watchId).orElse(null));
        response.put("status", "insufficient");
        response.put("statusLabel", "No data today");
        response.put("analysisSource", "local-rules");
        response.put("analysis", "No watch data has been recorded for this date. Health status cannot be inferred from missing data.");
        response.put("dataQuality", Map.of(
                "level", "poor",
                "rawEventCount", 0,
                "minutePointCount", 0,
                "sessionCoveragePercent", 0.0,
                "dayCoveragePercent", 0.0
        ));
        response.put("metrics", Map.of());
        response.put("alertSummary", Map.of("total", 0, "critical", 0, "warning", 0));
        response.put("findings", List.of("No physiological or wear-state records are available for the selected date."));
        response.put("recommendations", List.of("Check watch wear status, battery, Bluetooth and network connectivity."));
        return response;
    }

    private String buildLocalNarrative(AnalysisAccumulator result) {
        StringBuilder narrative = new StringBuilder();
        narrative.append(statusLabel(result.status())).append(". ");
        if ("poor".equals(result.quality())) {
            narrative.append("Data coverage is limited, so conclusions should be treated as preliminary. ");
        }
        if (result.heartRate().count() > 0) {
            narrative.append(String.format(
                    Locale.US,
                    "Heart rate was generally %s (average %.1f bpm, range %.0f-%.0f). ",
                    result.heartRate().outOfRangeCount() == 0 ? "within the configured range" : "occasionally outside the configured range",
                    result.heartRate().average(),
                    result.heartRate().min(),
                    result.heartRate().max()
            ));
        }
        if (result.temperature().count() > 0) {
            narrative.append(String.format(
                    Locale.US,
                    "Worn-state temperature averaged %.1f C. ",
                    result.temperature().average()
            ));
        }
        if (result.highEdaEpisodes() > 0) {
            narrative.append(String.format(
                    Locale.US,
                    "%d sustained elevated EDA session(s) were detected; these are not diagnostic and should be checked against activity and symptoms. ",
                    result.highEdaEpisodes()
            ));
        } else if (result.eda().count() > 0) {
            narrative.append("No sustained elevated EDA session was confirmed. ");
        }
        narrative.append(result.recommendations().get(0));
        return narrative.toString().trim();
    }

    private String requestAiNarrative(Map<String, Object> analysisPayload, String fallback) {
        if (!aiEnabled || zhipuApiKey == null || zhipuApiKey.isBlank()) {
            return fallback;
        }

        try {
            Map<String, Object> compact = Map.of(
                    "date", analysisPayload.get("date"),
                    "status", analysisPayload.get("status"),
                    "dataQuality", analysisPayload.get("dataQuality"),
                    "metrics", analysisPayload.get("metrics"),
                    "alertSummary", analysisPayload.get("alertSummary"),
                    "findings", analysisPayload.get("findings")
            );
            String prompt = """
                    Review this elderly wearable daily summary. Produce one concise paragraph in plain English.
                    Clearly separate measured facts from possible explanations. Do not diagnose disease.
                    Mention limited data coverage when present and give one practical next step.
                    Summary:
                    """ + objectMapper.writeValueAsString(compact);
            String requestJson = objectMapper.writeValueAsString(Map.of(
                    "model", aiModel,
                    "temperature", 0.2,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are a cautious wearable-health data assistant."),
                            Map.of("role", "user", "content", prompt)
                    )
            ));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(aiEndpoint))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + zhipuApiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                LOGGER.warn("Zhipu daily analysis returned HTTP {}", response.statusCode());
                return fallback;
            }
            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("").trim();
            return content.isEmpty() ? fallback : content;
        } catch (Exception ex) {
            LOGGER.warn("Zhipu daily analysis failed: {}", ex.getMessage());
            return fallback;
        }
    }

    private String determineQuality(int rawCount, int hrCount, int tempCount, int edaCount, double sessionCoverage) {
        int availableMetrics = (hrCount > 0 ? 1 : 0) + (tempCount > 0 ? 1 : 0) + (edaCount > 0 ? 1 : 0);
        if (rawCount < 10 || availableMetrics == 0 || sessionCoverage < 20.0) {
            return "poor";
        }
        if (availableMetrics < 2 || sessionCoverage < 50.0) {
            return "fair";
        }
        return "good";
    }

    private String determineStatus(
            String quality,
            MetricStats heartRate,
            MetricStats temperature,
            int highEdaEpisodes
    ) {
        boolean repeatedCriticalHeartRate = heartRate.count() >= 2
                && (heartRate.min() != null && heartRate.min() < 40.0
                || heartRate.max() != null && heartRate.max() > 130.0);
        boolean repeatedCriticalTemperature = temperature.outOfRangeCount() >= 2
                && (temperature.min() != null && temperature.min() <= 34.5
                || temperature.max() != null && temperature.max() >= 38.5);
        if (repeatedCriticalHeartRate || repeatedCriticalTemperature) {
            return "critical";
        }
        if (heartRate.outOfRangeCount() >= 2 || temperature.outOfRangeCount() >= 2 || highEdaEpisodes > 0) {
            return "attention";
        }
        if ("poor".equals(quality)) {
            return "insufficient";
        }
        return "stable";
    }

    private String statusLabel(String status) {
        return switch (status) {
            case "critical" -> "Critical findings require review";
            case "attention" -> "Some findings need attention";
            case "stable" -> "No sustained abnormal pattern was detected";
            default -> "Available data is insufficient for a reliable conclusion";
        };
    }

    private int elapsedMinutesFor(LocalDate date) {
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        if (date.isAfter(today)) {
            return 0;
        }
        if (date.isBefore(today)) {
            return 24 * 60;
        }
        return Math.max(1, LocalTime.now().getHour() * 60 + LocalTime.now().getMinute() + 1);
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? "--:--" : value.format(DISPLAY_TIME);
    }

    private static double median(List<Double> values) {
        if (values.isEmpty()) {
            return 0.0;
        }
        List<Double> sorted = values.stream().sorted(Comparator.naturalOrder()).toList();
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 0
                ? (sorted.get(middle - 1) + sorted.get(middle)) / 2.0
                : sorted.get(middle);
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

    private static double round(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }

    private record EdaSample(
            LocalDateTime recordedAt,
            Double value,
            Integer validSampleCount,
            boolean worn,
            boolean charging
    ) {
    }

    private record EdaEpisode(
            List<Double> validValues,
            boolean sustainedHigh
    ) {
        static EdaEpisode of(List<EdaSample> samples) {
            List<Double> values = samples.stream()
                    .filter(sample -> sample.worn() && !sample.charging())
                    .map(EdaSample::value)
                    .filter(Objects::nonNull)
                    .filter(value -> value > 0.0 && value <= 5.0)
                    .toList();
            if (values.size() < 10) {
                return new EdaEpisode(values, false);
            }
            double median = HealthAnalysisService.median(values);
            long highCount = values.stream().filter(value -> value >= 2.0).count();
            return new EdaEpisode(values, median >= 2.0 && highCount / (double) values.size() >= 0.7);
        }
    }

    private record MetricStats(
            int count,
            Double average,
            Double min,
            Double max,
            int outOfRangeCount
    ) {
        static MetricStats of(List<Double> values, double normalLow, double normalHigh) {
            if (values.isEmpty()) {
                return new MetricStats(0, null, null, null, 0);
            }
            double average = values.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            double min = values.stream().mapToDouble(Double::doubleValue).min().orElse(0.0);
            double max = values.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
            int outOfRange = (int) values.stream()
                    .filter(value -> value < normalLow || value > normalHigh)
                    .count();
            return new MetricStats(
                    values.size(),
                    round(average, 2),
                    round(min, 2),
                    round(max, 2),
                    outOfRange
            );
        }

        Map<String, Object> toMap() {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("count", count);
            result.put("average", average);
            result.put("min", min);
            result.put("max", max);
            result.put("outOfRangeCount", outOfRangeCount);
            return result;
        }
    }

    private record AnalysisAccumulator(
            String watchId,
            LocalDate date,
            String status,
            String quality,
            int rawEventCount,
            int minutePointCount,
            LocalDateTime firstAt,
            LocalDateTime lastAt,
            double sessionCoverage,
            double dayCoverage,
            int excludedNotWorn,
            int artifactEdaSamples,
            int wearStateEvents,
            int notWornStateEvents,
            MetricStats heartRate,
            MetricStats temperature,
            MetricStats eda,
            int edaEpisodeCount,
            int highEdaEpisodes,
            int alertCount,
            int criticalAlertCount,
            int warningAlertCount,
            List<String> findings,
            List<String> recommendations
    ) {
        LinkedHashMap<String, Object> toResponse() {
            LinkedHashMap<String, Object> response = new LinkedHashMap<>();
            response.put("watchId", watchId);
            response.put("date", date.toString());
            response.put("generatedAt", LocalDateTime.now().toString());
            response.put("dataAvailable", true);
            response.put("lastAvailableDate", date.toString());
            response.put("status", status);
            response.put("statusLabel", switch (status) {
                case "critical" -> "Critical";
                case "attention" -> "Needs attention";
                case "stable" -> "Stable";
                default -> "Limited data";
            });

            LinkedHashMap<String, Object> qualityMap = new LinkedHashMap<>();
            qualityMap.put("level", quality);
            qualityMap.put("rawEventCount", rawEventCount);
            qualityMap.put("minutePointCount", minutePointCount);
            qualityMap.put("firstReadingAt", firstAt == null ? null : firstAt.toString());
            qualityMap.put("lastReadingAt", lastAt == null ? null : lastAt.toString());
            qualityMap.put("sessionCoveragePercent", sessionCoverage);
            qualityMap.put("dayCoveragePercent", dayCoverage);
            qualityMap.put("excludedNotWornCount", excludedNotWorn);
            qualityMap.put("artifactEdaCount", artifactEdaSamples);
            qualityMap.put("wearStateEventCount", wearStateEvents);
            qualityMap.put("notWornStateEventCount", notWornStateEvents);
            response.put("dataQuality", qualityMap);

            LinkedHashMap<String, Object> metrics = new LinkedHashMap<>();
            metrics.put("heartRate", heartRate.toMap());
            metrics.put("temperature", temperature.toMap());
            LinkedHashMap<String, Object> edaMap = new LinkedHashMap<>(eda.toMap());
            edaMap.put("episodeCount", edaEpisodeCount);
            edaMap.put("sustainedHighEpisodeCount", highEdaEpisodes);
            metrics.put("eda", edaMap);
            response.put("metrics", metrics);
            response.put("alertSummary", Map.of(
                    "total", alertCount,
                    "critical", criticalAlertCount,
                    "warning", warningAlertCount
            ));
            response.put("findings", findings);
            response.put("recommendations", recommendations);
            return response;
        }
    }
}
