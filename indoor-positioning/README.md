# ESP32 BLE + MQTT 室内定位系统 - 快速上手

## 文件说明

| 文件 | 用途 |
|------|------|
| `firmware/esp32_ble_mqtt/esp32_ble_mqtt.ino` | ESP32 固件：BLE扫描 + Kalman滤波 + WiFi + MQTT |
| `mosquitto.conf` | Mosquitto 配置文件 |
| `mqtt_broker.ps1` | 本地 Mosquitto 启停脚本 |
| `mqtt_test_subscriber.py` | Python 测试脚本：验证数据链路 |

## 快速开始（3步）

### 第1步：启动 MQTT Broker

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\mqtt_broker.ps1 start
```

如果你没有 Docker，也可以直接安装 Mosquitto：
```bash
# macOS
brew install mosquitto
mosquitto -c mosquitto.conf

# Ubuntu/Debian
sudo apt install mosquitto
sudo systemctl start mosquitto

# Windows
# 从 https://mosquitto.org/download/ 下载安装
```

### 第2步：刷写 ESP32 固件

1. 用 Arduino IDE 打开 `firmware/esp32_ble_mqtt/esp32_ble_mqtt.ino`

2. 安装依赖库（Arduino Library Manager）：
   - `PubSubClient` by Nick O'Leary
   - `ArduinoJson` by Benoit Blanchon

3. **只修改配置文件** `firmware/esp32_ble_mqtt/device_config.h`：
   ```cpp
   static const char* WIFI_SSID     = "你的WiFi名称";
   static const char* WIFI_PASSWORD = "你的WiFi密码";
   static const char* MQTT_SERVER   = "192.168.x.x";  // 运行 broker 的电脑 IP
   static const char* MQTT_CLIENT   = "esp32_beacon_01"; // 每块板子不同
   static const char* BEACON_ID     = "anchor_01";       // 每块板子不同
   static const char* TARGET_MAC    = "xx:xx:xx:xx:xx:xx";
   ```

4. 查找电脑 IP：
   ```bash
   # macOS / Linux
   ifconfig | grep "inet "
   # Windows
   ipconfig
   ```

5. 选择板子 `ESP32 Dev Module`，上传代码

6. 打开串口监视器（115200），应看到：
   ```
   [WiFi] 正在连接 YourWiFi... 已连接!
   [WiFi] IP 地址: 192.168.1.xxx
   [TIME] synced, epoch_ms=...
   [MQTT] 正在连接 192.168.1.100:1883 ... 已连接!
   [MQTT->] slot=... indoor/ble/anchor_01/rssi : {"anchor":"anchor_01","raw":-65,"filtered":-62.3,"ts":12345,"rx_epoch_ms":...,"packet_slot":...,"adv_interval_ms":250}
   ```

### 第3步：验证数据链路

```bash
pip install paho-mqtt
python mqtt_test_subscriber.py
```

成功后应该看到：
```
[14:30:05.123] BLE  | anchor_01 | raw= -65 dBm | filtered= -62.3 dBm | slot=6849960000
[14:30:06.345] BLE  | anchor_01 | raw= -67 dBm | filtered= -63.1 dBm | slot=6849960001
```

## 多节点部署（三边测量）

三边测量需要 **至少3个 ESP32 锚点**。每个锚点用相同的代码，只需修改：

```
ESP32 #1: device_config.h -> BEACON_ID = "anchor_01", MQTT_CLIENT = "esp32_beacon_01"
ESP32 #2: device_config.h -> BEACON_ID = "anchor_02", MQTT_CLIENT = "esp32_beacon_02"
ESP32 #3: device_config.h -> BEACON_ID = "anchor_03", MQTT_CLIENT = "esp32_beacon_03"
```

## MQTT Topic 结构

```
indoor/
├── ble/
│   ├── anchor_01/
│   │   ├── rssi      # {"anchor":"anchor_01", "target":"xx:xx:...", "raw":-65, "filtered":-62.3, "ts":12345, "rx_epoch_ms":..., "packet_slot":..., "adv_interval_ms":250}
│   │   └── status    # {"online":true, "uptime":3600, "wifi_rssi":-45}
│   ├── anchor_02/
│   │   ├── rssi
│   │   └── status
│   └── anchor_03/
│       ├── rssi
│       └── status
├── pir/              # (后续扩展)
│   ├── bedroom/event
│   ├── bathroom/event
│   └── kitchen/event
└── pressure/         # (后续扩展)
    ├── bed/state
    ├── sofa/state
    └── chair/state
```

## 常见问题

**Q: ESP32 串口显示 WiFi 连接失败**
- 检查 SSID 和密码是否正确（注意大小写）
- ESP32 只支持 2.4GHz WiFi，不支持 5GHz

**Q: WiFi 连上但 MQTT 连接失败**
- 检查 MQTT_SERVER IP 是否正确
- 确保 Broker 已启动：`powershell -NoProfile -ExecutionPolicy Bypass -File .\mqtt_broker.ps1 status`
- 确保防火墙允许 1883 端口
- ESP32 和 Broker 必须在同一局域网

**Q: MQTT 连上但 Python 收不到数据**
- 检查 Python 脚本中的 MQTT_BROKER 地址
- 用 `mosquitto_sub -t "#" -v` 测试 broker 是否正常

**Q: BLE 信标丢失 (LOST)**
- 信标距离太远或有遮挡
- 检查 TARGET_MAC 是否正确
- 尝试增大 SCAN_TIME（如改为2-3秒）

**Q: 定位偏差很大 / 点位跑到墙外**
- 确保只运行一个 `indoor_positioning_server.py` 实例（多实例会互相抢同一个 MQTT client_id）
- 在 `positioning_config.py` 中逐个锚点标定 `tx_power`（1 米处实测平均 RSSI）
- 优先让 `MQTT_BROKER` 使用 `localhost`（当服务端和 broker 在同一台电脑）
- 观察定位输出中的 `residual_rms_m` 与 `confidence`，若长期 `confidence < 0.45`，优先做参数标定

## 第4步：运行定位解算服务（新增）

你当前工程已经能把多锚点 RSSI 发到 MQTT。现在可直接运行新增的 Python 服务，输出二维坐标：

```bash
pip install -r requirements.txt
python indoor_positioning_server.py
```

定位服务会订阅：

```text
indoor/ble/+/rssi
```

当前默认工作模式：
- 每 30 秒输出一次定位结果（不是连续追踪）
- 每次输出仅使用“同一 packet_slot 的三锚点样本”作为有效帧
- 在过去 30 秒窗口内，对这些有效帧的定位结果取中位数
- 适合中期报告中的阶段性位置确认场景

### 老师要求的数据一致性模式（已实现）

你老师要求的是：一次定位计算中，3 个锚点必须来自 beacon 的同一次发送（同一 `packet_slot`）。

项目中对应做法：
- ESP32 固件发布 `packet_slot` 和 `rx_epoch_ms`（NTP 对齐时间）
- Python 服务器开启 `USE_PACKET_SLOT_SYNC=True`
- 服务器只使用同一 `packet_slot` 且锚点数 >= 3 的数据帧做解算
- 若 30 秒窗口内有效同步帧不足 `MIN_SYNC_FRAMES_PER_UPDATE`，本轮不输出位置（避免混包）

必须执行：
1. 三个锚点都刷入最新 `firmware/esp32_ble_mqtt/esp32_ble_mqtt.ino`
2. 确保串口能看到 `[TIME] synced`（没有这个就不满足同包一致性）
3. 重启 `indoor_positioning_server.py`，确认日志出现 `Strict packet-slot sync enabled`

并发布定位结果到：

```text
indoor/location/target_01
```

### 配置锚点坐标与模型参数

请先修改 `positioning_config.py`：

```python
ANCHORS = {
   "anchor_01": {"x": 0.0, "y": 0.0, "tx_power": -59.0},
   "anchor_02": {"x": 4.0, "y": 0.0, "tx_power": -59.0},
   "anchor_03": {"x": 0.0, "y": 4.0, "tx_power": -59.0},
}

PATH_LOSS_EXPONENT = 2.0
```

- `x,y` 单位是米，按你房间平面图填写
- `tx_power` 是该锚点与标签在 1 米处的 RSSI（建议实测）
- `PATH_LOSS_EXPONENT` 常见范围 1.8~3.0，室内通常 2.0 左右

### 标定建议（提升定位精度）

1. 把标签固定在每个锚点正前方 1 米处，采样 30~60 秒，取平均 RSSI 作为该锚点 `tx_power`
2. 把标签放在已知坐标点（如客厅中心、卧室门口）做验证
3. 若整体距离估计偏大，减小 `PATH_LOSS_EXPONENT`；偏小则增大
4. 若坐标抖动明显，可在 ESP32 端提高滤波强度（减小 `kalman_q` 或增大 `kalman_r`）

### 结果样例

```text
[LOC] x=1.842, y=2.116 | spread=0.041m | residual=0.823m | conf=0.81 | solver=trilateration
```

你也可以再开一个终端验证定位 topic：

```bash
mosquitto_sub -h localhost -t "indoor/location/target_01" -v
```

## 第5步：实时可视化坐标与人物（新增）

新增可视化脚本：`indoor_position_visualizer.py`

功能：
- 绘制锚点位置（anchor）
- 绘制人物实时位置（红点）
- 显示定位状态卡片（OK / LOW CONFIDENCE / SIGNAL STALE / WAITING）
- 默认不显示轨迹，仅展示当前快照位置（每 30 秒更新一次）

运行方式（建议开两个终端）：

终端 A：启动定位解算
```bash
python indoor_positioning_server.py
```

终端 B：启动可视化
```bash
python indoor_position_visualizer.py
```

### 一键启动（推荐）

如果你不想手动维护多个终端，可直接用脚本自动分开窗口启动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start_positioning_stack.ps1
```

或直接双击：

```text
start_positioning_stack.bat
```

停止全部相关进程：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop_positioning_stack.ps1
```

如果依赖未安装：
```bash
pip install -r requirements.txt
```

说明：
- 可视化脚本订阅 `indoor/location/target_01`
- 坐标范围和锚点位置来自 `positioning_config.py`
- 状态显示：`OK / LOW CONFIDENCE / SIGNAL STALE`
- 信息面板仅显示：最终坐标 `x,y` 与时间戳 `ts`

### 让屏幕方向和站位一致

可在 `positioning_config.py` 中设置：

```python
VISUAL_VIEW_TRANSFORM = "none"
```

可选值：
- `none`：默认方向（anchor_02 左下，anchor_03 右侧，anchor_01 上方）
- `flip_x`：左右镜像
- `flip_y`：上下镜像
- `rotate_cw`：顺时针旋转 90°
- `rotate_ccw`：逆时针旋转 90°

修改后重启可视化脚本即可生效（定位服务可不重启）。

### 固定点坐标如何确定（推荐）

新增采样脚本：`position_point_sampler.py`

用途：你站在某个位置不动 20~30 秒，自动统计该点的坐标分布。

```bash
python position_point_sampler.py
```

输出会给出 Mean、Median、Std，建议在报告中把 `Median` 作为该固定点坐标。

### 锚点 tx_power 标定（强烈推荐）

新增标定脚本：`tx_power_calibrator.py`

用途：按锚点逐个估计 `tx_power`，避免使用信标标称值导致定位贴边和低置信度。

步骤（每个锚点都执行一次）：

1. 把标签放在目标锚点前方 1.0m，尽量无遮挡。
2. 保持 30~60 秒不动采样。
3. 将脚本输出的 `suggested tx_power` 写回 `positioning_config.py` 的对应锚点。

示例：标定 anchor_01（45 秒）

```bash
python tx_power_calibrator.py --anchor anchor_01 --duration 45 --distance 1.0
```

依次标定：

```bash
python tx_power_calibrator.py --anchor anchor_02 --duration 45 --distance 1.0
python tx_power_calibrator.py --anchor anchor_03 --duration 45 --distance 1.0
```

可选参数：
- `--use-raw`：用原始 RSSI 标定（默认使用 filtered）
- `--n`：指定路径损耗指数（默认读取 `positioning_config.py`）
- `--min-samples`：最小样本数阈值（默认 15）
