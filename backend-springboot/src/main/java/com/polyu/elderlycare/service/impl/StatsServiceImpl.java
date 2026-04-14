package com.polyu.elderlycare.service.impl;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.StatsResponse;
import com.polyu.elderlycare.entity.AlertSeverity;
import com.polyu.elderlycare.entity.AlertStatus;
import com.polyu.elderlycare.entity.ResidentStatus;
import com.polyu.elderlycare.repository.AlertRepository;
import com.polyu.elderlycare.repository.ResidentRepository;
import com.polyu.elderlycare.repository.WatchReadingRepository;
import com.polyu.elderlycare.service.StatsService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StatsServiceImpl implements StatsService {

    private final ResidentRepository residentRepository;
    private final AlertRepository alertRepository;
    private final WatchReadingRepository watchReadingRepository;
    private final AccessScopeService accessScopeService;

    public StatsServiceImpl(
            ResidentRepository residentRepository,
            AlertRepository alertRepository,
            WatchReadingRepository watchReadingRepository,
            AccessScopeService accessScopeService
    ) {
        this.residentRepository = residentRepository;
        this.alertRepository = alertRepository;
        this.watchReadingRepository = watchReadingRepository;
        this.accessScopeService = accessScopeService;
    }

    @Override
    @Transactional(readOnly = true)
    public StatsResponse getStats() {
        accessScopeService.requireAdmin();

        long totalResidents = residentRepository.countByStatusNot(ResidentStatus.INACTIVE);
        long activeAlerts = alertRepository.countByStatus(AlertStatus.ACTIVE);
        long criticalAlerts = alertRepository.countByStatusAndSeverity(AlertStatus.ACTIVE, AlertSeverity.CRITICAL);
        long warningAlerts = alertRepository.countByStatusAndSeverity(AlertStatus.ACTIVE, AlertSeverity.WARNING);
        long connectedDevices = watchReadingRepository.countDistinctConnectedDevicesSince(LocalDateTime.now().minusMinutes(10));
        LocalDate today = LocalDate.now();
        long dataPointsToday = watchReadingRepository.countByRecordedAtBetween(today.atStartOfDay(), today.plusDays(1).atStartOfDay());

        return new StatsResponse(
                totalResidents,
                activeAlerts,
                criticalAlerts,
                warningAlerts,
                connectedDevices,
                dataPointsToday,
                OffsetDateTime.now(ZoneId.systemDefault())
        );
    }
}