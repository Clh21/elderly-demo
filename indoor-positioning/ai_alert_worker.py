"""Verify preliminary MQTT alerts and forward confirmed alerts."""

import json
import os
import time
from typing import Any, Dict

import paho.mqtt.client as mqtt

try:
    from zhipuai import ZhipuAI
except ImportError:
    ZhipuAI = None


MQTT_BROKER = os.getenv("MQTT_BROKER", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
TOPIC_PRELIMINARY = "indoor/alert/preliminary"
TOPIC_CONFIRMED = "indoor/alert/confirmed"
ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "").strip()
ZHIPU_MODEL = os.getenv("ZHIPU_MODEL", "glm-4-flash")

ai_client = ZhipuAI(api_key=ZHIPU_API_KEY) if ZhipuAI and ZHIPU_API_KEY else None


def local_verification(payload: Dict[str, Any]) -> Dict[str, Any]:
    alert_type = str(payload.get("type", "unknown")).lower()
    if alert_type == "abnormal_stillness":
        duration_seconds = float(payload.get("duration_seconds", 0) or 0)
        confidence = float(payload.get("position_confidence", 0) or 0)
        true_alert = duration_seconds >= 30 * 60 and confidence >= 0.6
        reasoning = (
            f"Position remained stable for {duration_seconds / 60:.0f} minutes "
            f"with confidence {confidence:.2f}. Verify the resident in person."
            if true_alert
            else "Stillness duration or positioning confidence is insufficient for escalation."
        )
        return {
            "is_true_alert": true_alert,
            "reasoning": reasoning,
            "suggested_severity": "WARNING",
        }

    return {
        "is_true_alert": True,
        "reasoning": "AI service is unavailable; the sensor alert was forwarded for manual review.",
        "suggested_severity": str(payload.get("severity", "WARNING")).upper(),
    }


def ai_verification(payload: Dict[str, Any]) -> Dict[str, Any]:
    if ai_client is None:
        return local_verification(payload)

    context = {
        "type": payload.get("type"),
        "message": payload.get("message"),
        "duration_seconds": payload.get("duration_seconds"),
        "position_confidence": payload.get("position_confidence"),
        "position": payload.get("position"),
        "activity_state": payload.get("activity_state"),
        "source": payload.get("source"),
    }
    response = ai_client.chat.completions.create(
        model=ZHIPU_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You verify elderly-care sensor alerts. Use only the supplied evidence. "
                    "Do not diagnose disease. Return JSON with is_true_alert (boolean), "
                    "reasoning (short plain-English string), and suggested_severity "
                    "(WARNING or CRITICAL)."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(context, ensure_ascii=False),
            },
        ],
        response_format={"type": "json_object"},
    )
    result = json.loads(response.choices[0].message.content)
    severity = str(result.get("suggested_severity", "WARNING")).upper()
    if severity not in {"WARNING", "CRITICAL"}:
        severity = "WARNING"
    return {
        "is_true_alert": bool(result.get("is_true_alert", True)),
        "reasoning": str(result.get("reasoning", "Alert requires manual review."))[:800],
        "suggested_severity": severity,
    }


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        client.subscribe(TOPIC_PRELIMINARY, qos=1)
        mode = "Zhipu GLM" if ai_client else "local fallback rules"
        print(f"[AI] Connected to MQTT; verification mode: {mode}")
    else:
        print(f"[AI] MQTT connection failed: {reason_code}")


def on_message(client, userdata, message):
    try:
        payload = json.loads(message.payload.decode("utf-8"))
        result = ai_verification(payload)
        if not result["is_true_alert"]:
            print(f"[AI] Alert suppressed: {result['reasoning']}")
            return

        payload["ai_analysis"] = result["reasoning"]
        payload["severity"] = result["suggested_severity"]
        payload["analysis_source"] = "zhipu-glm" if ai_client else "local-rules"
        client.publish(
            TOPIC_CONFIRMED,
            json.dumps(payload, ensure_ascii=False),
            qos=1,
        )
        print(f"[AI] Confirmed {payload.get('type')}: {result['reasoning']}")
    except Exception as exc:
        print(f"[AI] Verification failed, forwarding for manual review: {exc}")
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            payload["ai_analysis"] = "Automated verification failed; manual review is required."
            payload["analysis_source"] = "fail-open"
            client.publish(TOPIC_CONFIRMED, json.dumps(payload, ensure_ascii=False), qos=1)
        except Exception as nested:
            print(f"[AI] Invalid preliminary payload: {nested}")


def main():
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    print(f"[AI] Listening on {TOPIC_PRELIMINARY} via {MQTT_BROKER}:{MQTT_PORT}")
    client.loop_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[AI] Stopped")
    except ConnectionRefusedError:
        print(f"[AI] MQTT broker unavailable at {MQTT_BROKER}:{MQTT_PORT}")
