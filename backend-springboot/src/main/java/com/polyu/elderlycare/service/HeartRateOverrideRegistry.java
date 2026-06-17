package com.polyu.elderlycare.service;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Service;

@Service
public class HeartRateOverrideRegistry {

    private final ConcurrentMap<String, HeartRateOverride> overrides = new ConcurrentHashMap<>();

    public ActivationResult activate(String watchId, double bpm) {
        HeartRateOverride next = new HeartRateOverride(bpm, Instant.now());
        HeartRateOverride previous = overrides.put(watchId, next);
        return new ActivationResult(next, previous == null);
    }

    public Optional<HeartRateOverride> deactivate(String watchId) {
        return Optional.ofNullable(overrides.remove(watchId));
    }

    public Optional<HeartRateOverride> find(String watchId) {
        return Optional.ofNullable(overrides.get(watchId));
    }

    public record HeartRateOverride(double bpm, Instant activatedAt) {
    }

    public record ActivationResult(HeartRateOverride override, boolean newlyActive) {
    }
}
