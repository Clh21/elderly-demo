package com.polyu.elderlycare.dto;

import com.polyu.elderlycare.entity.AlertSeverity;
import com.polyu.elderlycare.entity.AlertType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateAlertRequest(
        @NotNull Integer residentId,
        @NotNull AlertType type,
        @NotNull AlertSeverity severity,
        @NotBlank String message
) {
}