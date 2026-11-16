"""Score for the STRANDBEEST SB-10 console film: a warm bed (Fmaj9 chords, 88 bpm) at one level the whole way, wind
under it that rises when the operator opens the slider, a soft sand thud on every touchdown of leg 01F, a quiet click
on every button press and a typewriter tick for each of the thirteen letters on the isolated leg.

    python run_sfx.py sims/strandbeest-shared/score.py

Times from strandbeest-film/timeline.json (the SCRIPT film.js plays and the label cadence); the wind and crank model
mirrors film.js.
"""

import math
import os

from sfx.score_kit import airy, bed, chords, hz, moves, thud
from sfx.synth import click

TIMELINE = "../strandbeest-film/timeline.json"
OUT = os.path.join(os.environ.get("MECHANICA3D_OUT", "3dmechanica-out"), "strandbeest-score.wav")
TARGET_LUFS = -14.0
SEED = 11

CHORDS = chords("Fmaj9:F2 C3 E3 G3 A3/F1", "Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb1 F2 A2 D3/Bb0", "C6sus:C2 F2 G2 A2 D3/C1")
MOTIF = [(0.5, hz("C5")), (1.5, hz("A4")), (2.5, hz("G4"))]

N_LABELS = 13  # len(LABELS) in strandbeest-shared/console.js: the letters on the isolated leg


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def wind_at(t, wind):
    t0, w0, w1, dur = wind
    return w0 + (w1 - w0) * smoother((t - t0) / dur) + 0.35 * math.sin(t * 0.9) + 0.2 * math.sin(t * 2.3 + 1)


def rps_at(w):
    return 0.42 * (max(0.5, w) / 6) ** 0.75


def theta_table(dur, wind, dt=1 / 240):
    th, out, t = 0.0, [], 0.0
    while t <= dur:
        out.append((t, th))
        th += rps_at(wind_at(t + dt / 2, wind)) * 2 * math.pi * dt
        t += dt
    return out


def touchdowns(dur, wind):
    """Leg 01F lands where its crank angle crosses the start of the flat stretch (290° on Jansen's path)."""
    land = math.radians(290)
    out = []
    prev = None
    for t, th in theta_table(dur, wind):
        k = math.floor((th - land) / (2 * math.pi))
        if prev is not None and k != prev:
            out.append(t)
        prev = k
    return out


def score(mix, tl):
    dur = tl["duration"]
    ev = moves(tl, "wind")[0]
    wind = (ev["t"], *ev["wind"])  # (start, from m/s, to m/s, ramp seconds)
    iso = moves(tl, "iso")[0]["t"]
    cad = tl["labels"]
    labels = [iso + cad["after"] + i * cad["every"] for i in range(N_LABELS)]
    left, right, low, drums = bed(dur, 88, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3400)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.13)
    mix.put(0, drums, 0.045)

    # wind: a low steady breath, a gust swelling up the slider drag, a stronger bed after it
    mix.put(0, airy(wind[0] + 0.4, 380, 520, 0.5), 0.012)
    mix.put(wind[0], airy(wind[3] + 0.8, 500, 1900, 0.6), 0.04)
    mix.put(wind[0] + wind[3], airy(dur - wind[0] - wind[3], 650, 820, 0.5), 0.02)

    for t in touchdowns(dur, wind):
        if t < dur - 0.4:
            mix.put(t, thud(105, 0.035, 0.25), 0.05)
    # a click on every button the operator presses
    for t in (e["t"] for e in moves(tl, after=0)):
        mix.put(t, click(2400, 0.025), 0.055)
    for t in labels:
        mix.put(t, click(3400, 0.012), 0.03)
    # a soft air 0.1 s into every camera move after the leg is isolated
    for t in (round(e["t"] + 0.1, 6) for e in moves(tl, "view", after=iso)):
        mix.put(t, airy(1.1, 700, 1600, 0.6), 0.02)
