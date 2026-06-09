package com.polyu.elderlycare.mapper;

import com.polyu.elderlycare.dto.AlertResponse;
import com.polyu.elderlycare.entity.Alert;

public final class AlertResponseMapper {

    private AlertResponseMapper() {
    }

    public static AlertResponse toResponse(Alert alert) {
        return new AlertResponse(
                alert.getId(),
                alert.getResident().getId(),
                alert.getResident().getName(),
                alert.getType().getValue(),
                alert.getSeverity().getValue(),
                alert.getMessage(),
                alert.getStatus().getValue(),
                alert.getCreatedAt()
        );
    }
}
