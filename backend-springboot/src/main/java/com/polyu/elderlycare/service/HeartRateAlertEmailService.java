package com.polyu.elderlycare.service;

import com.polyu.elderlycare.entity.Resident;
import jakarta.annotation.PostConstruct;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class HeartRateAlertEmailService {

    private static final Logger LOGGER = LoggerFactory.getLogger(HeartRateAlertEmailService.class);

    private final JavaMailSender mailSender;

    @Value("${app.email-alert.heart-rate-enabled:false}")
    private boolean enabled;

    @Value("${app.email-alert.to:}")
    private String configuredRecipient;

    @Value("${app.email-alert.from:}")
    private String configuredSender;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${spring.mail.password:}")
    private String mailPassword;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${spring.mail.port:0}")
    private int mailPort;

    public HeartRateAlertEmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @PostConstruct
    public void logConfigurationStatus() {
        LOGGER.info(
                "High-heart-rate email configuration: enabled={}, server={}:{}, "
                        + "senderConfigured={}, passwordConfigured={}, recipientConfigured={}",
                enabled,
                mailHost,
                mailPort,
                mailUsername != null && !mailUsername.isBlank(),
                mailPassword != null && !mailPassword.isBlank(),
                configuredRecipient != null && !configuredRecipient.isBlank()
        );
    }

    @Async
    public void sendHighHeartRate(Resident resident, double bpm, String recipientOverride) {
        if (!enabled) {
            LOGGER.info("High-heart-rate email is disabled; alert for watch {} was not emailed", resident.getWatchId());
            return;
        }

        String recipient = firstNonBlank(recipientOverride, configuredRecipient);
        if (recipient == null) {
            LOGGER.warn("High-heart-rate email has no recipient; set HEART_RATE_ALERT_EMAIL_TO");
            return;
        }
        if (mailUsername == null || mailUsername.isBlank()) {
            LOGGER.warn("High-heart-rate email has no sender account; set spring.mail.username");
            return;
        }
        if (mailPassword == null || mailPassword.isBlank()) {
            LOGGER.warn("High-heart-rate email has no app password; set spring.mail.password");
            return;
        }

        String sender = firstNonBlank(configuredSender, mailUsername);
        SimpleMailMessage message = new SimpleMailMessage();
        if (sender != null) {
            message.setFrom(sender);
        }
        message.setTo(recipient);
        message.setSubject("[Elderly Care Alert] High heart rate - " + resident.getName());
        message.setText("""
                A high heart rate warning has been triggered.

                Resident: %s
                Room: %s
                Watch ID: %s
                Heart rate: %.0f bpm
                Detected at: %s
                Source: heart-rate alert simulator

                Please check the resident promptly and confirm the reading with the watch or a clinical device.
                If the resident has chest pain, breathing difficulty, fainting, or other serious symptoms, seek emergency medical help.
                """.formatted(
                resident.getName(),
                resident.getRoom(),
                resident.getWatchId(),
                bpm,
                ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        ));

        try {
            mailSender.send(message);
            LOGGER.info("High-heart-rate warning email sent to {} for watch {}", recipient, resident.getWatchId());
        } catch (MailException ex) {
            LOGGER.error(
                    "Failed to send high-heart-rate warning email to {} for watch {}",
                    recipient,
                    resident.getWatchId(),
                    ex
            );
        }
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
