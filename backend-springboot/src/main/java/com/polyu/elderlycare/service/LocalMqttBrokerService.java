package com.polyu.elderlycare.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Starts a local Mosquitto process when the backend owns the MQTT broker.
 */
@Service
public class LocalMqttBrokerService {

    private static final Logger LOGGER = LoggerFactory.getLogger(LocalMqttBrokerService.class);

    @Value("${app.mqtt-broker.auto-start:true}")
    private boolean autoStart;

    @Value("${app.mqtt-broker.host:127.0.0.1}")
    private String host;

    @Value("${app.mqtt-broker.port:1883}")
    private int port;

    @Value("${app.mqtt-broker.executable:C:/Program Files/Mosquitto/mosquitto.exe}")
    private String executable;

    @Value("${app.mqtt-broker.config-file:../indoor-positioning/mosquitto.conf}")
    private String configFile;

    @Value("${app.mqtt-broker.log-file:./.runtime/mosquitto.log}")
    private String logFile;

    @Value("${app.mqtt-broker.startup-timeout:5s}")
    private Duration startupTimeout;

    private Process ownedProcess;

    @PostConstruct
    public synchronized void startIfNeeded() {
        if (!autoStart) {
            LOGGER.info("Automatic local MQTT broker startup is disabled");
            return;
        }

        if (isBrokerAvailable()) {
            LOGGER.info("MQTT broker is already available at {}:{}", host, port);
            return;
        }

        Path executablePath = resolveExecutable();
        Path configPath = resolveConfigFile();
        Path outputPath = resolvePath(logFile);

        if (!Files.isRegularFile(executablePath)) {
            LOGGER.warn("Cannot auto-start MQTT broker; Mosquitto executable not found: {}", executablePath);
            return;
        }
        if (!Files.isRegularFile(configPath)) {
            LOGGER.warn("Cannot auto-start MQTT broker; config file not found: {}", configPath);
            return;
        }

        try {
            Path parent = outputPath.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }

            ProcessBuilder builder = new ProcessBuilder(
                    executablePath.toString(),
                    "-c",
                    configPath.toString(),
                    "-v"
            );
            builder.redirectErrorStream(true);
            builder.redirectOutput(ProcessBuilder.Redirect.appendTo(outputPath.toFile()));
            ownedProcess = builder.start();

            if (waitUntilAvailable()) {
                LOGGER.info(
                        "Started local MQTT broker at {}:{} (PID {}, log {})",
                        host,
                        port,
                        ownedProcess.pid(),
                        outputPath
                );
                return;
            }

            int exitCode = ownedProcess.isAlive() ? -1 : ownedProcess.exitValue();
            stopOwnedProcess();
            LOGGER.warn(
                    "Mosquitto did not become available at {}:{} within {} (exit code {}, log {})",
                    host,
                    port,
                    startupTimeout,
                    exitCode,
                    outputPath
            );
        } catch (IOException ex) {
            stopOwnedProcess();
            LOGGER.warn("Failed to auto-start local MQTT broker: {}", ex.getMessage());
        }
    }

    @PreDestroy
    public synchronized void stop() {
        stopOwnedProcess();
    }

    private boolean waitUntilAvailable() {
        long deadline = System.nanoTime() + startupTimeout.toNanos();
        while (System.nanoTime() < deadline) {
            if (isBrokerAvailable()) {
                return true;
            }
            if (ownedProcess != null && !ownedProcess.isAlive()) {
                return false;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return isBrokerAvailable();
    }

    private boolean isBrokerAvailable() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 300);
            return true;
        } catch (IOException ex) {
            return false;
        }
    }

    private Path resolveExecutable() {
        Path configured = Path.of(executable);
        if (configured.isAbsolute() || Files.exists(configured)) {
            return configured.toAbsolutePath().normalize();
        }
        return resolvePath(executable);
    }

    private Path resolveConfigFile() {
        List<Path> candidates = new ArrayList<>();
        candidates.add(resolvePath(configFile));
        candidates.add(resolvePath("indoor-positioning/mosquitto.conf"));
        candidates.add(resolvePath("../indoor-positioning/mosquitto.conf"));

        return candidates.stream()
                .filter(Files::isRegularFile)
                .findFirst()
                .orElse(candidates.get(0));
    }

    private Path resolvePath(String value) {
        return Path.of(value).toAbsolutePath().normalize();
    }

    private void stopOwnedProcess() {
        if (ownedProcess == null) {
            return;
        }

        Process process = ownedProcess;
        ownedProcess = null;
        if (!process.isAlive()) {
            return;
        }

        process.destroy();
        try {
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
            }
            LOGGER.info("Stopped backend-managed MQTT broker (PID {})", process.pid());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }
}
