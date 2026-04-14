package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.WatchService;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class WatchController {

    private final WatchService watchService;

    public WatchController(WatchService watchService) {
        this.watchService = watchService;
    }

    @GetMapping("/watch/{watchId}")
    public Map<String, Object> getWatchSummary(@PathVariable String watchId) {
        return watchService.getWatchSummary(watchId);
    }

    @GetMapping("/watch/{watchId}/metric-detail")
    public Map<String, Object> getMetricDetail(
            @PathVariable String watchId,
            @RequestParam String metric,
            @RequestParam(required = false) String date
    ) {
        return watchService.getMetricDetail(watchId, metric, date);
    }

    @PostMapping("/watch/{watchId}/eda-baseline/build")
    public Map<String, Object> buildEdaBaseline(@PathVariable String watchId) {
        return watchService.buildEdaBaseline(watchId);
    }

    @GetMapping("/watch/{watchId}/ecg-history")
    public Map<String, Object> getEcgHistory(
            @PathVariable String watchId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return watchService.getEcgHistory(watchId, page, pageSize);
    }

    @GetMapping("/watch/{watchId}/ecg-history/{readingId}")
    public Map<String, Object> getEcgHistoryDetail(
            @PathVariable String watchId,
            @PathVariable Long readingId
    ) {
        return watchService.getEcgHistoryDetail(watchId, readingId);
    }

    @DeleteMapping("/watch/{watchId}/ecg-history/{readingId}")
    public Map<String, Object> deleteEcgHistoryRecord(
            @PathVariable String watchId,
            @PathVariable Long readingId
    ) {
        return watchService.deleteEcgHistoryRecord(watchId, readingId);
    }

    @PostMapping("/watch/{watchId}/ecg-history/reanalyze")
    public Map<String, Object> reanalyzeEcgHistory(@PathVariable String watchId) {
        return watchService.reanalyzeEcgHistory(watchId);
    }

    @PostMapping("/admin/ecg-history/reanalyze")
    public Map<String, Object> reanalyzeAllEcgHistory() {
        return watchService.reanalyzeAllEcgHistory();
    }

    @PostMapping("/watch/{watchId}/eda-history/backfill-valid-samples")
    public Map<String, Object> backfillEdaValidSampleCounts(@PathVariable String watchId) {
        return watchService.backfillEdaValidSampleCounts(watchId);
    }

    @PostMapping("/admin/eda-history/backfill-valid-samples")
    public Map<String, Object> backfillAllEdaValidSampleCounts() {
        return watchService.backfillAllEdaValidSampleCounts();
    }

    @PostMapping("/samsung-watch")
    public Map<String, Object> ingestSamsungWatch(
            @RequestParam(required = false) String watchId,
            @RequestHeader(name = "x-watch-id", required = false) String watchIdHeader,
            @RequestBody Map<String, Object> payload
    ) {
        return watchService.ingestSamsungWatch(watchId, watchIdHeader, payload);
    }

    @PostMapping("/watch-reading")
    public Map<String, Object> ingestWatchReading(@RequestBody Map<String, Object> payload) {
        return watchService.ingestLegacyWatchReading(payload);
    }
}