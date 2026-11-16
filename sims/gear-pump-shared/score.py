"""Score for the gear pump film: a cool bed (Dm9 chords, 90 bpm) at one level the whole way, a soft low thud each time
the drive gear completes a turn (so the beat tightens when the operator opens the speed), a quiet click on every
button press, a motor that winds up under the speed drag, a low swell of pressure under the load drag, and a soft air
under every camera move.

    python run_sfx.py sims/gear-pump-shared/score.py

Every time comes from gear-pump-film/timeline.json, the script film.js plays. The shaft model mirrors film.js (rpmAt,
the 1/50 playback, the 4 degree start): change it there, change it here.
"""

import os

from sfx.score_kit import airy, bed, chords, hz, motor, moves, thud
from sfx.synth import click

TIMELINE = "../gear-pump-film/timeline.json"
OUT = os.path.join(os.environ.get("MECHANICA3D_OUT", "3dmechanica-out"), "gear-pump-score.wav")
TARGET_LUFS = -14.0
SEED = 23

CHORDS = chords("Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb1 F2 A2 D3/Bb0", "Fmaj7:F2 C3 E3 A3/F1", "C6sus:C2 F2 G2 A2 D3/C1")
MOTIF = [(0.5, hz("A4")), (1.5, hz("F4")), (2.5, hz("E4"))]
PLAY = 50
START_DEG = 4.0


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def turns(dur, rpm, dt=1 / 480):
    """Times the drive shaft completes a turn, from the same speed curve film.js integrates."""
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
    rpm = (ev[0]["t"], *ev[0]["rpm"]) if ev else (0.0, 1000.0, 1000.0, 1.0)
    left, right, low, drums = bed(dur, 90, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3400)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.04)
    for t in turns(dur - 0.3, rpm):
        mix.put(t, thud(58, 0.06, 0.35), 0.05)
    # a click on every button the operator presses
    for t in (e["t"] for e in moves(tl, after=0)):
        mix.put(t, click(2400, 0.025), 0.055)
    if ev:
        mix.put(rpm[0], motor(rpm[3] + 0.8, 150, 1100, 9), 0.02)
    for e in moves(tl, "load"):
        mix.put(e["t"], airy(e["load"][2] + 0.8, 180, 520, 0.7), 0.035)
    for t in (e["t"] for e in moves(tl, "cam", after=0)):
        mix.put(t, airy(1.2, 700, 1500, 0.6), 0.018)
