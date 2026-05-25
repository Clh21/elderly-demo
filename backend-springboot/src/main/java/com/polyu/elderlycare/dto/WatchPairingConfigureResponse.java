package com.polyu.elderlycare.dto;

import java.util.Map;

public record WatchPairingConfigureResponse(
        boolean success,
        String watchId,
        String watchEndpoint,
        String serverEndpoint,
        Map<String, Object> watchResponse
) {
}
