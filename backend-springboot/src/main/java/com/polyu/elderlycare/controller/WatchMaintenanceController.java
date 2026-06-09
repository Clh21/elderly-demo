package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.WatchService;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes watch maintenance endpoints for analysis rebuild and cleanup actions.
 */
@RestController
@RequestMapping("/api")
public class WatchMaintenanceController {

    private final WatchService watchService;

    public WatchMaintenanceController(WatchService watchService) {
        this.watchService = watchService;
    }

    /**
     * Builds or refreshes an EDA baseline for one watch.
     *
     * @param watchId watch id
     * @return baseline build result
     */
    @PostMapping("/watch/{watchId}/eda-baseline/build")
    public Map<String, Object> buildEdaBaseline(@PathVariable String watchId) {
        return watchService.buildEdaBaseline(watchId);
    }

    /**
     * Deletes one ECG history record.
     *
     * @param watchId watch id
     * @param readingId ECG reading id
     * @return delete result
     */
    @DeleteMapping("/watch/{watchId}/ecg-history/{readingId}")
    public Map<String, Object> deleteEcgHistoryRecord(
            @PathVariable String watchId,
            @PathVariable Long readingId
    ) {
        return watchService.deleteEcgHistoryRecord(watchId, readingId);
    }

    /**
     * Re-runs ECG analysis for one watch.
     *
     * @param watchId watch id
     * @return reanalysis result
     */
    @PostMapping("/watch/{watchId}/ecg-history/reanalyze")
    public Map<String, Object> reanalyzeEcgHistory(@PathVariable String watchId) {
        return watchService.reanalyzeEcgHistory(watchId);
    }

    /**
     * Re-runs ECG analysis for all watches.
     *
     * @return reanalysis result
     */
    @PostMapping("/admin/ecg-history/reanalyze")
    public Map<String, Object> reanalyzeAllEcgHistory() {
        return watchService.reanalyzeAllEcgHistory();
    }

    /**
     * Backfills EDA valid sample counts for one watch.
     *
     * @param watchId watch id
     * @return backfill result
     */
    @PostMapping("/watch/{watchId}/eda-history/backfill-valid-samples")
    public Map<String, Object> backfillEdaValidSampleCounts(@PathVariable String watchId) {
        return watchService.backfillEdaValidSampleCounts(watchId);
    }

    /**
     * Backfills EDA valid sample counts for all watches.
     *
     * @return backfill result
     */
    @PostMapping("/admin/eda-history/backfill-valid-samples")
    public Map<String, Object> backfillAllEdaValidSampleCounts() {
        return watchService.backfillAllEdaValidSampleCounts();
    }
}
