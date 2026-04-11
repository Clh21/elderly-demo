package com.polyu.elderlycare.repository;

import java.math.BigDecimal;
import java.time.LocalDate;

public interface HealthSummaryProjection {

    LocalDate getDate();

    BigDecimal getHeartRate();

    BigDecimal getTemperature();

    BigDecimal getEda();

    Integer getSteps();

    Integer getAlerts();
}