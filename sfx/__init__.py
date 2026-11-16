"""Procedural sound for the machines' films. Pure Python stdlib, 48 kHz stereo.

    python run_sfx.py sims/v8-shared/score.py   render a score (a cue sheet) to WAV
    python run_sfx.py --list                    list the sound generators
"""

from .mix import Mix
from .synth import SR

__all__ = ["Mix", "SR"]
