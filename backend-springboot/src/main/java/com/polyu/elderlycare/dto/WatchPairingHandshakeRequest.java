package com.polyu.elderlycare.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record WatchPairingHandshakeRequest(
        @NotBlank String pairingChallenge,
        @NotBlank String watchId,
        @NotBlank String serverHost,
        @NotNull @Min(1) @Max(65535) Integer serverPort,
        String watchIp,
        String macAddress
) {
}
