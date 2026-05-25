package com.polyu.elderlycare.dto;

public record WatchPairingHandshakeResponse(
        boolean success,
        String watchId,
        String serverEndpoint,
        String message
) {
}
