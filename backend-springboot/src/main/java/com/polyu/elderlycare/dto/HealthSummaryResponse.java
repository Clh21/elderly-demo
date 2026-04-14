package com.polyu.elderlycare.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record HealthSummaryResponse(
        LocalDate date,
        BigDecimal heartRate,
        BigDecimal temperature,
        BigDecimal eda,
        Integer steps,
        Integer alerts
) {
}