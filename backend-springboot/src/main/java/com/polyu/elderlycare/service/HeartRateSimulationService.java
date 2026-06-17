package com.polyu.elderlycare.service;

import com.polyu.elderlycare.entity.Resident;
import com.polyu.elderlycare.repository.ResidentRepository;
import com.polyu.elderlycare.repository.WatchDataRepository;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HeartRateSimulationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(HeartRateSimulationService.class);
    private static final double MIN_HIGH_BPM = 101.0;
    private static final double MAX_BPM = 240.0;

    private final HeartRateOverrideRegistry overrideRegistry;
    private final ResidentRepository residentRepository;
    private final WatchDataRepository watchDataRepository;
    private final WatchUpdateStreamService watchUpdateStreamService;
    private final HealthMonitoringService healthMonitoringService;
    private final HeartRateAlertEmailService emailService;

    public HeartRateSimulationService(
            HeartRateOverrideRegistry overrideRegistry,
            ResidentRepository residentRepository,
            WatchDataRepository watchDataRepository,
            WatchUpdateStreamService watchUpdateStreamService,
            HealthMonitoringService healthMonitoringService,
            HeartRateAlertEmailService emailService
    ) {
        this.overrideRegistry = overrideRegistry;
        this.residentRepository = residentRepository;
        this.watchDataRepository = watchDataRepository;
        this.watchUpdateStreamService = watchUpdateStreamService;
        this.healthMonitoringService = healthMonitoringService;
        this.emailService = emailService;
    }

    @Transactional
    public void activate(String watchId, double requestedBpm, String emailRecipient) {
        Resident resident = requireResident(watchId);
        double bpm = Math.min(MAX_BPM, Math.max(MIN_HIGH_BPM, requestedBpm));
        HeartRateOverrideRegistry.ActivationResult activation = overrideRegistry.activate(watchId, bpm);

        String message = String.format(
                Locale.US,
                "Heart rate is above the expected range (simulated %.0f bpm).",
                bpm
        );
        String analysis = "The high-heart-rate simulator is active. Check the resident immediately and "
                + "confirm the reading with the watch or a clinical device; symptoms should take priority.";
        syncCriticalAlert(resident.getId(), message + HealthMonitoringService.ANALYSIS_MARKER + analysis);

        if (activation.newlyActive()) {
            emailService.sendHighHeartRate(resident, bpm, emailRecipient);
        }
        publishUpdate(resident, "simulation_high");
        LOGGER.info("High-heart-rate simulation activated for watch {} at {} bpm", watchId, bpm);
    }

    @Transactional
    public void deactivate(String watchId) {
        Resident resident = requireResident(watchId);
        boolean wasActive = overrideRegistry.deactivate(watchId).isPresent();
        watchDataRepository.resolveActiveAlertsByType(resident.getId(), "heart_rate");
        healthMonitoringService.evaluateHeartRateNow(resident.getId(), watchId);
        publishUpdate(resident, "simulation_released");
        LOGGER.info("High-heart-rate simulation {} for watch {}",
                wasActive ? "released" : "was already inactive", watchId);
    }

    private Resident requireResident(String watchId) {
        return residentRepository.findByWatchId(watchId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown watch id: " + watchId));
    }

    private void syncCriticalAlert(Integer residentId, String finalMessage) {
        Optional<Map<String, Object>> existing = watchDataRepository.findActiveAlertByType(residentId, "heart_rate");
        if (existing.isEmpty()) {
            watchDataRepository.createAlert(residentId, "heart_rate", "critical", finalMessage);
            existing = watchDataRepository.findActiveAlertByType(residentId, "heart_rate");
        }
        if (existing.isEmpty()) {
            return;
        }

        Integer alertId = toInteger(existing.get().get("id"));
        String currentSeverity = Objects.toString(existing.get().get("severity"), "");
        String currentMessage = Objects.toString(existing.get().get("message"), "");
        if (alertId != null
                && (!"critical".equals(currentSeverity) || !finalMessage.equals(currentMessage))) {
            watchDataRepository.updateAlert(alertId, "critical", finalMessage);
        }
        if (alertId != null) {
            watchDataRepository.resolveDuplicateActiveAlerts(residentId, "heart_rate", alertId);
        }
    }

    private void publishUpdate(Resident resident, String eventType) {
        watchUpdateStreamService.publishWatchUpdate(
                resident.getWatchId(),
                resident.getId(),
                "heart_rate",
                eventType,
                System.currentTimeMillis()
        );
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
}
