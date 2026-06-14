package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.HealthAnalysisService;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/watch/{watchId}/health-analysis")
public class HealthAnalysisController {

    private final HealthAnalysisService healthAnalysisService;

    public HealthAnalysisController(HealthAnalysisService healthAnalysisService) {
        this.healthAnalysisService = healthAnalysisService;
    }

    @GetMapping
    public Map<String, Object> analyzeDay(
            @PathVariable String watchId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return healthAnalysisService.analyzeDay(watchId, date == null ? LocalDate.now() : date);
    }
}
