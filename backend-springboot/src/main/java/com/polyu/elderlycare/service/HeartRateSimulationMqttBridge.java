package com.polyu.elderlycare.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
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
public class HeartRateSimulationMqttBridge {

    private static final Logger LOGGER = LoggerFactory.getLogger(HeartRateSimulationMqttBridge.class);

    private final ObjectMapper objectMapper;
    private final HeartRateSimulationService simulationService;

    @Value("${app.heart-rate-simulation.enabled:true}")
    private boolean enabled;

    @Value("${app.heart-rate-simulation.mqtt-url:tcp://127.0.0.1:1883}")
    private String brokerUrl;

    @Value("${app.heart-rate-simulation.topic:indoor/simulation/heart-rate}")
    private String topic;

    @Value("${app.heart-rate-simulation.default-watch-id:real-watch-001}")
    private String defaultWatchId;

    @Value("${app.heart-rate-simulation.default-bpm:145}")
    private double defaultBpm;

    private IMqttClient mqttClient;

    public HeartRateSimulationMqttBridge(
            ObjectMapper objectMapper,
            HeartRateSimulationService simulationService
    ) {
        this.objectMapper = objectMapper;
        this.simulationService = simulationService;
    }

    @PostConstruct
    public void init() {
        ensureConnected();
    }

    @Scheduled(initialDelay = 10_000, fixedDelay = 10_000)
    public synchronized void ensureConnected() {
        if (!enabled || mqttClient != null && mqttClient.isConnected()) {
            return;
        }

        try {
            closeClient();
            String clientId = "elderlycare-heart-rate-sim-" + UUID.randomUUID().toString().substring(0, 8);
            mqttClient = new MqttClient(brokerUrl, clientId, new MemoryPersistence());
            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(true);
            options.setConnectionTimeout(8);
            mqttClient.connect(options);
            mqttClient.subscribe(topic, 1, (receivedTopic, message) ->
                    handlePayload(new String(message.getPayload(), StandardCharsets.UTF_8)));
            LOGGER.info("Heart-rate simulation bridge connected to {} and subscribed to {}", brokerUrl, topic);
        } catch (Exception ex) {
            LOGGER.warn("Heart-rate simulation bridge is waiting for MQTT broker {}: {}", brokerUrl, ex.getMessage());
        }
    }

    public void handlePayload(String payload) {
        try {
            JsonNode json = objectMapper.readTree(payload);
            String watchId = json.path("watch_id").asText(defaultWatchId).trim();
            if (watchId.isEmpty()) {
                watchId = defaultWatchId;
            }

            boolean active = parseActive(json);
            if (active) {
                double bpm = json.path("bpm").asDouble(defaultBpm);
                String email = json.path("email").asText("").trim();
                simulationService.activate(watchId, bpm, email);
            } else {
                simulationService.deactivate(watchId);
            }
        } catch (Exception ex) {
            LOGGER.error("Failed to process heart-rate simulation payload: {}", payload, ex);
        }
    }

    private boolean parseActive(JsonNode json) {
        if (json.has("active")) {
            return json.path("active").asBoolean(false);
        }
        String state = json.path("state").asText(json.path("action").asText("")).trim().toLowerCase(Locale.ROOT);
        return switch (state) {
            case "high", "on", "active", "start" -> true;
            case "normal", "off", "inactive", "clear", "release", "stop" -> false;
            default -> throw new IllegalArgumentException("Unknown simulation state: " + state);
        };
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
            LOGGER.debug("Failed to close heart-rate simulation MQTT client cleanly: {}", ex.getMessage());
        } finally {
            mqttClient = null;
        }
    }
}
