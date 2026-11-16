"""Score for the exoskeleton film: a calm bed (Em9 chords, 84 bpm) at one level the whole way, a soft footfall on every
heel strike of either leg (so the steps quicken when the operator opens the speed), a quiet click on every button
press, the actuators' whine under the speed and assistance drags, air rushing out as the parts explode and back in as
they close, and a soft air under every camera move.

    python run_sfx.py sims/exo-legs-shared/score.py

Every time comes from exo-legs-film/timeline.json, the script film.js plays. The gait model mirrors film.js and kin.js
(speedAt, explodeAt, the cadence from the stride model): change it there, change it here.
"""

import os

from sfx.score_kit import airy, bed, chords, hz, motor, moves, thud
from sfx.synth import click

TIMELINE = "../exo-legs-film/timeline.json"
OUT = os.path.join(os.environ.get("MECHANICA3D_OUT", "3dmechanica-out"), "exo-legs-score.wav")
TARGET_LUFS = -14.0
SEED = 31

CHORDS = chords("Em9:E2 B2 D3 F#3 G3/E1", "Cmaj7:C2 G2 B2 E3/C1", "Gmaj7:G2 D3 F#3 B3/G1", "D6sus:D2 G2 A2 B2 E3/D1")
MOTIF = [(0.5, hz("B4")), (1.5, hz("G4")), (2.5, hz("F#4"))]


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def ss(a, b, t):
    return smoother((t - a) / (b - a))


def heel_strikes(tl, dt=1 / 480):
    """Times either foot lands: the left leg's phase crossing a whole number, the right leg's a half."""
    sp = moves(tl, "speed")
    speed = (sp[0]["t"], *sp[0]["speed"]) if sp else (0.0, 0.4, 0.4, 1.0)
    modes = moves(tl, "mode")

    def v_at(t):
        t0, a, b, d = speed
        return a + (b - a) * ss(t0, t0 + d, t)

    def explode_at(t):
        e = 0.0
        for m in modes:
            e += ((1.0 if m["mode"] == "explode" else 0.0) - e) * ss(m["t"], m["t"] + 1.4, t)
        return e

    out, ph, t, nxt = [], 0.0, 0.0, 0.5
    while t < tl["duration"]:
        v = v_at(t + dt / 2)
        stride = 0.6 + 0.55 * v
        ph += (v / stride) * dt * (1 - explode_at(t + dt / 2))
        if ph >= nxt:
            out.append(t)
            nxt += 0.5
        t += dt
    return out


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 84, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3400)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.035)
    for t in heel_strikes(tl):
        if t < dur - 0.3:
            mix.put(t, thud(90, 0.04, 0.3), 0.06)
    # a click on every button the operator presses
    for t in (e["t"] for e in moves(tl, after=0)):
        mix.put(t, click(2400, 0.025), 0.055)
    for e in moves(tl, "speed", "assist"):
        d = (e.get("speed") or e.get("assist"))[2]
        mix.put(e["t"], motor(d + 0.8, 210, 1500, 11), 0.018)
    for e in moves(tl, "mode"):
        if e["mode"] == "explode":
            mix.put(e["t"], airy(1.6, 500, 2200, 0.5), 0.04)
        else:
            mix.put(e["t"], airy(1.6, 2000, 450, 0.5), 0.035)
    for t in (e["t"] for e in moves(tl, "cam", after=0)):
        mix.put(t, airy(1.2, 700, 1500, 0.6), 0.018)
