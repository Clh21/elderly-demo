package com.polyu.elderlycare.repository;

import com.polyu.elderlycare.entity.Alert;
import com.polyu.elderlycare.entity.AlertSeverity;
import com.polyu.elderlycare.entity.AlertStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

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
}