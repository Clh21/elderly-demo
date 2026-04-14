package com.polyu.elderlycare.repository;

import com.polyu.elderlycare.entity.WatchReading;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WatchReadingRepository extends JpaRepository<WatchReading, Long> {

    @Query("select count(distinct w.watchId) from WatchReading w where w.recordedAt >= :cutoff")
    long countDistinctConnectedDevicesSince(@Param("cutoff") LocalDateTime cutoff);

    @Query("select count(distinct w.watchId) from WatchReading w where w.recordedAt >= :cutoff and w.watchId = :watchId")
    long countDistinctConnectedDevicesSinceAndWatchId(
            @Param("cutoff") LocalDateTime cutoff,
            @Param("watchId") String watchId
    );

    long countByRecordedAtBetween(LocalDateTime start, LocalDateTime end);

    long countByWatchIdAndRecordedAtBetween(String watchId, LocalDateTime start, LocalDateTime end);
}