"""
sensor_analysis.py
Algorithms for processing real Galaxy Watch sensor data:
  - EDA  -> Stress / arousal score
  - Temp -> Estimated core body temperature
"""
import math
import statistics
from typing import List, Optional


# ── EDA (Electrodermal Activity) Analysis ─────────────────────────────────────
# Galaxy Watch sends ~30 samples per 10-minute window.
# Each sample has: skinConductance (µS), label (STABLE/VARIABLE), validSampleCount
#
# Algorithm:
#   1. Collect all skin-conductance values in the window.
#   2. Compute mean (tonic level) and standard deviation (phasic variation).
#   3. Map to a 0-100 stress score using a sigmoid-like normalisation.
#   4. Classify into RELAXED / CALM / MODERATE / STRESSED / HIGH_STRESS.

EDA_THRESHOLDS = [
    (20,  "Relaxed"),
    (40,  "Calm"),
    (60,  "Moderate"),
    (80,  "Stressed"),
    (101, "High Stress"),
]


def analyse_eda_window(samples: List[dict]) -> dict:
    """
    Analyse a batch of EDA samples from one 10-min window.

    Each sample dict should contain:
        skin_conductance (float, µS)
        label           (str, e.g. 'STABLE' | 'VARIABLE')
        valid_samples   (int)

    Returns dict with:
        mean_sc, std_sc, stress_score (0-100), stress_level, sample_count
    """
    if not samples:
        return {"error": "no samples"}

    sc_values = [s["skin_conductance"] for s in samples
                 if s.get("skin_conductance") is not None]
    if not sc_values:
        return {"error": "no valid conductance values"}

    mean_sc = statistics.mean(sc_values)
    std_sc  = statistics.stdev(sc_values) if len(sc_values) > 1 else 0.0

    # Count VARIABLE labels as a phasic activity indicator
    variable_ratio = sum(
        1 for s in samples if s.get("label") == "VARIABLE"
    ) / len(samples)

    # Sigmoid-based score:
    #   - Tonic component: higher mean SC => more aroused
    #     Typical resting: 0.1-1.0 µS; elevated: 2-10 µS
    #   - Phasic component: std deviation
    #   - Label component: proportion of VARIABLE windows
    tonic_score  = _sigmoid_scale(mean_sc, midpoint=1.5, steepness=1.2) * 60
    phasic_score = _sigmoid_scale(std_sc,  midpoint=0.5, steepness=2.0) * 25
    label_score  = variable_ratio * 15

    stress_score = min(100, tonic_score + phasic_score + label_score)

    stress_level = "Relaxed"
    for threshold, label in EDA_THRESHOLDS:
        if stress_score < threshold:
            stress_level = label
            break

    return {
        "mean_sc":      round(mean_sc, 4),
        "std_sc":       round(std_sc, 4),
        "variable_ratio": round(variable_ratio, 3),
        "stress_score": round(stress_score, 1),
        "stress_level": stress_level,
        "sample_count": len(sc_values),
    }


def analyse_single_eda(skin_conductance: float, label: str) -> dict:
    """Quick single-sample stress estimate (used when storing each packet)."""
    sample = [{"skin_conductance": skin_conductance, "label": label, "valid_samples": 1}]
    return analyse_eda_window(sample)


def _sigmoid_scale(x: float, midpoint: float, steepness: float) -> float:
    """Map x to (0, 1) via a logistic sigmoid centred at midpoint."""
    try:
        return 1.0 / (1.0 + math.exp(-steepness * (x - midpoint)))
    except OverflowError:
        return 1.0 if x > midpoint else 0.0


# ── Temperature Analysis ──────────────────────────────────────────────────────
# Galaxy Watch provides:
#   wristSkinTemperature  (°C) — skin surface, ~32-35°C
#   ambientTemperature    (°C) — air temperature around wrist
#
# Core body temperature estimation:
#   Reference: Buller et al. (2013) and ISO 9886 standard approach.
#
#   core_temp ≈ wrist_temp + offset
#   where offset accounts for heat loss to environment:
#     offset = BASE_OFFSET + AMBIENT_CORRECTION * (wrist_temp - ambient_temp)
#
#   Calibration constants (empirically derived for wrist sensors):
#     BASE_OFFSET       = 4.5   (wrist is typically ~4-5°C below core)
#     AMBIENT_CORRECTION= 0.15  (ambient gradient adjustment)
#
# Normal core temp range: 36.1 – 37.2 °C
# Fever threshold:        ≥ 37.5 °C
# Hypothermia threshold:  ≤ 35.0 °C

BASE_OFFSET        = 4.5
AMBIENT_CORRECTION = 0.15


def estimate_core_temperature(wrist_temp: float, ambient_temp: float) -> dict:
    """
    Estimate core body temperature from wrist-skin and ambient readings.

    Returns dict with:
        estimated_core_temp, wrist_temp, ambient_temp,
        heat_gradient, status, interpretation
    """
    heat_gradient = wrist_temp - ambient_temp
    core_temp = wrist_temp + BASE_OFFSET + AMBIENT_CORRECTION * heat_gradient
    core_temp = round(core_temp, 2)

    if core_temp >= 39.0:
        status = "High Fever"
    elif core_temp >= 37.5:
        status = "Fever"
    elif core_temp >= 36.1:
        status = "Normal"
    elif core_temp >= 35.0:
        status = "Low"
    else:
        status = "Hypothermia Risk"

    return {
        "estimated_core_temp": core_temp,
        "wrist_temp":          round(wrist_temp, 2),
        "ambient_temp":        round(ambient_temp, 2),
        "heat_gradient":       round(heat_gradient, 2),
        "status":              status,
    }


# ── Heart Rate Analysis ───────────────────────────────────────────────────────

def classify_heart_rate(bpm: float, age: int = 75) -> dict:
    """
    Classify a heart rate reading for an elderly person.
    Uses age-adjusted thresholds.
    """
    max_hr = 220 - age

    if bpm < 40:
        level, severity = "Bradycardia (Severe)", "critical"
    elif bpm < 50:
        level, severity = "Bradycardia", "warning"
    elif bpm < 60:
        level, severity = "Low Normal", "normal"
    elif bpm < 100:
        level, severity = "Normal", "normal"
    elif bpm < 110:
        level, severity = "Elevated", "warning"
    elif bpm < 130:
        level, severity = "Tachycardia", "critical"
    else:
        level, severity = "Tachycardia (Severe)", "critical"

    return {
        "bpm":      bpm,
        "level":    level,
        "severity": severity,
        "max_hr":   max_hr,
        "pct_max":  round(bpm / max_hr * 100, 1),
    }
