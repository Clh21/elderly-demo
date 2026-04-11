package com.polyu.elderlycare.service;

import com.polyu.elderlycare.auth.AuthenticatedUser;
import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class WatchUpdateStreamService {

    private static final Logger log = LoggerFactory.getLogger(WatchUpdateStreamService.class);
    private static final long STREAM_TIMEOUT_MS = 0L;
    private static final String CONNECTED_EVENT = "connected";
    private static final String WATCH_UPDATE_EVENT = "watch-update";

    private final ConcurrentMap<String, StreamSubscription> subscriptions = new ConcurrentHashMap<>();
    private final AtomicLong eventSequence = new AtomicLong();

    public SseEmitter subscribe(AuthenticatedUser user) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        String subscriptionId = UUID.randomUUID().toString();
        StreamSubscription subscription = new StreamSubscription(
                subscriptionId,
                user.isAdmin(),
                user.watchId(),
                emitter
        );

        subscriptions.put(subscriptionId, subscription);
        emitter.onCompletion(() -> removeSubscription(subscriptionId));
        emitter.onTimeout(() -> removeSubscription(subscriptionId));
        emitter.onError(ex -> removeSubscription(subscriptionId));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("connected", true);
        payload.put("scope", user.isAdmin() ? "all" : user.watchId());
        payload.put("timestamp", Instant.now().toString());
        if (!send(subscription, CONNECTED_EVENT, payload)) {
            removeSubscription(subscriptionId);
        }

        return emitter;
    }

    public void publishWatchUpdate(
            String watchId,
            Integer residentId,
            String sensorType,
            String eventType,
            Long sourceTimestamp
    ) {
        if (watchId == null || watchId.isBlank()) {
            return;
        }

        WatchUpdateEvent payload = new WatchUpdateEvent(
                "watch_update",
                watchId,
                residentId,
                sensorType,
                eventType,
                sourceTimestamp,
                Instant.now().toString()
        );

        for (StreamSubscription subscription : subscriptions.values()) {
            if (!subscription.isAdmin() && !Objects.equals(subscription.watchId(), watchId)) {
                continue;
            }

            if (!send(subscription, WATCH_UPDATE_EVENT, payload)) {
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
            boolean isAdmin,
            String watchId,
            SseEmitter emitter
    ) {
    }

    private record WatchUpdateEvent(
            String type,
            String watchId,
            Integer residentId,
            String sensorType,
            String eventType,
            Long sourceTimestamp,
            String publishedAt
    ) {
    }
}