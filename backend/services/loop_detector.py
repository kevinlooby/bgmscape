"""
Loop-point detection for game music tracks.

Strategy: find where the end of the track reappears earlier in the file.
Game audio is typically perfectly looped — the audio at `loop_end` is
byte-identical to the audio at `loop_start`. We exploit this by taking the
last N seconds as a reference and sliding it over the first ~85% of the
track to find the highest-correlation position.

Import is deferred so the rest of the app loads without librosa.
"""
from __future__ import annotations


def find_loop_point(file_path: str) -> dict:
    """
    Detect loop start and end points for a music track.

    Returns a dict with:
        loop_start   – seconds into the track where the loop begins
        loop_end     – seconds into the track where playback should jump back
        duration     – total duration of the file
        confidence   – normalised cross-correlation score (0–1)

    Raises ImportError if librosa is not installed.
    """
    try:
        import librosa          # noqa: PLC0415
        import numpy as np      # noqa: PLC0415
    except ImportError as exc:
        raise ImportError(
            "librosa is required for loop detection. "
            "Install it with: pip install librosa"
        ) from exc

    # Load at 11 025 Hz mono — fast enough, sufficient frequency resolution
    y, sr = librosa.load(file_path, sr=11_025, mono=True)
    duration = float(len(y) / sr)

    if duration < 4.0:
        return {
            "loop_start": 0.0,
            "loop_end": round(duration, 3),
            "duration": round(duration, 3),
            "confidence": 0.0,
        }

    # Reference window: last 4 s (or 12 % of the track, whichever is smaller)
    ref_dur = min(4.0, duration * 0.12)
    ref_samples = int(ref_dur * sr)
    ref = y[-ref_samples:].copy()

    # Z-score normalise so correlation is scale-independent
    ref -= ref.mean()
    ref_std = ref.std()
    if ref_std > 0:
        ref /= ref_std

    # Search window: skip the first 2 % (fade-in / jingle) and don't overlap
    # with the reference itself — search up to 85 % of total length
    min_start = max(int(0.02 * len(y)), 1)
    search_end = int(0.85 * len(y)) - ref_samples

    hop = max(int(0.04 * sr), 1)   # 40 ms resolution

    best_pos = min_start
    best_score = -2.0

    for i in range(min_start, search_end, hop):
        window = y[i : i + ref_samples].copy()
        window -= window.mean()
        w_std = window.std()
        if w_std == 0:
            continue
        window /= w_std
        score = float(np.dot(ref, window)) / ref_samples
        if score > best_score:
            best_score = score
            best_pos = i

    loop_start = best_pos / sr
    loop_end = (len(y) - ref_samples) / sr

    return {
        "loop_start": round(float(loop_start), 3),
        "loop_end": round(float(loop_end), 3),
        "duration": round(float(duration), 3),
        "confidence": round(float(max(0.0, min(1.0, best_score))), 3),
    }
