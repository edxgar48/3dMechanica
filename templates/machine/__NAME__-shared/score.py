"""Score for the __TITLE__ film: a light bed (Am9 chords, 92 bpm) at one level the whole way, a soft thud each time the
piston reaches top dead centre (so the beat tightens when the speed rises), a quiet click on every button the operator
presses and a soft air under every camera move.

    python <SKILL_DIR>/run_sfx.py __NAME__-shared/score.py

Every time comes from __NAME__-film/timeline.json, the script film.js plays. The crank model mirrors film.js (rpmAt,
the 1/20 playback, the 30 degree start): change it there, change it here.
"""

import os

from sfx.score_kit import airy, bed, chords, hz, moves, thud
from sfx.synth import click

TIMELINE = "../__NAME__-film/timeline.json"
OUT = os.path.join(os.environ.get("MECHANICA3D_OUT", "3dmechanica-out"), "__NAME__-score.wav")
TARGET_LUFS = -14.0
SEED = 7

CHORDS = chords("Am9:A2 E3 G3 B3 C4/A1", "Fmaj7:F2 C3 E3 A3/F1", "Cmaj7:C3 E3 G3 B3/C2", "G6:G2 D3 E3 B3/G1")
MOTIF = [(0.5, hz("E5")), (1.5, hz("C5")), (2.5, hz("B4"))]
PLAY = 20
START_DEG = 30.0


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def top_dead_centres(dur, rpm, dt=1 / 480):
    """Times the crank passes 0 degrees, from the same speed curve film.js integrates."""
    t0, a, b, ramp = rpm
    out, th, t, nxt = [], START_DEG, 0.0, 360.0
    while t < dur:
        th += (a + (b - a) * smoother((t - t0) / ramp)) / 60 * 360 * dt / PLAY
        if th >= nxt:
            out.append(t)
            nxt += 360
        t += dt
    return out


def score(mix, tl):
    dur = tl["duration"]
    ev = moves(tl, "rpm")
    rpm = (ev[0]["t"], *ev[0]["rpm"]) if ev else (0.0, 600.0, 600.0, 1.0)
    left, right, low, drums = bed(dur, 92, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3600)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.04)
    for t in top_dead_centres(dur - 0.3, rpm):
        mix.put(t, thud(62, 0.05, 0.3), 0.05)
    # a click on every button the operator presses
    for t in (e["t"] for e in moves(tl, after=0)):
        mix.put(t, click(2400, 0.025), 0.055)
    if ev:
        mix.put(rpm[0], airy(rpm[3] + 0.6, 400, 1600, 0.6), 0.03)
    for t in (e["t"] for e in moves(tl, "cam", after=0)):
        mix.put(t, airy(1.2, 700, 1500, 0.6), 0.018)
