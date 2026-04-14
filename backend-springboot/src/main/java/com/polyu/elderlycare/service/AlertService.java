package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.AlertResponse;
import com.polyu.elderlycare.dto.CreateAlertRequest;
import java.util.List;

public interface AlertService {

    List<AlertResponse> getAlerts();

    List<AlertResponse> getLatestActiveAlerts(Integer afterId);

    void createAlert(CreateAlertRequest request);

    void resolveAlert(Integer id);
}