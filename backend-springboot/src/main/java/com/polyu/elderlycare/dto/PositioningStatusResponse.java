package com.polyu.elderlycare.dto;

public record PositioningStatusResponse(
        boolean enabled,
        boolean available,
        String state,
        String message,
        String brokerUri,
        String topic,
        String updatedAt
) {
}
