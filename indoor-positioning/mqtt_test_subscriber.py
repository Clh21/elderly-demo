"""
============================================
MQTT 订阅测试脚本
============================================
用途：验证 ESP32 -> MQTT Broker -> Python 整条链路

使用方法：
  1. pip install paho-mqtt
  2. 修改下面的 MQTT_BROKER 为你电脑的 IP
  3. python mqtt_test_subscriber.py
  4. 上电 ESP32，观察终端输出

你应该能看到类似这样的输出：
    [anchor_01] raw=-65 filtered=-63.2 slot=6849960000
    [anchor_01] raw=-67 filtered=-63.8 slot=6849960001
============================================
"""

import json
import time
from datetime import datetime

import paho.mqtt.client as mqtt

# ============ 配置 ============
MQTT_BROKER = "localhost"  # 如果 broker 在本机
MQTT_PORT = 1883
# 订阅所有锚点的数据
TOPICS = [
    ("indoor/ble/+/rssi", 0),    # 所有锚点的 RSSI 数据
    ("indoor/ble/+/status", 0),  # 所有锚点的状态
    ("indoor/pir/+/event", 0),   # (预留) PIR 传感器事件
    ("indoor/pressure/+/state", 0),  # (预留) 压力传感器状态
]


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("=" * 50)
        print(f"  已连接到 MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
        print(f"  时间: {datetime.now().strftime('%H:%M:%S')}")
        print("=" * 50)
        # 订阅所有 topic
        client.subscribe(TOPICS)
        for topic, qos in TOPICS:
            print(f"  订阅: {topic}")
        print("=" * 50)
        print("等待 ESP32 数据...\n")
    else:
        print(f"连接失败! 错误码: {rc}")
        error_msgs = {
            1: "协议版本不正确",
            2: "客户端标识无效",
            3: "服务器不可用",
            4: "用户名或密码错误",
            5: "未授权",
        }
        print(f"  原因: {error_msgs.get(rc, '未知错误')}")


def on_message(client, userdata, msg):
    topic = msg.topic
    try:
        payload = json.loads(msg.payload.decode())
    except json.JSONDecodeError:
        payload = msg.payload.decode()

    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]

    # 根据 topic 类型格式化输出
    if "/rssi" in topic:
        anchor = payload.get("anchor", "?")
        raw = payload.get("raw", "?")
        filtered = payload.get("filtered", "?")
        packet_slot = payload.get("packet_slot", "-")
        print(
            f"[{timestamp}] BLE  | {anchor} | raw={raw:>4} dBm | "
            f"filtered={filtered:>6} dBm | slot={packet_slot}"
        )

    elif "/status" in topic:
        anchor = payload.get("anchor", "?")
        online = payload.get("online", False)
        status = "上线 ✓" if online else "离线 ✗"
        uptime = payload.get("uptime", 0)
        print(f"[{timestamp}] 状态 | {anchor} | {status} | uptime={uptime}s")

    elif "/pir/" in topic:
        print(f"[{timestamp}] PIR  | {topic} | {payload}")

    elif "/pressure/" in topic:
        print(f"[{timestamp}] 压力 | {topic} | {payload}")

    else:
        print(f"[{timestamp}] 其他 | {topic} | {payload}")


def on_disconnect(client, userdata, rc, properties=None, reasonCode=None):
    if rc != 0:
        print(f"\n[!] 连接断开 (rc={rc})，尝试重连...")


def main():
    print("\n" + "=" * 50)
    print("  MQTT 订阅测试工具")
    print("  用于验证 ESP32 -> Broker -> Python 链路")
    print("=" * 50 + "\n")

    # 创建 MQTT 客户端 (paho-mqtt v2.x 兼容)
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="python_test_subscriber",
    )
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    try:
        print(f"正在连接 {MQTT_BROKER}:{MQTT_PORT} ...")
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        client.loop_forever()
    except ConnectionRefusedError:
        print(f"\n[错误] 无法连接到 {MQTT_BROKER}:{MQTT_PORT}")
        print("  请检查:")
        print("  1. MQTT Broker 是否已启动?  (docker compose up -d)")
        print(f"  2. IP 地址是否正确?  (当前: {MQTT_BROKER})")
        print("  3. 端口 1883 是否被防火墙阻挡?")
    except KeyboardInterrupt:
        print("\n\n已停止监听")
        client.disconnect()


if __name__ == "__main__":
    main()
