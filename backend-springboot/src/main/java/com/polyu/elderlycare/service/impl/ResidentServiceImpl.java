package com.polyu.elderlycare.service.impl;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.HealthSummaryResponse;
import com.polyu.elderlycare.dto.ResidentResponse;
import com.polyu.elderlycare.entity.ResidentStatus;
import com.polyu.elderlycare.exception.ResourceNotFoundException;
import com.polyu.elderlycare.mapper.HealthSummaryResponseMapper;
import com.polyu.elderlycare.mapper.ResidentResponseMapper;
import com.polyu.elderlycare.repository.DailySummaryRepository;
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
                    .map(ResidentResponseMapper::toResponse)
                    .toList();
        }

        return residentRepository.findByStatusNotOrderByRoomAsc(ResidentStatus.INACTIVE).stream()
                .map(ResidentResponseMapper::toResponse)
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
                .map(HealthSummaryResponseMapper::fromDailySummary)
                .toList();

        if (!history.isEmpty()) {
            return history;
        }

        return dailySummaryRepository.findHistoryFallbackByResidentId(residentId, startDate).stream()
                .map(HealthSummaryResponseMapper::fromProjection)
                .toList();
    }
}
