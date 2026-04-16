package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.PositionStreamService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PositionController {

    private final PositionStreamService positionStreamService;

    public PositionController(PositionStreamService positionStreamService) {
        this.positionStreamService = positionStreamService;
    }

    @GetMapping("/position/latest")
    public Map<String, Object> getLatestPosition() {
        return positionStreamService.getLatestPosition();
    }
}
