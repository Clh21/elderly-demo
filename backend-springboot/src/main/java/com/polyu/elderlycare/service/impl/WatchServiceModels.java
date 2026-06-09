package com.polyu.elderlycare.service.impl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

record EdaMinuteKey(String watchId, LocalDateTime minuteSlot) {
}

record EdaBackfillState(Long lastSampleTimestamp, int lastValidSampleCount) {
}

record EdaBackfillUpdate(
        Long readingId,
        String watchId,
        LocalDateTime minuteSlot,
        int expectedValidSampleCount,
        boolean watchReadingNeedsUpdate,
        String updatedRawPayload
) {
}

record MetricConfig(String column, String unit, String label) {
}

record EdaInterpretation(String stateLabel, Integer stateLevel, String uiStatus) {
}

enum EdaBaselineStage {
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

    String code() {
        return code;
    }

    String label() {
        return label;
    }

    boolean buildable() {
        return buildable;
    }

    static EdaBaselineStage fromCode(String code) {
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

enum EdaBaselineDaypart {
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

    String code() {
        return code;
    }

    String label() {
        return label;
    }
}

record EdaBaselineWindow(
        String day,
        LocalDateTime timestamp,
        EdaBaselineDaypart daypart,
        Double edaValue
) {
}

record EdaBaselineComputation(
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

record WearStatePresentation(String label, String cardStatus, Integer lane, String laneLabel, String color) {
}

record EcgSample(long timestamp, double mv, int index) {
}

record EcgTiming(long durationMs, Double sampleRateHz) {
}

record BiquadCoefficients(double b0, double b1, double b2, double a1, double a2) {
}

record EcgSignalQuality(
        double snrDb,
        double kurtosis,
        double clippingRatio,
        double baselineWanderStdMv,
        String assessment,
        boolean readable
) {
}

record HeartRateStats(
        Double meanHeartRate,
        Double medianHeartRate,
        Double standardDeviation,
        Double minHeartRate,
        Double maxHeartRate,
        int beatCount
) {
}

record EcgRhythmAssessment(
        String result,
        String rhythmStatus,
        Double rrCoefficientOfVariation,
        Double rmssdMs,
        Double pnn50Percent,
        boolean reliable,
        String reason
) {
}

record StoredEcgAnalysis(
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

record EcgAnalysisResult(
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
