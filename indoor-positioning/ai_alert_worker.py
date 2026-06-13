# 文件路径: indoor-positioning/ai_alert_worker.py

import json
import time
import os
import paho.mqtt.client as mqtt
from zhipuai import ZhipuAI

# ==========================================
# 1. 配置 智谱 AI (GLM-4-Flash)
# 获取 API Key: https://bigmodel.cn/
# ==========================================
ZHIPU_API_KEY = "f84f6de07a254ba3a894cf8c7f885a64.OCWflzxyHiU3WETe" 

if ZHIPU_API_KEY == "在这里填入您的_智谱_API_KEY":
    print("[WARN] 请记得将您的智谱 API Key 填入代码中！")

# 初始化智谱客户端
ai_client = ZhipuAI(api_key=ZHIPU_API_KEY)

# ==========================================
# 2. MQTT 基础配置
# ==========================================
MQTT_BROKER = "127.0.0.1" 
MQTT_PORT = 1883
TOPIC_PRELIMINARY = "indoor/alert/preliminary" # 监听底层传来的初筛警报
TOPIC_CONFIRMED = "indoor/alert/confirmed"     # 发送给 Java 后端的最终确认警报

def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        print(f"[SYS] ✅ AI 监控守护进程已成功连接到 MQTT Broker")
        client.subscribe(TOPIC_PRELIMINARY)
        print(f"[SYS] 📡 正在静默监听初筛警报主题: {TOPIC_PRELIMINARY}")
    else:
        print(f"[ERR] ❌ 连接 MQTT 失败, 返回码: {reason_code}")

def on_message(client, userdata, msg):
    try:
        # 1. 解析底层定位脚本/手表发来的初筛数据
        payload = json.loads(msg.payload.decode('utf-8'))
        alert_type = payload.get('type', 'UNKNOWN')
        original_msg = payload.get('message', '')
        
        print(f"\n[{time.strftime('%H:%M:%S')}] 🚨 收到初筛警报: [{alert_type}]")
        print(f"[*] 🧠 正在调用 GLM-4-Flash 进行上下文深度复核...")
        
        # 2. 构建给 GLM 的 Prompt (分为系统人设和当前事件)
        system_prompt = """你是一个专业的物联网居家养老医疗AI助手。
请你结合常识，判断底层传感器触发的初步异常警报是否是一个真实的危险情况，还是因为日常活动或设备信号跳动导致的误报。
请必须严格返回一个合法的 JSON 对象。字段如下：
- "is_true_alert" (boolean): 如果认为有真实危险(如摔倒、晕厥、心率异常)返回 true，如果是日常活动(如正在做家务、信号轻微波动)返回 false。
- "reasoning" (string): 简短说明你的推理过程（50字以内的中文）。
- "suggested_severity" (string): 重新评估危险等级（仅限 LOW, MEDIUM, HIGH, CRITICAL 四选一）。"""

        user_prompt = f"【当前触发事件】：{original_msg}\n【报警类型】：{alert_type}"
        
        # 3. 发送请求给智谱 API
        response = ai_client.chat.completions.create(
            model="glm-4-flash",  # 使用免费的高速 flash 模型
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            # 强制要求 GLM-4 返回纯 JSON 格式
            response_format={"type": "json_object"}
        )
        
        # 解析 GLM 返回的 JSON 字符串
        ai_response_text = response.choices[0].message.content
        ai_result = json.loads(ai_response_text)
        
        # 4. 根据 AI 判断结果决定是否放行
        if ai_result.get("is_true_alert", True):
            print(f"✅ 【AI 判定：真警报】 {ai_result.get('reasoning')}")
            
            # 将 AI 的分析结果融合进原有数据包
            payload['ai_analysis'] = ai_result.get('reasoning')
            payload['severity'] = ai_result.get('suggested_severity', payload.get('severity', 'HIGH'))
            
            # 重新打包成 JSON 推送到确认队列
            client.publish(TOPIC_CONFIRMED, json.dumps(payload), qos=1)
            print(f"[*] 📤 警报已放行并推送至 {TOPIC_CONFIRMED}")
        else:
            # 误报拦截
            print(f"🛑 【AI 判定：误报已拦截】 {ai_result.get('reasoning')}")

    except Exception as e:
        print(f"[ERR] ❌ 调用 GLM-4 或处理警报时发生异常: {e}")
        print(f"[*] ⚠️ 触发安全兜底机制：默认放行原警报，防止漏报！")
        # 安全兜底：原样把底层的数据推给 Java
        client.publish(TOPIC_CONFIRMED, msg.payload, qos=1)

if __name__ == "__main__":
    print("=" * 52)
    print("   🧠 启动 Elderly Care AI 警报降噪进程 (Powered by GLM-4)")
    print("=" * 52)
    
    # 启动 MQTT 客户端
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        client.loop_forever()
    except KeyboardInterrupt:
        print("\n[SYS] 🛑 AI 监控进程已手动停止。")
    except ConnectionRefusedError:
        print(f"[ERR] 无法连接到 MQTT Broker ({MQTT_BROKER}:{MQTT_PORT})，请确认 Mosquitto 服务是否已启动。")