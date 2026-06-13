package com.polyu.elderlycare.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polyu.elderlycare.entity.Alert;
import com.polyu.elderlycare.entity.AlertSeverity;
import com.polyu.elderlycare.entity.AlertStatus;
import com.polyu.elderlycare.entity.AlertType;
import com.polyu.elderlycare.entity.Resident;
import com.polyu.elderlycare.repository.AlertRepository;
import com.polyu.elderlycare.repository.ResidentRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.IMqttClient;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AiAlertMqttBridge {

    private static final Logger log = LoggerFactory.getLogger(AiAlertMqttBridge.class);

    private final AlertRepository alertRepository;
    private final ResidentRepository residentRepository;
    private final ObjectMapper objectMapper;
    private IMqttClient mqttClient;

    // 假设你的 MQTT Broker 跑在本地，你可以把它提取到 application.yml 中
    @Value("${mqtt.broker.url:tcp://127.0.0.1:1883}")
    private String brokerUrl;

    private static final String TOPIC_CONFIRMED = "indoor/alert/confirmed";

    public AiAlertMqttBridge(AlertRepository alertRepository, ResidentRepository residentRepository) {
        this.alertRepository = alertRepository;
        this.residentRepository = residentRepository;
        this.objectMapper = new ObjectMapper();
    }

    @PostConstruct
    public void init() {
        try {
            // 使用随机 ClientID 防止多个实例冲突
            String clientId = "SpringBoot-AiBridge-" + UUID.randomUUID().toString().substring(0, 8);
            mqttClient = new MqttClient(brokerUrl, clientId, new MemoryPersistence());

            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(true);
            options.setConnectionTimeout(10);

            mqttClient.connect(options);
            log.info("✅ AiAlertMqttBridge 成功连接到 MQTT Broker: {}", brokerUrl);

            // 订阅 AI 确认过的报警主题
            mqttClient.subscribe(TOPIC_CONFIRMED, (topic, msg) -> {
                String payload = new String(msg.getPayload());
                handleConfirmedAlert(payload);
            });
            log.info("📡 正在监听 AI 最终预警主题: {}", TOPIC_CONFIRMED);

        } catch (Exception e) {
            log.error("❌ AiAlertMqttBridge 初始化或连接 MQTT 失败: ", e);
        }
    }

    @Transactional
    public void handleConfirmedAlert(String payload) {
        try {
            log.info("🚨 接收到 AI 确认的警报数据: {}", payload);
            JsonNode json = objectMapper.readTree(payload);

            // 1. 解析基础字段
            // 注意：如果 JSON 传过来的 type 带有下划线或大小写不一致，转换为大写匹配 Enum
            String rawType = json.has("type") ? json.get("type").asText().toUpperCase() : "FALL_DETECTION";
            AlertType alertType;
            try {
                // 这里调用的是 AlertType.java 中原有的枚举匹配机制
                alertType = AlertType.valueOf(rawType);
            } catch (IllegalArgumentException e) {
                // 如果遇到未知的类型，安全兜底为 FALL_DETECTION
                alertType = AlertType.FALL_DETECTION; 
            }

            AlertSeverity severity = json.has("severity") ? 
                    AlertSeverity.valueOf(json.get("severity").asText().toUpperCase()) : AlertSeverity.CRITICAL;
            
            String originalMsg = json.has("message") ? json.get("message").asText() : "检测到未知异常";

            // 2. 提取 AI 独家分析结论
            String aiAnalysis = json.has("ai_analysis") ? json.get("ai_analysis").asText() : "AI 护工已确认此异常真实有效。";

            // 3. 核心设计：通过特殊标识符拼接 AI 结论，方便前端 React/Streamlit 切割渲染
            String finalMessage = originalMsg + "\n\n💡【AI 深度评估】:" + aiAnalysis;

            // 4. 绑定老人对象 (为了兼容测试环境，如果 Python 没传 resident_id，默认绑定给 ID = 1 的老人)
            int residentId = json.has("resident_id") ? json.get("resident_id").asInt() : 1;
            Resident resident = residentRepository.findById(residentId).orElse(null);
            
            if (resident == null) {
                log.warn("⚠️ 找不到 ID={} 的 Resident，该条警报将被忽略。", residentId);
                return;
            }

            // 5. 直接通过 Repository 存入数据库（绕过 Web 层的 Admin 鉴权）
            Alert alert = new Alert();
            alert.setResident(resident);
            alert.setType(alertType);
            alert.setSeverity(severity);
            alert.setMessage(finalMessage);
            alert.setStatus(AlertStatus.ACTIVE); // 新警报标记为未处理
            
            alertRepository.save(alert);
            log.info("✅ 成功将 AI 警报落盘存入数据库！警报 ID: {}", alert.getId());

        } catch (Exception e) {
            log.error("❌ 处理 MQTT AI 警报时发生严重异常: ", e);
        }
    }

    @PreDestroy
    public void cleanup() {
        try {
            if (mqttClient != null && mqttClient.isConnected()) {
                mqttClient.disconnect();
                mqttClient.close();
            }
        } catch (Exception e) {
            log.error("关闭 MQTT 客户端出错: ", e);
        }
    }
}