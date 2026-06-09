package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.IndoorLayoutResponse;
import com.polyu.elderlycare.dto.IndoorSimulatorStatusResponse;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Generates demo indoor-position payloads when the positioning simulator is enabled.
 */
@Service
public class IndoorPositionSimulationService {

    private final IndoorLayoutService indoorLayoutService;
    private final PositionStreamService positionStreamService;

    private volatile boolean enabled;
    private volatile double currentX = Double.NaN;
    private volatile double currentY = Double.NaN;
    private volatile double targetX = Double.NaN;
    private volatile double targetY = Double.NaN;
    private volatile String updatedAt;

    public IndoorPositionSimulationService(
            IndoorLayoutService indoorLayoutService,
            PositionStreamService positionStreamService,
            @Value("${app.positioning.simulator.enabled:false}") boolean enabled
    ) {
        this.indoorLayoutService = indoorLayoutService;
        this.positionStreamService = positionStreamService;
        this.enabled = enabled;
    }

    /**
     * Publishes one simulated indoor position frame on the configured schedule.
     */
    @Scheduled(fixedDelayString = "${app.positioning.simulator.interval-ms:2000}")
    public void publishSimulatedPosition() {
        if (!enabled) {
            return;
        }

        IndoorLayoutResponse layout = indoorLayoutService.getActiveLayout();
        double width = Math.max(1.0, layout.widthM());
        double height = Math.max(1.0, layout.heightM());

        ensurePosition(width, height);
        moveTowardTarget(width, height);

        List<IndoorLayoutResponse.Anchor> enabledAnchors = layout.anchors() == null
                ? List.of()
                : layout.anchors().stream().filter(IndoorLayoutResponse.Anchor::enabled).toList();

        Map<String, Double> distancesM = new LinkedHashMap<>();
        Map<String, Double> simulatedRssi = new LinkedHashMap<>();
        for (IndoorLayoutResponse.Anchor anchor : enabledAnchors) {
            double distance = Math.sqrt(
                    Math.pow(currentX - anchor.x(), 2.0)
                            + Math.pow(currentY - anchor.y(), 2.0)
                            + Math.pow(anchor.z(), 2.0)
            );
            double measuredDistance = Math.max(0.2, distance + randomNoise(0.035));
            distancesM.put(anchor.id(), round(measuredDistance, 3));

            double safeDistance = Math.max(0.2, measuredDistance);
            double rssi = anchor.txPower() - 10.0 * anchor.pathLossExponent() * Math.log10(safeDistance);
            simulatedRssi.put(anchor.id(), round(rssi + randomNoise(1.2), 2));
        }

        int anchorCount = enabledAnchors.size();
        double spreadM = 0.045 + ThreadLocalRandom.current().nextDouble(0.05) + Math.max(0, 3 - anchorCount) * 0.12;
        double residualRmsM = spreadM * ThreadLocalRandom.current().nextDouble(0.8, 1.8);
        double confidence = clamp(0.42 + anchorCount * 0.14 - residualRmsM * 0.08, 0.2, 0.98);
        Instant now = Instant.now();
        updatedAt = now.toString();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("x", round(currentX, 3));
        payload.put("y", round(currentY, 3));
        payload.put("raw_x", round(currentX + randomNoise(0.06), 3));
        payload.put("raw_y", round(currentY + randomNoise(0.06), 3));
        payload.put("spread_m", round(spreadM, 3));
        payload.put("sync_span_s", 0.25);
        payload.put("sync_frames", Math.max(1, anchorCount));
        payload.put("confidence", round(confidence, 3));
        payload.put("solver", anchorCount >= 3 ? "simulated_trilateration" : "simulated_centroid");
        payload.put("residual_rms_m", round(residualRmsM, 3));
        payload.put("unit", "m");
        payload.put("anchors_used", enabledAnchors.stream().map(IndoorLayoutResponse.Anchor::id).toList());
        payload.put("distances_m", distancesM);
        payload.put("simulated_rssi", simulatedRssi);
        payload.put("layoutId", layout.id());
        payload.put("source", "backend-simulator");
        payload.put("ts", now.toString());

        positionStreamService.publishPositionUpdate(payload);
    }

    /**
     * Returns the current simulator state and latest simulated coordinate.
     *
     * @return simulator status payload
     */
    public IndoorSimulatorStatusResponse getStatus() {
        return new IndoorSimulatorStatusResponse(
                enabled,
                "backend-simulator",
                Double.isFinite(currentX) ? round(currentX, 3) : 0.0,
                Double.isFinite(currentY) ? round(currentY, 3) : 0.0,
                updatedAt
        );
    }

    /**
     * Enables or disables simulated indoor position publishing.
     *
     * @param enabled whether the simulator should publish positions
     * @return updated simulator status
     */
    public IndoorSimulatorStatusResponse setEnabled(boolean enabled) {
        this.enabled = enabled;
        this.updatedAt = Instant.now().toString();
        return getStatus();
    }

    private void ensurePosition(double width, double height) {
        if (!Double.isFinite(currentX) || !Double.isFinite(currentY)) {
            currentX = width / 2.0;
            currentY = height / 2.0;
        }
        currentX = clamp(currentX, 0.0, width);
        currentY = clamp(currentY, 0.0, height);

        if (!Double.isFinite(targetX) || !Double.isFinite(targetY)) {
            chooseNewTarget(width, height);
        }
        targetX = clamp(targetX, 0.0, width);
        targetY = clamp(targetY, 0.0, height);
    }

    private void moveTowardTarget(double width, double height) {
        double dx = targetX - currentX;
        double dy = targetY - currentY;
        double distance = Math.hypot(dx, dy);

        if (distance < 0.25) {
            chooseNewTarget(width, height);
            return;
        }

        double step = Math.min(0.38, distance);
        currentX = clamp(currentX + (dx / distance) * step + randomNoise(0.025), 0.0, width);
        currentY = clamp(currentY + (dy / distance) * step + randomNoise(0.025), 0.0, height);
    }

    private void chooseNewTarget(double width, double height) {
        targetX = ThreadLocalRandom.current().nextDouble(0.15, Math.max(0.16, width - 0.15));
        targetY = ThreadLocalRandom.current().nextDouble(0.15, Math.max(0.16, height - 0.15));
    }

    private double randomNoise(double magnitude) {
        return ThreadLocalRandom.current().nextDouble(-magnitude, magnitude);
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private double round(double value, int digits) {
        double scale = Math.pow(10.0, digits);
        return Math.round(value * scale) / scale;
    }
}
