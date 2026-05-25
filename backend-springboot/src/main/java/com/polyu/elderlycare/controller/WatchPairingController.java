package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.dto.WatchPairingConfigureRequest;
import com.polyu.elderlycare.dto.WatchPairingConfigureResponse;
import com.polyu.elderlycare.dto.WatchPairingHandshakeRequest;
import com.polyu.elderlycare.dto.WatchPairingHandshakeResponse;
import com.polyu.elderlycare.dto.WatchPairingServerTargetResponse;
import com.polyu.elderlycare.service.WatchPairingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/watch-pairing")
public class WatchPairingController {

    private final WatchPairingService watchPairingService;

    public WatchPairingController(WatchPairingService watchPairingService) {
        this.watchPairingService = watchPairingService;
    }

    @GetMapping("/server-target")
    public WatchPairingServerTargetResponse getServerTarget(HttpServletRequest request) {
        return watchPairingService.getServerTarget(request);
    }

    @PostMapping("/configure")
    public WatchPairingConfigureResponse configureWatch(
            @Valid @RequestBody WatchPairingConfigureRequest request
    ) {
        return watchPairingService.configureWatch(request);
    }

    @PostMapping("/handshake")
    public WatchPairingHandshakeResponse confirmHandshake(
            @Valid @RequestBody WatchPairingHandshakeRequest request
    ) {
        return watchPairingService.confirmHandshake(request);
    }
}
