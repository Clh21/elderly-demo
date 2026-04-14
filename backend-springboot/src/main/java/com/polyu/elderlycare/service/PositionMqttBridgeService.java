package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.PositioningStatusResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class PositionMqttBridgeService {

    private static final Logger log = LoggerFactory.getLogger(PositionMqttBridgeService.class);
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final PositionStreamService positionStreamService;
    private final ObjectMapper objectMapper;

    @Value("${app.positioning.enabled:true}")
    private boolean enabled;

    @Value("${app.positioning.mqtt-host:localhost}")
    private String mqttHost;

    @Value("${app.positioning.mqtt-port:1883}")
    private int mqttPort;

    @Value("${app.positioning.mqtt-topic:indoor/location/target_01}")
    private String mqttTopic;

    @Value("${app.positioning.mqtt-client-id:elderlycare-position-bridge}")
    private String mqttClientIdPrefix;

    @Value("${app.positioning.mqtt-username:}")
    private String mqttUsername;

    @Value("${app.positioning.mqtt-password:}")
    private String mqttPassword;

    private MqttAsyncClient mqttClient;

        private final AtomicReference<PositioningStatusResponse> status = new AtomicReference<>(
            new PositioningStatusResponse(
                false,
                false,
                "UNKNOWN",
                "Indoor positioning status not initialized yet",
                null,
                null,
                Instant.now().toString()
            )
        );

    public PositionMqttBridgeService(
            PositionStreamService positionStreamService,
            ObjectMapper objectMapper
    ) {
        this.positionStreamService = positionStreamService;
        this.objectMapper = objectMapper;
    }

    public PositioningStatusResponse getStatus() {
        return status.get();
    }

    @PostConstruct
    public void start() {
        if (!enabled) {
            log.info("Indoor positioning MQTT bridge is disabled via app.positioning.enabled=false");
            updateStatus(false, false, "DISABLED", "Indoor positioning is disabled", null);
            return;
        }

        try {
            String brokerUri = String.format("tcp://%s:%d", mqttHost, mqttPort);
            String clientId = String.format("%s-%s", mqttClientIdPrefix, UUID.randomUUID().toString().substring(0, 8));

            updateStatus(true, false, "STARTING", "Connecting to MQTT broker", brokerUri);

            mqttClient = new MqttAsyncClient(brokerUri, clientId);
            mqttClient.setCallback(new PositionMqttCallback());

            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(true);
            options.setConnectionTimeout(10);

            if (mqttUsername != null && !mqttUsername.isBlank()) {
                options.setUserName(mqttUsername);
                options.setPassword(mqttPassword == null ? new char[0] : mqttPassword.toCharArray());
            }

            mqttClient.connect(options).waitForCompletion();
            mqttClient.subscribe(mqttTopic, 0).waitForCompletion();

            updateStatus(true, true, "CONNECTED", "Indoor positioning MQTT bridge connected", brokerUri);
            log.info("Indoor positioning MQTT bridge connected to {} and subscribed topic {}", brokerUri, mqttTopic);
        } catch (Exception ex) {
            String brokerUri = String.format("tcp://%s:%d", mqttHost, mqttPort);
            updateStatus(true, false, "FAILED", "Indoor positioning is unavailable: " + describeFailure(ex), brokerUri);
            closeClientQuietly();
            log.error("Failed to start indoor positioning MQTT bridge", ex);
        }
    }

    @PreDestroy
    public void stop() {
        if (mqttClient == null) {
            return;
        }

        try {
            if (mqttClient.isConnected()) {
                mqttClient.disconnect();
            }
            mqttClient.close();
            updateStatus(enabled, false, "STOPPED", "Indoor positioning MQTT bridge stopped", mqttClient.getServerURI());
        } catch (MqttException ex) {
            log.debug("Failed to stop indoor positioning MQTT bridge cleanly", ex);
        }
    }

    private void closeClientQuietly() {
        if (mqttClient == null) {
            return;
        }

        try {
            if (mqttClient.isConnected()) {
                mqttClient.disconnect();
            }
            mqttClient.close();
        } catch (Exception ignored) {
            // Best-effort cleanup only.
        } finally {
            mqttClient = null;
        }
    }

    private void updateStatus(boolean enabledFlag, boolean availableFlag, String state, String message, String brokerUri) {
        status.set(
                new PositioningStatusResponse(
                        enabledFlag,
                        availableFlag,
                        state,
                        message,
                        brokerUri,
                        mqttTopic,
                        Instant.now().toString()
                )
        );
    }

    private static String describeFailure(Throwable ex) {
        if (ex == null) {
            return "Unknown failure";
        }

        Throwable cursor = ex;
        while (cursor.getCause() != null && cursor.getCause() != cursor) {
            cursor = cursor.getCause();
        }

        String message = cursor.getMessage();
        if (message == null || message.isBlank()) {
            return cursor.getClass().getSimpleName();
        }
        return message;
    }

    private void onMessage(String topic, MqttMessage message) {
        try {
            String raw = new String(message.getPayload(), StandardCharsets.UTF_8);
            Map<String, Object> payload = objectMapper.readValue(raw, MAP_TYPE);
            Map<String, Object> normalized = new LinkedHashMap<>(payload);
            normalized.put("mqttTopic", topic);
            positionStreamService.publishPositionUpdate(normalized);
        } catch (Exception ex) {
            log.debug("Failed to parse indoor location payload from topic {}", topic, ex);
        }
    }

    private class PositionMqttCallback implements MqttCallbackExtended {

        @Override
        public void connectComplete(boolean reconnect, String serverURI) {
            if (mqttClient == null || !mqttClient.isConnected()) {
                return;
            }

            if (!reconnect) {
                return;
            }

            try {
                mqttClient.subscribe(mqttTopic, 0).waitForCompletion();
                updateStatus(true, true, "RECONNECTED", "Indoor positioning MQTT bridge reconnected", serverURI);
                log.info(
                        "Indoor positioning MQTT {} complete, subscribed to {}",
                        reconnect ? "reconnect" : "connect",
                        mqttTopic
                );
            } catch (MqttException ex) {
                updateStatus(true, false, "SUBSCRIBE_FAILED", "Indoor positioning subscription failed: " + describeFailure(ex), serverURI);
                log.error("Failed to subscribe indoor positioning topic {}", mqttTopic, ex);
            }
        }

        @Override
        public void connectionLost(Throwable cause) {
            String brokerUri = String.format("tcp://%s:%d", mqttHost, mqttPort);
            if (cause == null) {
                updateStatus(true, false, "DISCONNECTED", "Indoor positioning MQTT connection lost", brokerUri);
                log.warn("Indoor positioning MQTT connection lost");
                return;
            }

            updateStatus(true, false, "DISCONNECTED", "Indoor positioning MQTT connection lost: " + describeFailure(cause), brokerUri);
            log.warn("Indoor positioning MQTT connection lost: {}", cause.getMessage());
        }

        @Override
        public void messageArrived(String topic, MqttMessage message) {
            onMessage(topic, message);
        }

        @Override
        public void deliveryComplete(IMqttDeliveryToken token) {
            // Subscriber mode only.
        }
    }
}
