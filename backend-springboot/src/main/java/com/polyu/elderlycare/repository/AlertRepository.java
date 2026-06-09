package com.polyu.elderlycare.repository;

import com.polyu.elderlycare.entity.Alert;
import com.polyu.elderlycare.entity.AlertSeverity;
import com.polyu.elderlycare.entity.AlertStatus;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AlertRepository extends JpaRepository<Alert, Integer> {

    List<Alert> findTop100ByOrderByCreatedAtDesc();

    List<Alert> findTop100ByResidentIdOrderByCreatedAtDesc(Integer residentId);

    List<Alert> findByIdGreaterThanAndStatusOrderByCreatedAtAsc(Integer id, AlertStatus status);

    List<Alert> findByResidentIdAndIdGreaterThanAndStatusOrderByCreatedAtAsc(
            Integer residentId,
            Integer id,
            AlertStatus status
    );

    long countByStatus(AlertStatus status);

    long countByResidentIdAndStatus(Integer residentId, AlertStatus status);

    long countByStatusAndSeverity(AlertStatus status, AlertSeverity severity);

    long countByResidentIdAndStatusAndSeverity(Integer residentId, AlertStatus status, AlertSeverity severity);

    @Modifying
    @Query("""
            update Alert alert
            set alert.status = :resolvedStatus,
                alert.resolvedAt = :resolvedAt
            where alert.status = :activeStatus
            """)
    int resolveAllActive(
            @Param("activeStatus") AlertStatus activeStatus,
            @Param("resolvedStatus") AlertStatus resolvedStatus,
            @Param("resolvedAt") LocalDateTime resolvedAt
    );

    @Modifying
    @Query("""
            update Alert alert
            set alert.status = :resolvedStatus,
                alert.resolvedAt = :resolvedAt
            where alert.resident.id = :residentId
              and alert.status = :activeStatus
            """)
    int resolveAllActiveByResidentId(
            @Param("residentId") Integer residentId,
            @Param("activeStatus") AlertStatus activeStatus,
            @Param("resolvedStatus") AlertStatus resolvedStatus,
            @Param("resolvedAt") LocalDateTime resolvedAt
    );
}
