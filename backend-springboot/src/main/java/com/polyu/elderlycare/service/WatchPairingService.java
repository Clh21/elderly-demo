package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.WatchPairingConfigureRequest;
import com.polyu.elderlycare.dto.WatchPairingConfigureResponse;
import com.polyu.elderlycare.dto.WatchPairingHandshakeRequest;
import com.polyu.elderlycare.dto.WatchPairingHandshakeResponse;
import com.polyu.elderlycare.dto.WatchPairingServerTargetResponse;
import jakarta.servlet.http.HttpServletRequest;

public interface WatchPairingService {

    WatchPairingServerTargetResponse getServerTarget(HttpServletRequest request);

    WatchPairingConfigureResponse configureWatch(WatchPairingConfigureRequest request);

    WatchPairingHandshakeResponse confirmHandshake(WatchPairingHandshakeRequest request);
}
