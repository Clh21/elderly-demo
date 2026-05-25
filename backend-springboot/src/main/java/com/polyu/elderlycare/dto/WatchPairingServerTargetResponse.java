package com.polyu.elderlycare.dto;

public record WatchPairingServerTargetResponse(
        String serverHost,
        Integer serverPort,
        String serverEndpoint
) {
}
