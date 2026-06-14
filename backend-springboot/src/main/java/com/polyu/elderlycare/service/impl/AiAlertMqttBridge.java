package com.polyu.elderlycare.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polyu.elderlycare.entity.AlertSeverity;
import com.polyu.elderlycare.entity.AlertType;
import com.polyu.elderlycare.entity.Resident;
import com.polyu.elderlycare.repository.ResidentRepository;
import com.polyu.elderlycare.repository.WatchDataRepository;
import com.polyu.elderlycare.service.HealthMonitoringService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.paho.client.mqttv3.IMqttClient;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@DependsOn("localMqttBrokerService")
public class AiAlertMqttBridge {

    private static final Logger LOGGER = LoggerFactory.getLogger(AiAlertMqttBridge.class);
    private static final String CONFIRMED_TOPIC = "indoor/alert/confirmed";

    private final ResidentRepository residentRepository;
    private final WatchDataRepository watchDataRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.ai-alert.enabled:true}")
    private boolean enabled;

    @Value("${app.ai-alert.mqtt-url:tcp://127.0.0.1:1883}")
    private String brokerUrl;

    @Value("${app.ai-alert.default-watch-id:real-watch-001}")
    private String defaultWatchId;

    private IMqttClient mqttClient;

    public AiAlertMqttBridge(
            ResidentRepository residentRepository,
            WatchDataRepository watchDataRepository,
            ObjectMapper objectMapper
    ) {
        this.residentRepository = residentRepository;
        this.watchDataRepository = watchDataRepository;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        ensureConnected();
    }

    @Scheduled(initialDelay = 15_000, fixedDelay = 15_000)
    public synchronized void ensureConnected() {
        if (!enabled || mqttClient != null && mqttClient.isConnected()) {
            return;
        }

        try {
            closeClient();
            String clientId = "elderlycare-ai-alert-" + UUID.randomUUID().toString().substring(0, 8);
            mqttClient = new MqttClient(brokerUrl, clientId, new MemoryPersistence());

            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(true);
            options.setConnectionTimeout(8);
            mqttClient.connect(options);
            mqttClient.subscribe(CONFIRMED_TOPIC, 1, (topic, message) ->
                    handleConfirmedAlert(new String(message.getPayload(), StandardCharsets.UTF_8)));
            LOGGER.info("AI alert bridge connected to {} and subscribed to {}", brokerUrl, CONFIRMED_TOPIC);
        } catch (Exception ex) {
            LOGGER.warn("AI alert bridge is waiting for MQTT broker {}: {}", brokerUrl, ex.getMessage());
        }
    }

    public void handleConfirmedAlert(String payload) {
        try {
            JsonNode json = objectMapper.readTree(payload);
            Resident resident = resolveResident(json).orElse(null);
            if (resident == null) {
                LOGGER.warn("Discarded AI alert without a known resident or watch: {}", payload);
                return;
            }

            AlertType type = parseType(json.path("type").asText("fall_detection"));
            AlertSeverity severity = parseSeverity(json.path("severity").asText("critical"));
            String message = json.path("message").asText("An abnormal event was detected.").trim();
            String analysis = json.path("ai_analysis").asText(
                    "The event passed preliminary verification. Check the resident and nearby sensor context."
            ).trim();
            String finalMessage = message + HealthMonitoringService.ANALYSIS_MARKER + analysis;

            Optional<Map<String, Object>> existing = watchDataRepository.findActiveAlertByType(
                    resident.getId(),
                    type.getValue()
            );
            if (existing.isEmpty()) {
                watchDataRepository.createAlert(
                        resident.getId(),
                        type.getValue(),
                        severity.getValue(),
                        finalMessage
                );
                existing = watchDataRepository.findActiveAlertByType(resident.getId(), type.getValue());
            }

            if (existing.isPresent()) {
                Integer alertId = ((Number) existing.get().get("id")).intValue();
                watchDataRepository.updateAlert(alertId, severity.getValue(), finalMessage);
                watchDataRepository.resolveDuplicateActiveAlerts(resident.getId(), type.getValue(), alertId);
            }
        } catch (Exception ex) {
            LOGGER.error("Failed to store confirmed AI alert payload: {}", payload, ex);
        }
    }

    private Optional<Resident> resolveResident(JsonNode json) {
        if (json.hasNonNull("resident_id")) {
            Optional<Resident> byId = residentRepository.findById(json.get("resident_id").asInt());
            if (byId.isPresent()) {
                return byId;
            }
        }
        String watchId = json.path("watch_id").asText(defaultWatchId).trim();
        return watchId.isEmpty() ? Optional.empty() : residentRepository.findByWatchId(watchId);
    }

    private AlertType parseType(String rawType) {
        try {
            return AlertType.fromValue(rawType);
        } catch (IllegalArgumentException ex) {
            return AlertType.FALL_DETECTION;
        }
    }

    private AlertSeverity parseSeverity(String rawSeverity) {
        try {
            return AlertSeverity.fromValue(rawSeverity);
        } catch (IllegalArgumentException ex) {
            return AlertSeverity.CRITICAL;
        }
    }

    @PreDestroy
    public synchronized void cleanup() {
        closeClient();
    }

    private void closeClient() {
        if (mqttClient == null) {
            return;
        }
        try {
            if (mqttClient.isConnected()) {
                mqttClient.disconnect();
            }
            mqttClient.close();
        } catch (Exception ex) {
            LOGGER.debug("Failed to close AI alert MQTT client cleanly: {}", ex.getMessage());
        } finally {
            mqttClient = null;
        }
    }
}
