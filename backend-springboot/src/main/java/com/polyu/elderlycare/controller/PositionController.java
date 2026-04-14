package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.dto.PositioningStatusResponse;
import com.polyu.elderlycare.service.PositionMqttBridgeService;
import com.polyu.elderlycare.service.PositionStreamService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PositionController {

    private final PositionStreamService positionStreamService;
    private final PositionMqttBridgeService positionMqttBridgeService;

    public PositionController(
            PositionStreamService positionStreamService,
            PositionMqttBridgeService positionMqttBridgeService
    ) {
        this.positionStreamService = positionStreamService;
        this.positionMqttBridgeService = positionMqttBridgeService;
    }

    @GetMapping("/position/status")
    public PositioningStatusResponse getPositioningStatus() {
        return positionMqttBridgeService.getStatus();
    }

    @GetMapping("/position/latest")
    public Map<String, Object> getLatestPosition() {
        PositioningStatusResponse status = positionMqttBridgeService.getStatus();
        if (!status.available()) {
            return Map.of(
                    "available", false,
                    "message", status.message(),
                    "state", status.state(),
                    "updatedAt", status.updatedAt()
            );
        }

        return positionStreamService.getLatestPosition();
    }
}
