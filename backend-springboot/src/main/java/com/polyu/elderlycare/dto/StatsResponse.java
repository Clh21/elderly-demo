package com.polyu.elderlycare.dto;

import java.time.OffsetDateTime;

public record StatsResponse(
        long totalResidents,
        long activeAlerts,
        long criticalAlerts,
        long warningAlerts,
        long connectedDevices,
        long dataPointsToday,
        OffsetDateTime lastUpdate
) {
}