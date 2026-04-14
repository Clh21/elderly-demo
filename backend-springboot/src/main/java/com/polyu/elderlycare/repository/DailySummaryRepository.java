package com.polyu.elderlycare.repository;

import com.polyu.elderlycare.entity.DailySummary;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DailySummaryRepository extends JpaRepository<DailySummary, Long> {

    @Query("""
            select d
            from DailySummary d
            where d.resident.id = :residentId
              and d.summaryDate >= :startDate
            order by d.summaryDate
            """)
    List<DailySummary> findHistoryByResidentId(
            @Param("residentId") Integer residentId,
            @Param("startDate") LocalDate startDate
    );

    @Query(
            value = """
                    SELECT DATE(m.minute_slot) AS date,
                           ROUND(AVG(m.heart_rate), 1) AS heartRate,
                           ROUND(AVG(COALESCE(m.body_temperature, m.temperature)), 1) AS temperature,
                           ROUND(AVG(m.eda), 2) AS eda,
                           0 AS steps,
                           COALESCE(MAX(alerts_by_day.alert_count), 0) AS alerts
                    FROM minute_readings m
                    LEFT JOIN (
                        SELECT resident_id,
                               DATE(created_at) AS alert_date,
                               COUNT(*) AS alert_count
                        FROM alerts
                        GROUP BY resident_id, DATE(created_at)
                    ) alerts_by_day
                      ON alerts_by_day.resident_id = m.resident_id
                     AND alerts_by_day.alert_date = DATE(m.minute_slot)
                    WHERE m.resident_id = :residentId
                      AND DATE(m.minute_slot) >= :startDate
                    GROUP BY DATE(m.minute_slot)
                    ORDER BY DATE(m.minute_slot)
                    """,
            nativeQuery = true
    )
    List<HealthSummaryProjection> findHistoryFallbackByResidentId(
            @Param("residentId") Integer residentId,
            @Param("startDate") LocalDate startDate
    );
}