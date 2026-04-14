package com.polyu.elderlycare.service;

import com.polyu.elderlycare.auth.AuthenticatedUser;
import java.io.IOException;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class PositionStreamService {

    private static final Logger log = LoggerFactory.getLogger(PositionStreamService.class);
    private static final long STREAM_TIMEOUT_MS = 0L;
    private static final String CONNECTED_EVENT = "connected";
    private static final String POSITION_UPDATE_EVENT = "position-update";

    private final ConcurrentMap<String, StreamSubscription> subscriptions = new ConcurrentHashMap<>();
    private final AtomicLong eventSequence = new AtomicLong();
    private final AtomicReference<Map<String, Object>> latestPositionPayload = new AtomicReference<>();

    public SseEmitter subscribe(AuthenticatedUser user) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        String subscriptionId = UUID.randomUUID().toString();
        StreamSubscription subscription = new StreamSubscription(subscriptionId, emitter);

        subscriptions.put(subscriptionId, subscription);
        emitter.onCompletion(() -> removeSubscription(subscriptionId));
        emitter.onTimeout(() -> removeSubscription(subscriptionId));
        emitter.onError(ex -> removeSubscription(subscriptionId));

        Map<String, Object> connectedPayload = new LinkedHashMap<>();
        connectedPayload.put("connected", true);
        connectedPayload.put("scope", user.isAdmin() ? "all" : "resident");
        connectedPayload.put("timestamp", Instant.now().toString());

        if (!send(subscription, CONNECTED_EVENT, connectedPayload)) {
            removeSubscription(subscriptionId);
            return emitter;
        }

        Map<String, Object> currentPosition = latestPositionPayload.get();
        if (currentPosition != null && !send(subscription, POSITION_UPDATE_EVENT, currentPosition)) {
            removeSubscription(subscriptionId);
        }

        return emitter;
    }

    public Map<String, Object> getLatestPosition() {
        Map<String, Object> latest = latestPositionPayload.get();
        if (latest == null) {
            return Map.of(
                    "available", false,
                    "message", "No indoor position received yet"
            );
        }
        return latest;
    }

    public void publishPositionUpdate(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return;
        }

        Map<String, Object> normalized = new LinkedHashMap<>(payload);
        normalized.put("available", true);
        normalized.put("receivedAt", Instant.now().toString());

        Map<String, Object> immutablePayload = Collections.unmodifiableMap(new LinkedHashMap<>(normalized));
        latestPositionPayload.set(immutablePayload);

        for (StreamSubscription subscription : subscriptions.values()) {
            if (!send(subscription, POSITION_UPDATE_EVENT, immutablePayload)) {
                removeSubscription(subscription.id());
            }
        }
    }

    private boolean send(StreamSubscription subscription, String eventName, Object payload) {
        try {
            subscription.emitter().send(
                    SseEmitter.event()
                            .id(Long.toString(eventSequence.incrementAndGet()))
                            .name(eventName)
                            .reconnectTime(3000L)
                            .data(payload, MediaType.APPLICATION_JSON)
            );
            return true;
        } catch (IOException | IllegalStateException ex) {
            completeQuietly(subscription.emitter());
            log.debug("Failed to publish {} event to SSE subscriber {}", eventName, subscription.id(), ex);
            return false;
        }
    }

    private void completeQuietly(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Exception ignored) {
            // Ignore cleanup failures for already-closed emitters.
        }
    }

    private void removeSubscription(String subscriptionId) {
        subscriptions.remove(subscriptionId);
    }

    private record StreamSubscription(
            String id,
            SseEmitter emitter
    ) {
    }
}
