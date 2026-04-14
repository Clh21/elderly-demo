package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.dto.HealthSummaryResponse;
import com.polyu.elderlycare.dto.ResidentResponse;
import com.polyu.elderlycare.service.ResidentService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ResidentController {

    private final ResidentService residentService;

    public ResidentController(ResidentService residentService) {
        this.residentService = residentService;
    }

    @GetMapping("/residents")
    public List<ResidentResponse> getResidents() {
        return residentService.getActiveResidents();
    }

    @GetMapping("/health/{residentId}")
    public List<HealthSummaryResponse> getHealthHistory(
            @PathVariable Integer residentId,
            @RequestParam(defaultValue = "7") int days
    ) {
        return residentService.getHealthHistory(residentId, days);
    }
}