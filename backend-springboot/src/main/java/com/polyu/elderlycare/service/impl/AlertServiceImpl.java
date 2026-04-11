package com.polyu.elderlycare.service.impl;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.AlertResponse;
import com.polyu.elderlycare.dto.CreateAlertRequest;
import com.polyu.elderlycare.entity.Alert;
import com.polyu.elderlycare.entity.AlertStatus;
import com.polyu.elderlycare.entity.Resident;
import com.polyu.elderlycare.exception.ResourceNotFoundException;
import com.polyu.elderlycare.repository.AlertRepository;
import com.polyu.elderlycare.repository.ResidentRepository;
import com.polyu.elderlycare.service.AlertService;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AlertServiceImpl implements AlertService {

    private final AlertRepository alertRepository;
    private final ResidentRepository residentRepository;
    private final AccessScopeService accessScopeService;

    public AlertServiceImpl(
            AlertRepository alertRepository,
            ResidentRepository residentRepository,
            AccessScopeService accessScopeService
    ) {
        this.alertRepository = alertRepository;
        this.residentRepository = residentRepository;
        this.accessScopeService = accessScopeService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AlertResponse> getAlerts() {
        if (!accessScopeService.isAdmin()) {
            return alertRepository.findTop100ByResidentIdOrderByCreatedAtDesc(accessScopeService.requireResidentId()).stream()
                    .map(this::toResponse)
                    .toList();
        }

        return alertRepository.findTop100ByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AlertResponse> getLatestActiveAlerts(Integer afterId) {
        int effectiveAfterId = afterId == null ? 0 : afterId;

        if (!accessScopeService.isAdmin()) {
            return alertRepository.findByResidentIdAndIdGreaterThanAndStatusOrderByCreatedAtAsc(
                            accessScopeService.requireResidentId(),
                            effectiveAfterId,
                            AlertStatus.ACTIVE
                    ).stream()
                    .map(this::toResponse)
                    .toList();
        }

        return alertRepository.findByIdGreaterThanAndStatusOrderByCreatedAtAsc(effectiveAfterId, AlertStatus.ACTIVE).stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public void createAlert(CreateAlertRequest request) {
        accessScopeService.requireAdmin();

        Resident resident = residentRepository.findById(request.residentId())
                .orElseThrow(() -> new ResourceNotFoundException("Resident not found: " + request.residentId()));

        Alert alert = new Alert();
        alert.setResident(resident);
        alert.setType(request.type());
        alert.setSeverity(request.severity());
        alert.setMessage(request.message());
        alert.setStatus(AlertStatus.ACTIVE);
        alertRepository.save(alert);
    }

    @Override
    @Transactional
    public void resolveAlert(Integer id) {
        accessScopeService.requireAdmin();

        Alert alert = alertRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Alert not found: " + id));
        alert.setStatus(AlertStatus.RESOLVED);
        alert.setResolvedAt(LocalDateTime.now());
        alertRepository.save(alert);
    }

    private AlertResponse toResponse(Alert alert) {
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