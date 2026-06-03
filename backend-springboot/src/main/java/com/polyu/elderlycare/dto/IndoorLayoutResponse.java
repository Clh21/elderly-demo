package com.polyu.elderlycare.dto;

import java.util.List;

public record IndoorLayoutResponse(
        String id,
        String name,
        double widthM,
        double heightM,
        List<Zone> zones,
        List<Furniture> furniture,
        List<Anchor> anchors,
        PositioningSettings positioning,
        String updatedAt
) {
    public record Zone(
            String id,
            String label,
            String type,
            double x,
            double y,
            double width,
            double height,
            String color,
            String notes
    ) {
    }

    public record Furniture(
            String id,
            String label,
            String type,
            double x,
            double y,
            double width,
            double height,
            double rotation,
            String occupancyTopic,
            String occupancyState
    ) {
    }

    public record Anchor(
            String id,
            double x,
            double y,
            double z,
            double txPower,
            double pathLossExponent,
            String rssiTopic,
            boolean enabled
    ) {
    }

    public record PositioningSettings(
            String targetTopic,
            boolean strictInRoomOutput,
            double smoothingAlpha,
            double maxReadingAgeSec
    ) {
    }
}
