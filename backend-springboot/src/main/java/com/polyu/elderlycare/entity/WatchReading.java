package com.polyu.elderlycare.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "watch_readings")
public class WatchReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "watch_id", nullable = false)
    private String watchId;

    @Column(name = "recorded_at", insertable = false, updatable = false)
    private LocalDateTime recordedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getWatchId() {
        return watchId;
    }

    public void setWatchId(String watchId) {
        this.watchId = watchId;
    }

    public LocalDateTime getRecordedAt() {
        return recordedAt;
    }
}