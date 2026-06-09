package com.polyu.elderlycare.mapper;

import com.polyu.elderlycare.dto.HealthSummaryResponse;
import com.polyu.elderlycare.entity.DailySummary;
import com.polyu.elderlycare.repository.HealthSummaryProjection;

public final class HealthSummaryResponseMapper {

    private HealthSummaryResponseMapper() {
    }

    public static HealthSummaryResponse fromDailySummary(DailySummary summary) {
        return new HealthSummaryResponse(
                summary.getSummaryDate(),
                summary.getAvgHeartRate(),
                summary.getAvgTemperature(),
                summary.getAvgEda(),
                summary.getTotalSteps(),
                summary.getAlertCount()
        );
    }

    public static HealthSummaryResponse fromProjection(HealthSummaryProjection summary) {
        return new HealthSummaryResponse(
                summary.getDate(),
                summary.getHeartRate(),
                summary.getTemperature(),
                summary.getEda(),
                summary.getSteps(),
                summary.getAlerts()
        );
    }
}
