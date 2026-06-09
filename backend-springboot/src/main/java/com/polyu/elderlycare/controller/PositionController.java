package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.PositionStreamService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes the latest indoor position snapshot.
 */
@RestController
@RequestMapping("/api")
public class PositionController {

    private final PositionStreamService positionStreamService;

    public PositionController(PositionStreamService positionStreamService) {
        this.positionStreamService = positionStreamService;
    }

    /**
     * Returns the latest indoor position received by the backend.
     *
     * @return latest position payload, or an unavailable payload when no position is available
     */
    @GetMapping("/position/latest")
    public Map<String, Object> getLatestPosition() {
        return positionStreamService.getLatestPosition();
    }
}
