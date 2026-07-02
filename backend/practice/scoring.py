"""Server-side scoring math — the single source of truth for score computation.

The client reports component metrics (timing_accuracy, pitch_accuracy,
bpm_achieved); the server derives accuracy and score itself rather than
trusting client math.
"""


def compute_accuracy(timing_accuracy: float, pitch_accuracy: float) -> float:
    """Average of timing and pitch accuracy, each in [0, 1]."""
    for value in (timing_accuracy, pitch_accuracy):
        if not 0.0 <= value <= 1.0:
            raise ValueError(f"accuracy component out of range: {value}")
    return (timing_accuracy + pitch_accuracy) / 2


def compute_score(accuracy: float, bpm_achieved: float) -> float:
    """score = accuracy * bpm_achieved — clean playing multiplied by speed."""
    if bpm_achieved < 0:
        raise ValueError(f"bpm_achieved must be non-negative: {bpm_achieved}")
    return round(accuracy * bpm_achieved, 2)
