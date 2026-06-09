package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.WatchService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes read-only watch data endpoints used by dashboard views.
 */
@RestController
@RequestMapping("/api/watch/{watchId}")
public class WatchDataController {

    private final WatchService watchService;

    public WatchDataController(WatchService watchService) {
        this.watchService = watchService;
    }

    /**
     * Returns the latest watch summary for dashboard cards.
     *
     * @param watchId watch id
     * @return watch summary payload
     */
    @GetMapping
    public Map<String, Object> getWatchSummary(@PathVariable String watchId) {
        return watchService.getWatchSummary(watchId);
    }

    /**
     * Returns chart-ready metric detail for a selected day.
     *
     * @param watchId watch id
     * @param metric frontend metric key
     * @param date optional date in yyyy-MM-dd format
     * @return metric detail payload
     */
    @GetMapping("/metric-detail")
    public Map<String, Object> getMetricDetail(
            @PathVariable String watchId,
            @RequestParam String metric,
            @RequestParam(required = false) String date
    ) {
        return watchService.getMetricDetail(watchId, metric, date);
    }

    /**
     * Lists ECG history records for a watch.
     *
     * @param watchId watch id
     * @param page one-based page number
     * @param pageSize requested page size
     * @return paginated ECG history payload
     */
    @GetMapping("/ecg-history")
    public Map<String, Object> getEcgHistory(
            @PathVariable String watchId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return watchService.getEcgHistory(watchId, page, pageSize);
    }

    /**
     * Returns one ECG record with waveform detail.
     *
     * @param watchId watch id
     * @param readingId ECG reading id
     * @return ECG detail payload
     */
    @GetMapping("/ecg-history/{readingId}")
    public Map<String, Object> getEcgHistoryDetail(
            @PathVariable String watchId,
            @PathVariable Long readingId
    ) {
        return watchService.getEcgHistoryDetail(watchId, readingId);
    }
}
