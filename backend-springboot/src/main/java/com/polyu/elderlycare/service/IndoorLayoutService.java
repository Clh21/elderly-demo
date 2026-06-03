package com.polyu.elderlycare.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.polyu.elderlycare.dto.IndoorLayoutResponse;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class IndoorLayoutService {

    private static final Logger log = LoggerFactory.getLogger(IndoorLayoutService.class);
    private static final double MIN_ROOM_SIZE_M = 1.0;
    private static final double MAX_ROOM_SIZE_M = 100.0;

    private final ObjectMapper objectMapper;
    private final AtomicReference<IndoorLayoutResponse> activeLayout = new AtomicReference<>();

    @Value("${app.indoor-layout.storage-file:./data/indoor-layout-active.json}")
    private String storageFile;

    public IndoorLayoutService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.copy().enable(SerializationFeature.INDENT_OUTPUT);
    }

    @PostConstruct
    public void load() {
        Path path = Path.of(storageFile);
        if (Files.exists(path)) {
            try {
                IndoorLayoutResponse stored = objectMapper.readValue(path.toFile(), IndoorLayoutResponse.class);
                activeLayout.set(sanitize(stored));
                return;
            } catch (Exception ex) {
                log.warn("Failed to load indoor layout from {}: {}", path, ex.getMessage());
            }
        }

        activeLayout.set(defaultLayout());
    }

    public IndoorLayoutResponse getActiveLayout() {
        IndoorLayoutResponse layout = activeLayout.get();
        if (layout == null) {
            layout = defaultLayout();
            activeLayout.set(layout);
        }
        return layout;
    }

    public synchronized IndoorLayoutResponse saveActiveLayout(IndoorLayoutResponse request) {
        IndoorLayoutResponse sanitized = sanitize(request);
        activeLayout.set(sanitized);
        persist(sanitized);
        return sanitized;
    }

    public synchronized IndoorLayoutResponse resetActiveLayout() {
        IndoorLayoutResponse layout = defaultLayout();
        activeLayout.set(layout);
        persist(layout);
        return layout;
    }

    private void persist(IndoorLayoutResponse layout) {
        Path path = Path.of(storageFile);
        try {
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            objectMapper.writeValue(path.toFile(), layout);
        } catch (IOException ex) {
            log.warn("Failed to persist indoor layout to {}: {}", path, ex.getMessage());
        }
    }

    private IndoorLayoutResponse sanitize(IndoorLayoutResponse request) {
        if (request == null) {
            throw new IllegalArgumentException("Layout payload is required");
        }

        double widthM = clampFinite(request.widthM(), MIN_ROOM_SIZE_M, MAX_ROOM_SIZE_M, 11.0);
        double heightM = clampFinite(request.heightM(), MIN_ROOM_SIZE_M, MAX_ROOM_SIZE_M, 5.0);

        List<IndoorLayoutResponse.Zone> zones = new ArrayList<>();
        if (request.zones() != null) {
            for (IndoorLayoutResponse.Zone zone : request.zones()) {
                if (zone == null) {
                    continue;
                }
                double width = clampFinite(zone.width(), 0.1, widthM, 1.0);
                double height = clampFinite(zone.height(), 0.1, heightM, 1.0);
                double x = clampFinite(zone.x(), 0.0, widthM - width, 0.0);
                double y = clampFinite(zone.y(), 0.0, heightM - height, 0.0);
                zones.add(new IndoorLayoutResponse.Zone(
                        firstNonBlank(zone.id(), "zone-" + shortId()),
                        firstNonBlank(zone.label(), "Zone"),
                        firstNonBlank(zone.type(), "custom"),
                        x,
                        y,
                        width,
                        height,
                        firstNonBlank(zone.color(), "#6366F1"),
                        firstNonBlank(zone.notes(), "")
                ));
            }
        }

        List<IndoorLayoutResponse.Furniture> furniture = new ArrayList<>();
        if (request.furniture() != null) {
            for (IndoorLayoutResponse.Furniture item : request.furniture()) {
                if (item == null) {
                    continue;
                }
                double width = clampFinite(item.width(), 0.1, widthM, 0.8);
                double height = clampFinite(item.height(), 0.1, heightM, 0.8);
                double x = clampFinite(item.x(), 0.0, widthM - width, 0.0);
                double y = clampFinite(item.y(), 0.0, heightM - height, 0.0);
                String type = firstNonBlank(item.type(), "custom");
                String id = firstNonBlank(item.id(), type + "-" + shortId());
                furniture.add(new IndoorLayoutResponse.Furniture(
                        id,
                        firstNonBlank(item.label(), type),
                        type,
                        x,
                        y,
                        width,
                        height,
                        clampFinite(item.rotation(), -360.0, 360.0, 0.0),
                        firstNonBlank(item.occupancyTopic(), "indoor/furniture/" + id + "/occupancy"),
                        firstNonBlank(item.occupancyState(), "unknown")
                ));
            }
        }

        List<IndoorLayoutResponse.Anchor> anchors = new ArrayList<>();
        if (request.anchors() != null) {
            for (IndoorLayoutResponse.Anchor anchor : request.anchors()) {
                if (anchor == null) {
                    continue;
                }
                String id = firstNonBlank(anchor.id(), "anchor_" + shortId());
                anchors.add(new IndoorLayoutResponse.Anchor(
                        id,
                        clampFinite(anchor.x(), 0.0, widthM, 0.0),
                        clampFinite(anchor.y(), 0.0, heightM, 0.0),
                        clampFinite(anchor.z(), 0.0, 5.0, 1.0),
                        clampFinite(anchor.txPower(), -120.0, -20.0, -65.0),
                        clampFinite(anchor.pathLossExponent(), 1.0, 6.0, 2.0),
                        firstNonBlank(anchor.rssiTopic(), "indoor/ble/" + id + "/rssi"),
                        anchor.enabled()
                ));
            }
        }

        IndoorLayoutResponse.PositioningSettings positioning = sanitizePositioning(request.positioning());

        return new IndoorLayoutResponse(
                firstNonBlank(request.id(), "active-room"),
                firstNonBlank(request.name(), "Indoor Room"),
                widthM,
                heightM,
                List.copyOf(zones),
                List.copyOf(furniture),
                List.copyOf(anchors),
                positioning,
                Instant.now().toString()
        );
    }

    private IndoorLayoutResponse.PositioningSettings sanitizePositioning(
            IndoorLayoutResponse.PositioningSettings positioning
    ) {
        if (positioning == null) {
            return new IndoorLayoutResponse.PositioningSettings(
                    "indoor/location/target_01",
                    true,
                    0.18,
                    5.0
            );
        }

        return new IndoorLayoutResponse.PositioningSettings(
                firstNonBlank(positioning.targetTopic(), "indoor/location/target_01"),
                positioning.strictInRoomOutput(),
                clampFinite(positioning.smoothingAlpha(), 0.0, 1.0, 0.18),
                clampFinite(positioning.maxReadingAgeSec(), 1.0, 60.0, 5.0)
        );
    }

    private IndoorLayoutResponse defaultLayout() {
        return new IndoorLayoutResponse(
                "active-room",
                "Demo Care Room",
                11.0,
                5.0,
                List.of(
                        new IndoorLayoutResponse.Zone(
                                "bedroom",
                                "Bedroom",
                                "bedroom",
                                0.0,
                                0.0,
                                6.8,
                                3.4,
                                "#6366F1",
                                "Main sleeping and resting area"
                        ),
                        new IndoorLayoutResponse.Zone(
                                "toilet",
                                "Toilet",
                                "toilet",
                                0.0,
                                3.4,
                                6.8,
                                1.6,
                                "#0EA5E9",
                                "Toilet and hygiene area"
                        ),
                        new IndoorLayoutResponse.Zone(
                                "living_room",
                                "Living Room",
                                "living_room",
                                6.8,
                                0.0,
                                4.2,
                                5.0,
                                "#F59E0B",
                                "Living and activity area"
                        )
                ),
                List.of(
                        new IndoorLayoutResponse.Furniture(
                                "bed-01",
                                "Bed",
                                "bed",
                                0.6,
                                0.5,
                                2.2,
                                1.2,
                                0.0,
                                "indoor/furniture/bed-01/occupancy",
                                "unknown"
                        ),
                        new IndoorLayoutResponse.Furniture(
                                "sofa-01",
                                "Sofa",
                                "sofa",
                                7.5,
                                1.0,
                                2.0,
                                0.9,
                                0.0,
                                "indoor/furniture/sofa-01/occupancy",
                                "unknown"
                        ),
                        new IndoorLayoutResponse.Furniture(
                                "toilet-01",
                                "Toilet",
                                "toilet",
                                1.0,
                                3.75,
                                0.9,
                                0.8,
                                0.0,
                                "indoor/furniture/toilet-01/occupancy",
                                "unknown"
                        )
                ),
                List.of(
                        new IndoorLayoutResponse.Anchor(
                                "anchor_01",
                                0.0,
                                5.0,
                                1.0,
                                -65.47,
                                2.0,
                                "indoor/ble/anchor_01/rssi",
                                true
                        ),
                        new IndoorLayoutResponse.Anchor(
                                "anchor_02",
                                0.0,
                                0.0,
                                1.0,
                                -66.95,
                                2.0,
                                "indoor/ble/anchor_02/rssi",
                                true
                        ),
                        new IndoorLayoutResponse.Anchor(
                                "anchor_03",
                                11.0,
                                0.0,
                                1.0,
                                -68.04,
                                2.0,
                                "indoor/ble/anchor_03/rssi",
                                true
                        )
                ),
                new IndoorLayoutResponse.PositioningSettings(
                        "indoor/location/target_01",
                        true,
                        0.18,
                        5.0
                ),
                Instant.now().toString()
        );
    }

    private double clampFinite(double value, double min, double max, double fallback) {
        double candidate = Double.isFinite(value) ? value : fallback;
        double safeMax = Math.max(min, max);
        return Math.max(min, Math.min(safeMax, candidate));
    }

    private String firstNonBlank(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim();
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
