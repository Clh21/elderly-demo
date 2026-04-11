package com.polyu.elderlycare.startup;

import com.polyu.elderlycare.repository.WatchDataRepository;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class BackendStartupRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(BackendStartupRunner.class);

    private final WatchDataRepository watchDataRepository;

    public BackendStartupRunner(WatchDataRepository watchDataRepository) {
        this.watchDataRepository = watchDataRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            watchDataRepository.ensureAlertTypeEnum();
        } catch (Exception ex) {
            LOGGER.warn("Alert enum migration failed: {}", ex.getMessage());
        }

        try {
            Optional<Integer> residentId = watchDataRepository.findResidentIdByWatchId("demo-watch-001");
            if (residentId.isPresent()) {
                double heartRate = Math.round(72 + (Math.random() - 0.5) * 16);
                double temperature = Math.round((36.5 + (Math.random() - 0.5) * 1.0) * 10) / 10.0;
                double eda = Math.round((2.5 + (Math.random() - 0.5) * 1.5) * 10) / 10.0;
                String slot = java.time.LocalDateTime.now()
                        .truncatedTo(java.time.temporal.ChronoUnit.MINUTES)
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:00"));
                watchDataRepository.seedDemoMinuteReading(residentId.get(), slot, heartRate, temperature, eda);
            }
        } catch (Exception ex) {
            LOGGER.warn("Demo seed failed: {}", ex.getMessage());
        }
    }
}