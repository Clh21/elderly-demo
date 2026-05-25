package com.polyu.elderlycare.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record WatchPairingConfigureRequest(
        @NotBlank String watchIp,
        @Min(1) @Max(65535) Integer watchPort,
        @NotBlank String watchId,
        String pairingCode,
        @NotBlank String serverHost,
        @Min(1) @Max(65535) Integer serverPort
) {
}
