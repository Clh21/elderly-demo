package com.polyu.elderlycare.dto;

public record IndoorSimulatorStatusResponse(
        boolean enabled,
        String source,
        double x,
        double y,
        String updatedAt
) {
}
