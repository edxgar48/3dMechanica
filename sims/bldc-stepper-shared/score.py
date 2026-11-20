"""Score for the BLDC-as-a-stepper film: a cool bed (Am9 chords, 84 bpm) at one level the whole way, a dry tick on
every full step the driver makes in full-step mode (so the steps are heard as well as seen), a quiet click on every
button press, a low swell under the load and current drags, a short whir under each move in microstep and FOC, and soft
air under every camera move.

    python run_sfx.py sims/bldc-stepper-shared/score.py

Every time comes from bldc-stepper-film/timeline.json, the script film.js plays. The command profile mirrors drive.js
(a chain of goto ramps on the same smootherstep) and the step size mirrors kin.js (60 electrical degrees, 7 pole
pairs): change them there, change them here.
"""

import os

from sfx.score_kit import airy, bed, chords, hz, motor, moves, thud
from sfx.synth import click

TIMELINE = "../bldc-stepper-film/timeline.json"
OUT = os.path.join(os.environ.get("MECHANICA3D_OUT", "3dmechanica-out"), "bldc-stepper-score.wav")
TARGET_LUFS = -14.0
SEED = 31

CHORDS = chords("Am9:A1 E2 G2 B2 C3/A0", "Fmaj7:F1 C2 E2 A2/F0", "Cmaj7:C2 G2 B2 E3/C1", "G6sus:G1 C2 D2 E2 A2/G0")
MOTIF = [(0.5, hz("E4")), (1.5, hz("C4")), (2.5, hz("B3"))]
PP = 7


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def cmd_at(tl, t):
    v = 0.0
    for e in moves(tl, "goto"):
        if e["t"] > t:
            break
        to, dur = e["goto"]
        v = v + (to - v) * smoother((t - e["t"]) / dur)
    return v


def mode_at(tl, t):
    m = "micro"
    for e in moves(tl, "mode"):
        if e["t"] <= t:
            m = e["mode"]
    return m


def full_steps(tl, dt=1 / 960):
    """Times the field jumps a full step (60° electrical) while the drive is in full-step mode."""
    out, t, last = [], 0.0, None
    while t < tl["duration"]:
        if mode_at(tl, t) == "full":
            k = round(PP * cmd_at(tl, t) / 60)
            if last is not None and k != last:
                out.append(t)
            last = k
        else:
            last = None
        t += dt
    return out


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 84, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3200)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.04)
    for t in full_steps(tl):
        mix.put(t, click(1700, 0.018), 0.05)
        mix.put(t, thud(90, 0.04, 0.3), 0.025)
    for t in (e["t"] for e in moves(tl, after=0)):
        mix.put(t, click(2400, 0.025), 0.05)
    for e in moves(tl, "goto"):
        if mode_at(tl, e["t"]) != "full":
            mix.put(e["t"], motor(e["goto"][1] + 0.4, 260, 620, 7), 0.012)
    for e in moves(tl, "load"):
        mix.put(e["t"], airy(e["load"][2] + 0.8, 160, 480, 0.7), 0.035)
    for e in moves(tl, "current"):
        mix.put(e["t"], airy(e["current"][2] + 0.6, 300, 900, 0.6), 0.025)
    for t in (e["t"] for e in moves(tl, "cam", after=0)):
        mix.put(t, airy(1.2, 700, 1500, 0.6), 0.018)
