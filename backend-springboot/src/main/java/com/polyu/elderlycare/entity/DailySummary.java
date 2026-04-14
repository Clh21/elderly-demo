package com.polyu.elderlycare.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "daily_summaries")
public class DailySummary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resident_id", nullable = false)
    private Resident resident;

    @Column(name = "summary_date", nullable = false)
    private LocalDate summaryDate;

    @Column(name = "avg_heart_rate")
    private BigDecimal avgHeartRate;

    @Column(name = "avg_temperature")
    private BigDecimal avgTemperature;

    @Column(name = "avg_eda")
    private BigDecimal avgEda;

    @Column(name = "total_steps")
    private Integer totalSteps;

    @Column(name = "alert_count")
    private Integer alertCount;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Resident getResident() {
        return resident;
    }

    public void setResident(Resident resident) {
        this.resident = resident;
    }

    public LocalDate getSummaryDate() {
        return summaryDate;
    }

    public void setSummaryDate(LocalDate summaryDate) {
        this.summaryDate = summaryDate;
    }

    public BigDecimal getAvgHeartRate() {
        return avgHeartRate;
    }

    public void setAvgHeartRate(BigDecimal avgHeartRate) {
        this.avgHeartRate = avgHeartRate;
    }

    public BigDecimal getAvgTemperature() {
        return avgTemperature;
    }

    public void setAvgTemperature(BigDecimal avgTemperature) {
        this.avgTemperature = avgTemperature;
    }

    public BigDecimal getAvgEda() {
        return avgEda;
    }

    public void setAvgEda(BigDecimal avgEda) {
        this.avgEda = avgEda;
    }

    public Integer getTotalSteps() {
        return totalSteps;
    }

    public void setTotalSteps(Integer totalSteps) {
        this.totalSteps = totalSteps;
    }

    public Integer getAlertCount() {
        return alertCount;
    }

    public void setAlertCount(Integer alertCount) {
        this.alertCount = alertCount;
    }
}