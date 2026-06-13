# ESP32-S3 压力传感器节点

## 一机一家具

每个 ESP32 只监测一件家具。要新增家具，需要：

1. 复制一份本目录（例如 `esp32_pressure_mqtt_bed`）。
2. 修改 `device_config.h` 里的两行：
   ```cpp
   static const char* PRESSURE_NODE_ID = "bed";     // 对应家具 ID
   static const char* FURNITURE_LABEL  = "Bed";     // 人类可读标签
   ```
   可选的 ID 必须与 `positioning_config.py` 里的 `FURNITURE` 字典键一致：
   - `sofa`
   - `bed`
   - `toilet`
3. 修改 `MQTT_CLIENT` 保证每个节点唯一，例如：
   ```cpp
   static const char* MQTT_CLIENT = "esp32_pressure_bed_01";
   ```
4. 用 Arduino IDE 打开 `.ino` 文件，选择对应的 COM 口，上传。

> 提示：Arduino IDE 要求 `.ino` 文件名和所在文件夹名相同。复制后请把文件夹和 `.ino` 文件一起改名。

## 安装依赖库

在 Arduino IDE 的 **库管理器** 中搜索并安装：

- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon

## 接线

采用电阻分压法（ESP32 内部下拉，无需外接电阻）：

```
ESP32-S3 3V3  ──┬──  RP-L-170 引脚 1
                │
                └──  GPIO1/2/... (ADC1)

RP-L-170 引脚 2 ── GND
```

- 使用 **ADC1** 引脚（GPIO1-10），WiFi 启用时请勿使用 ADC2。
- 若信号不稳，可在 ADC 引脚与 GND 之间加 100nF 陶瓷电容。

## 标定阈值

当前使用内部下拉 + 软件区间投票，阈值设为 `3000`。实际部署时请按以下步骤微调：

1. 空载时记录 `raw_adc`（正常应接近 0~300）。
2. 坐上/压上家具后记录稳定 `raw_adc`（应明显高于空载）。
3. `PRESSURE_THRESHOLD_ADC` 设在两者之间，偏上可防止误触发。
4. 如果触发/释放响应太慢，调整 `PRESSURE_BLOCK_SIZE` 和 `PRESSURE_BLOCK_OCCUPIED`。

## 验证 MQTT

上传后打开串口监视器，坐下/站起应看到类似输出：

```
[MQTT->] indoor/pressure/sofa/state : {"location":"sofa","occupied":true,...}
```

也可以在本项目根目录运行测试工具：

```bash
# 模拟沙发有人
python indoor-positioning/test_pressure_publisher.py --location sofa --occupied

# 模拟床无人
python indoor-positioning/test_pressure_publisher.py --location bed --vacant
```

## 与可视化系统对接

Python 定位服务器 `indoor_positioning_server.py` 已订阅 `indoor/pressure/+/state`。当任一家具 `occupied=true` 时：

- 输出坐标跳到该家具中心。
- `source` 字段变为 `pressure`。
- `semanticLocation` 字段显示家具名称（如 `Sofa`）。

前端 3D 视图和房间卡片会优先显示 `semanticLocation`，所以坐下沙发时会显示 **Sofa** / **Sitting on sofa**。
