package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.HealthSummaryResponse;
import com.polyu.elderlycare.dto.ResidentResponse;
import java.util.List;

public interface ResidentService {

    List<ResidentResponse> getActiveResidents();

    List<HealthSummaryResponse> getHealthHistory(Integer residentId, int days);
}