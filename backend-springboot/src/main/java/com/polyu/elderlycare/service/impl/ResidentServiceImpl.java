package com.polyu.elderlycare.service.impl;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.HealthSummaryResponse;
import com.polyu.elderlycare.dto.ResidentResponse;
import com.polyu.elderlycare.entity.Resident;
import com.polyu.elderlycare.entity.ResidentStatus;
import com.polyu.elderlycare.exception.ResourceNotFoundException;
import com.polyu.elderlycare.repository.DailySummaryRepository;
import com.polyu.elderlycare.repository.HealthSummaryProjection;
import com.polyu.elderlycare.repository.ResidentRepository;
import com.polyu.elderlycare.service.ResidentService;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResidentServiceImpl implements ResidentService {

    private final ResidentRepository residentRepository;
    private final DailySummaryRepository dailySummaryRepository;
    private final AccessScopeService accessScopeService;

    public ResidentServiceImpl(
            ResidentRepository residentRepository,
            DailySummaryRepository dailySummaryRepository,
            AccessScopeService accessScopeService
    ) {
        this.residentRepository = residentRepository;
        this.dailySummaryRepository = dailySummaryRepository;
        this.accessScopeService = accessScopeService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ResidentResponse> getActiveResidents() {
        if (!accessScopeService.isAdmin()) {
            return residentRepository.findById(accessScopeService.requireResidentId()).stream()
                    .map(this::toResidentResponse)
                    .toList();
        }

        return residentRepository.findByStatusNotOrderByRoomAsc(ResidentStatus.INACTIVE).stream()
                .map(this::toResidentResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<HealthSummaryResponse> getHealthHistory(Integer residentId, int days) {
        accessScopeService.assertResidentAccess(residentId);

        if (!residentRepository.existsById(residentId)) {
            throw new ResourceNotFoundException("Resident not found: " + residentId);
        }

        LocalDate startDate = LocalDate.now().minusDays(Math.max(days, 1));
        List<HealthSummaryResponse> history = dailySummaryRepository.findHistoryByResidentId(residentId, startDate).stream()
                .map(summary -> new HealthSummaryResponse(
                        summary.getSummaryDate(),
                        summary.getAvgHeartRate(),
                        summary.getAvgTemperature(),
                        summary.getAvgEda(),
                        summary.getTotalSteps(),
                        summary.getAlertCount()
                ))
                .toList();

                if (!history.isEmpty()) {
                    return history;
                }

                return dailySummaryRepository.findHistoryFallbackByResidentId(residentId, startDate).stream()
                    .map(this::toHealthSummaryResponse)
                    .toList();
    }

    private ResidentResponse toResidentResponse(Resident resident) {
        return new ResidentResponse(
                resident.getId(),
                resident.getName(),
                resident.getAge(),
                resident.getRoom(),
                resident.getWatchId(),
                resident.getEmergencyContact(),
                resident.getStatus().getValue()
        );
    }

    private HealthSummaryResponse toHealthSummaryResponse(HealthSummaryProjection summary) {
        return new HealthSummaryResponse(
                summary.getDate(),
                summary.getHeartRate(),
                summary.getTemperature(),
                summary.getEda(),
                summary.getSteps(),
                summary.getAlerts()
        );
    }
}