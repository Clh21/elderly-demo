"""
ECG Waveform Analysis for Samsung Galaxy Watch Data
====================================================
Algorithms used:
1. Butterworth bandpass filter (0.5-40 Hz) for noise removal
2. Automatic initial instability detection (variance-based onset detection)
3. Modified Pan-Tompkins R-peak detection (bandpass → derivative → squaring → moving window integration → adaptive threshold)
4. RR-interval based heart rate computation
5. Rhythm classification (sinus, tachycardia, bradycardia, irregular/suspected AF)
6. Signal quality index (SQI) based on SNR, clipping ratio, and baseline wander

References:
- Pan & Tompkins (1985) "A Real-Time QRS Detection Algorithm" IEEE Trans Biomed Eng
- Samsung Health Sensor SDK documentation (500 Hz single-lead ECG)
- Clifford et al. (2017) "AF Detection from a Short Single Lead ECG Recording" Computing in Cardiology
"""

import json
import glob
import os
import sys
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks, iirnotch
from scipy.stats import iqr
import warnings
warnings.filterwarnings("ignore")

# ─── Constants ───────────────────────────────────────────────────────
FS = 500              # Samsung Watch ECG sampling rate (Hz)
BANDPASS_LOW = 0.5    # Hz – removes baseline wander
BANDPASS_HIGH = 40.0  # Hz – removes high-frequency EMG noise / powerline
FILTER_ORDER = 4      # Butterworth filter order
INITIAL_SKIP_SEC = 2.0  # Minimum seconds to skip for electrode settling
QRS_BANDPASS_LOW = 5.0
QRS_BANDPASS_HIGH = 15.0
INTEGRATION_WINDOW_SEC = 0.15  # 150 ms moving window for Pan-Tompkins
REFRACTORY_SEC = 0.2           # 200 ms refractory period (max ~300 bpm)
RR_IRREGULARITY_THRESHOLD = 0.20  # 20% CV of RR intervals → irregular


def load_ecg(filepath):
    """Load ECG JSON file."""
    with open(filepath) as f:
        data = json.load(f)
    return data


def extract_mv_signal(samples):
    """Extract millivolt values from sample array [{mv, timestamp}, ...]."""
    return np.array([s["mv"] for s in samples], dtype=np.float64)


def estimate_sampling_rate(samples):
    """Estimate actual sampling rate from timestamps."""
    ts = np.array([s["timestamp"] for s in samples], dtype=np.float64)
    # Timestamps are in milliseconds; batched (multiple samples share same ts)
    unique_ts = np.unique(ts)
    if len(unique_ts) < 2:
        return FS
    total_duration_ms = unique_ts[-1] - unique_ts[0]
    total_duration_sec = total_duration_ms / 1000.0
    if total_duration_sec <= 0:
        return FS
    estimated_fs = len(samples) / total_duration_sec
    return estimated_fs


def butterworth_bandpass(signal, low, high, fs, order=FILTER_ORDER):
    """Apply zero-phase Butterworth bandpass filter."""
    nyq = fs / 2.0
    b, a = butter(order, [low / nyq, high / nyq], btype="band")
    return filtfilt(b, a, signal)


def detect_stable_onset(signal, fs, min_skip_sec=INITIAL_SKIP_SEC, window_sec=0.5):
    """
    Detect when the electrode contact stabilizes.
    Uses a rolling variance approach: the initial flat/saturated region
    has either zero variance or extreme values; stable ECG has moderate variance.
    Returns the sample index where stable signal begins.
    """
    min_skip = int(min_skip_sec * fs)
    window = int(window_sec * fs)

    # Compute rolling standard deviation
    n = len(signal)
    if n < min_skip + window:
        return min_skip

    stds = []
    step = window // 4
    for i in range(0, n - window, step):
        stds.append(np.std(signal[i:i + window]))
    stds = np.array(stds)

    if len(stds) == 0:
        return min_skip

    # Find the median std of the latter half (assumed stable)
    latter_half_stds = stds[len(stds) // 2:]
    if len(latter_half_stds) == 0:
        return min_skip
    median_std = np.median(latter_half_stds)

    # The onset is the first window where std is within 50-200% of median
    # and we are past min_skip
    min_skip_idx = min_skip // step
    for i in range(min_skip_idx, len(stds)):
        if 0.3 * median_std < stds[i] < 3.0 * median_std:
            return i * step

    return min_skip


def pan_tompkins_detect(signal, fs):
    """
    Modified Pan-Tompkins QRS detection.

    Steps:
    1. Bandpass filter (5-15 Hz) to isolate QRS energy
    2. Differentiation (emphasize slopes)
    3. Squaring (make all positive, emphasize large differences)
    4. Moving window integration (smooth QRS envelope)
    5. Adaptive thresholding with find_peaks
    """
    # Step 1: Bandpass 5-15 Hz
    filtered = butterworth_bandpass(signal, QRS_BANDPASS_LOW, QRS_BANDPASS_HIGH, fs, order=2)

    # Step 2: Differentiation
    diff = np.diff(filtered)
    diff = np.append(diff, 0)

    # Step 3: Squaring
    squared = diff ** 2

    # Step 4: Moving window integration
    win_size = int(INTEGRATION_WINDOW_SEC * fs)
    if win_size < 1:
        win_size = 1
    kernel = np.ones(win_size) / win_size
    integrated = np.convolve(squared, kernel, mode="same")

    # Step 5: Adaptive thresholding
    # Use a fraction of the signal max as the minimum peak height
    if np.max(integrated) == 0:
        return np.array([])

    # Minimum distance between peaks = refractory period
    min_distance = int(REFRACTORY_SEC * fs)

    # Adaptive threshold: use a percentile of the integrated signal
    threshold = 0.3 * np.mean(integrated[integrated > np.percentile(integrated, 70)])
    if threshold <= 0 or np.isnan(threshold):
        threshold = 0.1 * np.max(integrated)

    peaks, properties = find_peaks(
        integrated,
        height=threshold,
        distance=min_distance,
    )

    # Refine peaks by finding the actual R-peak (max in original filtered signal)
    # within ±50ms of each detected peak
    search_window = int(0.05 * fs)
    refined = []
    for p in peaks:
        lo = max(0, p - search_window)
        hi = min(len(signal), p + search_window)
        local_max = lo + np.argmax(np.abs(signal[lo:hi]))
        refined.append(local_max)

    return np.array(refined)


def compute_rr_intervals(r_peaks, fs):
    """Compute RR intervals in seconds."""
    if len(r_peaks) < 2:
        return np.array([])
    return np.diff(r_peaks) / fs


def compute_heart_rate(rr_intervals):
    """Compute heart rate statistics from RR intervals."""
    if len(rr_intervals) == 0:
        return {"mean_hr": 0, "std_hr": 0, "min_hr": 0, "max_hr": 0}
    # Remove extreme outliers (physiologically impossible)
    valid = rr_intervals[(rr_intervals > 0.2) & (rr_intervals < 2.5)]
    if len(valid) == 0:
        valid = rr_intervals
    hrs = 60.0 / valid
    return {
        "mean_hr": float(np.mean(hrs)),
        "std_hr": float(np.std(hrs)),
        "min_hr": float(np.min(hrs)),
        "max_hr": float(np.max(hrs)),
        "median_hr": float(np.median(hrs)),
        "num_beats": len(valid) + 1,
    }


def classify_rhythm(rr_intervals, hr_stats):
    """
    Classify heart rhythm based on:
    - Average HR: bradycardia (<60), normal (60-100), tachycardia (>100)
    - RR variability: coefficient of variation > 20% suggests irregularity
    - pNN50 and RMSSD for HRV analysis
    """
    mean_hr = hr_stats["mean_hr"]
    if mean_hr == 0:
        return "Unclassifiable", {}

    valid_rr = rr_intervals[(rr_intervals > 0.2) & (rr_intervals < 2.5)]
    if len(valid_rr) < 3:
        return "Insufficient beats for classification", {}

    # Coefficient of variation
    cv = np.std(valid_rr) / np.mean(valid_rr) if np.mean(valid_rr) > 0 else 0

    # RMSSD: root mean square of successive differences
    successive_diff = np.diff(valid_rr)
    rmssd = np.sqrt(np.mean(successive_diff ** 2)) * 1000  # in ms

    # pNN50: percentage of successive RR differences > 50ms
    pnn50 = np.mean(np.abs(successive_diff) > 0.05) * 100

    hrv_metrics = {
        "cv_rr": float(cv),
        "rmssd_ms": float(rmssd),
        "pnn50_pct": float(pnn50),
        "mean_rr_sec": float(np.mean(valid_rr)),
        "std_rr_sec": float(np.std(valid_rr)),
    }

    # Classification logic
    is_irregular = cv > RR_IRREGULARITY_THRESHOLD

    if is_irregular and pnn50 > 30:
        rhythm = "Irregular rhythm (possible atrial fibrillation)"
    elif is_irregular:
        rhythm = "Irregular rhythm"
    elif mean_hr > 100:
        rhythm = "Sinus tachycardia"
    elif mean_hr < 60:
        rhythm = "Sinus bradycardia"
    else:
        rhythm = "Normal sinus rhythm"

    return rhythm, hrv_metrics


def signal_quality_index(raw_signal, filtered_signal, fs):
    """
    Compute signal quality metrics:
    - SNR: in-band signal power vs high-frequency noise (> 40 Hz)
    - Kurtosis-based SQI (ECG signals have high kurtosis due to QRS peaks)
    - Clipping ratio (% samples at saturation)
    - Baseline wander magnitude
    """
    from scipy.stats import kurtosis as sp_kurtosis

    # SNR: compare bandpass-filtered signal to high-frequency noise residual
    # High-freq noise = raw - lowpass(40Hz)(raw)
    nyq = fs / 2.0
    b_lp, a_lp = butter(4, 40.0 / nyq, btype="low")
    low_passed = filtfilt(b_lp, a_lp, raw_signal)
    hf_noise = raw_signal - low_passed
    sig_power = np.mean(filtered_signal ** 2)
    hf_noise_power = np.mean(hf_noise ** 2)
    snr_db = 10 * np.log10(sig_power / hf_noise_power) if hf_noise_power > 0 else float("inf")

    # Kurtosis SQI: clean ECG typically has kurtosis > 5 (sharp QRS peaks)
    kurt = float(sp_kurtosis(filtered_signal, fisher=True))

    # Clipping: detect saturation (values at min/max rails)
    mn, mx = np.min(raw_signal), np.max(raw_signal)
    range_val = mx - mn
    clip_threshold = 0.01 * range_val if range_val > 0 else 1.0
    clipped = np.sum((raw_signal < mn + clip_threshold) | (raw_signal > mx - clip_threshold))
    clip_ratio = clipped / len(raw_signal)

    # Baseline wander: magnitude of the low-frequency component (< 0.5 Hz)
    b_low, a_low = butter(2, 0.5 / nyq, btype="low")
    baseline = filtfilt(b_low, a_low, raw_signal)
    wander_magnitude = np.std(baseline)

    # Overall quality assessment
    quality = "Good"
    if snr_db < 5:
        quality = "Poor"
    elif snr_db < 10:
        quality = "Fair"
    if clip_ratio > 0.05:
        quality = "Poor (significant clipping)"
    if kurt < 3:
        if quality == "Good":
            quality = "Fair (low kurtosis – weak QRS)"
    if kurt > 5 and snr_db > 10:
        quality = "Good"

    return {
        "snr_db": float(snr_db),
        "kurtosis": kurt,
        "clipping_ratio": float(clip_ratio),
        "baseline_wander_std_mv": float(wander_magnitude),
        "quality_assessment": quality,
    }


def analyze_single_record(filepath):
    """Full analysis pipeline for one ECG record."""
    data = load_ecg(filepath)
    record_id = data["id"]
    samples = data["samples"]

    print(f"\n{'='*70}")
    print(f"  ECG Record #{record_id}")
    print(f"  Recorded: {data['recorded_at']}")
    print(f"  Device result: HR={data['ecg_heart_rate']} bpm, '{data['ecg_result']}'")
    print(f"  Lead-off: {data['lead_off']}")
    print(f"{'='*70}")

    # Extract signal
    raw_mv = extract_mv_signal(samples)
    n_total = len(raw_mv)
    actual_fs = estimate_sampling_rate(samples)
    duration_sec = n_total / FS
    print(f"\n  Total samples: {n_total}")
    print(f"  Estimated sampling rate: {actual_fs:.1f} Hz")
    print(f"  Duration: {duration_sec:.1f} sec")

    # Detect stable onset (skip initial electrode settling)
    onset_idx = detect_stable_onset(raw_mv, FS)
    onset_sec = onset_idx / FS
    print(f"\n  Electrode stabilization detected at: {onset_sec:.2f} sec (sample {onset_idx})")
    print(f"  Usable signal: {(n_total - onset_idx) / FS:.1f} sec")

    # Trim to stable portion
    stable_signal = raw_mv[onset_idx:]
    if len(stable_signal) < FS * 3:
        print("  ⚠ WARNING: Less than 3 seconds of stable signal. Analysis may be unreliable.")

    # Bandpass filter
    filtered = butterworth_bandpass(stable_signal, BANDPASS_LOW, BANDPASS_HIGH, FS)

    # Signal quality
    sqi = signal_quality_index(stable_signal, filtered, FS)
    print(f"\n  Signal Quality:")
    print(f"    SNR: {sqi['snr_db']:.1f} dB")
    print(f"    Kurtosis: {sqi['kurtosis']:.1f} (>5 = sharp QRS peaks)")
    print(f"    Clipping ratio: {sqi['clipping_ratio']*100:.1f}%")
    print(f"    Baseline wander: {sqi['baseline_wander_std_mv']:.2f} mV")
    print(f"    Overall quality: {sqi['quality_assessment']}")

    # R-peak detection (Pan-Tompkins)
    r_peaks = pan_tompkins_detect(filtered, FS)
    print(f"\n  R-peak Detection (Modified Pan-Tompkins):")
    print(f"    R-peaks found: {len(r_peaks)}")

    # RR intervals & heart rate
    rr_intervals = compute_rr_intervals(r_peaks, FS)
    hr_stats = compute_heart_rate(rr_intervals)
    print(f"\n  Heart Rate Analysis:")
    print(f"    Mean HR:   {hr_stats['mean_hr']:.1f} bpm")
    print(f"    Median HR: {hr_stats.get('median_hr', 0):.1f} bpm")
    print(f"    Std HR:    {hr_stats['std_hr']:.1f} bpm")
    print(f"    Range:     {hr_stats['min_hr']:.1f} – {hr_stats['max_hr']:.1f} bpm")
    print(f"    Beats:     {hr_stats.get('num_beats', 0)}")

    # Rhythm classification
    rhythm, hrv = classify_rhythm(rr_intervals, hr_stats)
    print(f"\n  Rhythm Classification: {rhythm}")
    if hrv:
        print(f"    CV(RR):   {hrv['cv_rr']*100:.1f}%")
        print(f"    RMSSD:    {hrv['rmssd_ms']:.1f} ms")
        print(f"    pNN50:    {hrv['pnn50_pct']:.1f}%")
        print(f"    Mean RR:  {hrv['mean_rr_sec']*1000:.0f} ms")

    # Validity assessment
    print(f"\n  Validity Assessment:")
    is_valid = True
    reasons = []
    if sqi["snr_db"] < 5:
        is_valid = False
        reasons.append("Low SNR (< 5 dB)")
    if sqi["clipping_ratio"] > 0.1:
        is_valid = False
        reasons.append("High clipping (> 10%)")
    if len(r_peaks) < 5:
        is_valid = False
        reasons.append("Too few R-peaks detected (< 5)")
    if hr_stats["mean_hr"] > 200:
        is_valid = False
        reasons.append("Physiologically implausible HR (> 200 bpm)")
    if hr_stats["mean_hr"] < 30 and hr_stats["mean_hr"] > 0:
        is_valid = False
        reasons.append("Physiologically implausible HR (< 30 bpm)")

    if is_valid:
        print(f"    ✓ ECG data appears VALID")
    else:
        print(f"    ✗ ECG data appears INVALID / UNRELIABLE")
        for r in reasons:
            print(f"      - {r}")

    # Compare with device result
    print(f"\n  Comparison with Samsung Watch Analysis:")
    print(f"    Watch HR:  {data['ecg_heart_rate']} bpm")
    print(f"    Our HR:    {hr_stats['mean_hr']:.1f} bpm")
    diff = abs(hr_stats['mean_hr'] - (data['ecg_heart_rate'] or 0))
    print(f"    Diff:      {diff:.1f} bpm")
    print(f"    Watch:     '{data['ecg_result']}'")
    print(f"    Ours:      '{rhythm}'")

    return {
        "id": record_id,
        "recorded_at": data["recorded_at"],
        "device_hr": data["ecg_heart_rate"],
        "device_result": data["ecg_result"],
        "our_hr": hr_stats["mean_hr"],
        "our_rhythm": rhythm,
        "is_valid": is_valid,
        "sqi": sqi,
        "hr_stats": hr_stats,
        "hrv": hrv,
        "onset_sec": onset_sec,
        "n_peaks": len(r_peaks),
    }


def generate_waveform_plots(filepath, output_dir="."):
    """Generate waveform visualization for a record."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  (matplotlib not available, skipping plots)")
        return

    data = load_ecg(filepath)
    record_id = data["id"]
    raw_mv = extract_mv_signal(data["samples"])

    onset_idx = detect_stable_onset(raw_mv, FS)
    stable = raw_mv[onset_idx:]
    filtered = butterworth_bandpass(stable, BANDPASS_LOW, BANDPASS_HIGH, FS)
    r_peaks = pan_tompkins_detect(filtered, FS)

    time_axis = np.arange(len(stable)) / FS

    fig, axes = plt.subplots(3, 1, figsize=(16, 10), sharex=True)
    fig.suptitle(f"ECG Record #{record_id}  ({data['recorded_at']})", fontsize=14)

    # Raw signal
    axes[0].plot(time_axis, stable, "b-", linewidth=0.3, alpha=0.7)
    axes[0].set_ylabel("Raw (mV)")
    axes[0].set_title("Raw ECG Signal (after electrode settling)")
    axes[0].grid(True, alpha=0.3)

    # Filtered signal with R-peaks
    axes[1].plot(time_axis, filtered, "b-", linewidth=0.4)
    if len(r_peaks) > 0:
        axes[1].plot(r_peaks / FS, filtered[r_peaks], "rv", markersize=6, label="R-peaks")
    axes[1].set_ylabel("Filtered (mV)")
    axes[1].set_title(f"Bandpass Filtered (0.5-40 Hz) + R-peaks ({len(r_peaks)} detected)")
    axes[1].legend(loc="upper right")
    axes[1].grid(True, alpha=0.3)

    # Zoomed view (5 seconds)
    zoom_start = 0
    zoom_end = min(int(5 * FS), len(filtered))
    t_zoom = np.arange(zoom_start, zoom_end) / FS
    axes[2].plot(t_zoom, filtered[zoom_start:zoom_end], "b-", linewidth=0.6)
    zoom_peaks = r_peaks[(r_peaks >= zoom_start) & (r_peaks < zoom_end)]
    if len(zoom_peaks) > 0:
        axes[2].plot(zoom_peaks / FS, filtered[zoom_peaks], "rv", markersize=8, label="R-peaks")
    axes[2].set_ylabel("Filtered (mV)")
    axes[2].set_xlabel("Time (seconds)")
    axes[2].set_title("Zoomed View (first 5 sec of stable signal)")
    axes[2].legend(loc="upper right")
    axes[2].grid(True, alpha=0.3)

    plt.tight_layout()
    outpath = os.path.join(output_dir, f"ecg_plot_{record_id}.png")
    plt.savefig(outpath, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Plot saved: {outpath}")


def main():
    # Find all ECG JSON files
    files = sorted(glob.glob("ecg_*.json"))
    if not files:
        print("No ECG JSON files found in current directory.")
        sys.exit(1)

    print(f"Found {len(files)} ECG records to analyze\n")

    all_results = []
    for fpath in files:
        result = analyze_single_record(fpath)
        all_results.append(result)
        generate_waveform_plots(fpath)

    # Summary table
    print(f"\n\n{'='*70}")
    print(f"  SUMMARY TABLE")
    print(f"{'='*70}")
    print(f"{'ID':>6} | {'Time':>19} | {'Watch HR':>8} | {'Our HR':>8} | {'Watch Result':>28} | {'Our Rhythm':>35} | {'Valid':>5} | {'SNR':>6}")
    print(f"{'-'*6}-+-{'-'*19}-+-{'-'*8}-+-{'-'*8}-+-{'-'*28}-+-{'-'*35}-+-{'-'*5}-+-{'-'*6}")
    for r in all_results:
        print(f"{r['id']:>6} | {r['recorded_at']:>19} | {r['device_hr']:>8.1f} | {r['our_hr']:>8.1f} | "
              f"{r['device_result']:>28} | {r['our_rhythm']:>35} | {'Yes' if r['is_valid'] else 'No':>5} | {r['sqi']['snr_db']:>5.1f}")

    # Save results
    with open("analysis_results.json", "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nResults saved to analysis_results.json")


if __name__ == "__main__":
    main()
