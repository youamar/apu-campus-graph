"""Procedural cinematic tech-trailer score, 120 BPM, locked to the promo scene timeline.
Pure numpy/scipy synthesis (no samples, no licensed music). Writes music.wav (48 kHz stereo, 24-bit-ish float->int16).
All cue times go through timeline.shift() so AI shots (AI1_DUR / AI2_DUR env) move the score with the picture."""
import numpy as np, wave
from scipy.signal import butter, sosfilt, sosfilt_zi, fftconvolve
from timeline import shift, TOTAL, AI1, AI2

SR = 48000
BEAT = 0.5          # 120 BPM
N = int(TOTAL * SR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
REV_L = np.zeros(N); REV_R = np.zeros(N)   # reverb send bus

# ---- section boundaries (shifted) ----
T_TURN = 13.8 + AI1            # end of stats; AI2 (constellation) sits inside "the turn"
T_DROP = shift(21.8)
T_END = shift(72.9)
CARDS = [shift(t) for t in (27.4, 34.8, 42.4, 52.0, 61.4, 66.4)]
TABS = [shift(t) for t in (2.4, 2.7, 3.15, 3.45, 3.75)]
SLAMS = [shift(t) for t in (6.05, 7.95, 9.95, 11.75)]   # synced to the stat flash frames

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)
def tt(n): return np.arange(n) / SR
def sos(kind, f, order=2):
    f = np.clip(np.atleast_1d(f), 20, SR / 2 - 100)
    return butter(order, f if len(f) > 1 else f[0], btype=kind, fs=SR, output="sos")
def filt(x, kind, f, order=2): return sosfilt(sos(kind, f, order), x)

def sweep_lp(x, f0, f1, block=1024, order=2, curve="exp"):
    """Time-varying lowpass via block-wise biquads with carried state."""
    out = np.empty_like(x); nb = int(np.ceil(len(x) / block)); zi = None
    for b in range(nb):
        a = b / max(1, nb - 1)
        f = f0 * (f1 / f0) ** a if curve == "exp" else f0 + (f1 - f0) * a
        s = sos("low", f, order)
        if zi is None: zi = sosfilt_zi(s) * 0
        seg = x[b * block:(b + 1) * block]
        out[b * block:(b + 1) * block], zi = sosfilt(s, seg, zi=zi)
    return out

def put(t0, sig, gain=1.0, pan=0.0, rev=0.0):
    """Mix mono or (2,n) signal at time t0 with constant-power pan and reverb send."""
    s = int(round(t0 * SR))
    if s >= N: return
    if sig.ndim == 1:
        l = sig * np.cos((pan + 1) * np.pi / 4); r = sig * np.sin((pan + 1) * np.pi / 4)
    else:
        l, r = sig
    if s < 0: l, r, s = l[-s:], r[-s:], 0
    n = min(len(l), N - s)
    L[s:s + n] += gain * l[:n]; R[s:s + n] += gain * r[:n]
    if rev:
        REV_L[s:s + n] += rev * gain * l[:n]; REV_R[s:s + n] += rev * gain * r[:n]

def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    t = tt(n); dur = n / SR
    env = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return env * rel

def supersaw(freqs, dur, voices=7, detune=0.18, stereo=True):
    """Detuned saw stack (in semitone-cents spread), returns (2,n)."""
    n = int(dur * SR); t = tt(n); l = np.zeros(n); r = np.zeros(n)
    for f in np.atleast_1d(freqs):
        for v in range(voices):
            dv = (v - (voices - 1) / 2) / ((voices - 1) / 2) if voices > 1 else 0
            fv = f * 2 ** (dv * detune / 12)
            ph = rng.random()
            saw = 2 * ((fv * t + ph) % 1.0) - 1
            p = dv * 0.8 if stereo else 0
            l += saw * np.cos((p + 1) * np.pi / 4); r += saw * np.sin((p + 1) * np.pi / 4)
    k = 1 / np.sqrt(voices * len(np.atleast_1d(freqs)))
    return np.array([l, r]) * k

# ---------------- drums ----------------
def kick(big=False):
    n = int((0.9 if big else 0.45) * SR); t = tt(n)
    f = 48 + (160 if big else 140) * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / (0.5 if big else 0.28))
    click = filt(rng.standard_normal(n), "high", 2500) * np.exp(-t / 0.004) * 0.5
    return np.tanh(1.8 * (body + click)) * 0.9

def snare():
    n = int(0.35 * SR); t = tt(n)
    noise = filt(rng.standard_normal(n), "band", [900, 9000]) * np.exp(-t / 0.11)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.06) + 0.5 * np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.04)
    return np.tanh(1.5 * (0.7 * noise + 0.6 * tone)) * 0.8

def hat(open_=False):
    n = int((0.3 if open_ else 0.06) * SR); t = tt(n)
    x = filt(rng.standard_normal(n), "high", 7500, 4)
    return x * np.exp(-t / (0.09 if open_ else 0.014)) * 0.5

def boom(dur=2.5):
    """Cinematic slam: pitch-drop sub + noise crack."""
    n = int(dur * SR); t = tt(n)
    f = 38 + 90 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    crack = filt(rng.standard_normal(n), "band", [150, 5000]) * np.exp(-t / 0.18)
    metal = filt(rng.standard_normal(n), "band", [2500, 8000]) * np.exp(-t / 0.5) * 0.25
    return np.tanh(1.6 * (sub + 0.6 * crack + metal)) * 0.9

def whoosh(dur=0.45, f0=400, f1=6000, rev_=False):
    n = int(dur * SR); t = tt(n)
    x = rng.standard_normal(n)
    if rev_: f0, f1 = f1, f0
    x = sweep_lp(x, f0, f1, block=256)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return x * env * 0.6

def riser(dur, f0=300, f1=9000):
    n = int(dur * SR); t = tt(n); a = t / dur
    noise = sweep_lp(rng.standard_normal(n), f0, f1, block=512)
    fs = 110 * 2 ** (a * 2.5)
    tone = (2 * ((np.cumsum(fs) / SR) % 1) - 1) * 0.25
    tone = sweep_lp(tone, 400, 5000, block=512)
    return (0.7 * noise + tone) * a ** 2 * 0.7

# ---------------- reverb ----------------
def reverb(xl, xr, secs=2.6, hp=250):
    n = int(secs * SR); t = tt(n)
    ir_l = rng.standard_normal(n) * np.exp(-t / (secs / 6.9)); ir_r = rng.standard_normal(n) * np.exp(-t / (secs / 6.9))
    ir_l = filt(ir_l, "low", 6000); ir_r = filt(ir_r, "low", 6000)
    ir_l /= np.sqrt(np.sum(ir_l ** 2)); ir_r /= np.sqrt(np.sum(ir_r ** 2))
    yl = fftconvolve(filt(xl, "high", hp), ir_l)[:len(xl)]
    yr = fftconvolve(filt(xr, "high", hp), ir_r)[:len(xr)]
    return yl, yr

# ================= 1. TENSION 0 -> T_TURN =================
D2, A2 = 38, 45
# pulsing sub on 8ths (D), with slight swell
for k in range(int(T_TURN / 0.25)):
    t0 = k * 0.25
    n = int(0.22 * SR); tt_ = tt(n)
    f = hz(D2 - 12 + 12) * (1 + 0.15 * np.exp(-tt_ / 0.01))
    s = np.sin(2 * np.pi * np.cumsum(np.full(n, hz(D2))) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(np.full(n, hz(D2))) / SR)
    env = np.exp(-tt_ / 0.09) * (1 - np.exp(-tt_ / 0.003))
    acc = 1.0 if k % 2 == 0 else 0.6
    put(t0, np.tanh(1.5 * s * env), 0.30 * acc * (0.6 + 0.4 * t0 / T_TURN))
# ticking hats (16ths, accents on 8ths), start after the hook line lands
for k in range(int(1.0 / 0.125), int(T_TURN / 0.125)):
    put(k * 0.125, hat(), (0.22 if k % 2 == 0 else 0.10), pan=0.3 * (-1) ** k)
# dissonant pad: D3, Ab3 (tritone), Eb4 rub, detuned saws through a slow-opening lowpass
pad = supersaw([hz(50), hz(56), hz(63), hz(38)], T_TURN + 0.3, voices=5, detune=0.25)
pad = np.array([sweep_lp(c, 300, 1400) for c in pad])
padenv = np.clip(tt(pad.shape[1]) / 2.5, 0, 1) * np.clip((T_TURN + 0.3 - tt(pad.shape[1])) / 0.4, 0, 1)
put(0, pad * padenv, 0.22, rev=0.5)
# whooshes on tabs and stats, slams on stats
for t0 in TABS: put(t0 - 0.2, whoosh(0.35, 600, 7000), 0.35, pan=rng.uniform(-0.6, 0.6), rev=0.2)
for t0 in SLAMS:
    put(t0 - 0.35, whoosh(0.4, 500, 8000), 0.4, rev=0.2)
    put(t0, boom(2.2), 0.75, rev=0.35)
    put(t0, kick(True), 0.5)
# riser into the turn
put(T_TURN - 2.2, riser(2.2, 300, 10000), 0.45, rev=0.3)

# ================= 2. THE TURN T_TURN -> T_DROP =================
turn_len = T_DROP - T_TURN
put(T_TURN, boom(3.0), 0.45, rev=0.6)
# warm major pad: Dmaj9 then Bm9 -> Gmaj9 (shifted at half-way)
chords = [[50, 54, 57, 61, 64], [47, 50, 54, 57, 61], [43, 47, 50, 54, 57]]
seg = turn_len / 3
for i, ch in enumerate(chords):
    d = seg + 0.6
    p = supersaw([hz(m) for m in ch], d, voices=5, detune=0.12)
    p = np.array([filt(c, "low", 1800) for c in p])
    n = p.shape[1]; e = np.clip(tt(n) / 0.8, 0, 1) * np.clip((d - tt(n)) / 0.6, 0, 1)
    put(T_TURN + i * seg, p * e, 0.45, rev=0.6)
    put(T_TURN + i * seg, np.sin(2 * np.pi * hz(ch[0] - 12) * tt(n)) * e, 0.18)   # sub root
# shimmering arpeggio (the stars): 16ths, D major pentatonic, bell-ish FM
arp_notes = [74, 78, 81, 83, 86, 81, 78, 76]
for k in range(int((turn_len - 0.25) / 0.125)):
    t0 = T_TURN + 0.5 + k * 0.125
    if t0 > T_DROP - 0.3: break
    m = arp_notes[k % len(arp_notes)] + (12 if (k // 16) % 2 and k % 4 == 0 else 0)
    n = int(0.5 * SR); x = tt(n); f = hz(m)
    bell = np.sin(2 * np.pi * f * x + 1.2 * np.exp(-x / 0.08) * np.sin(2 * np.pi * f * 2 * x)) * np.exp(-x / 0.18)
    grow = 0.5 + 0.5 * min(1, (t0 - T_TURN) / turn_len)
    put(t0, bell, 0.20 * grow, pan=0.5 * np.sin(k * 0.7), rev=0.7)
# build: snare roll + riser + kick pulse in the last 2 bars
for k in range(16):
    t0 = T_DROP - 2.0 + k * 0.125
    put(t0, snare(), 0.05 + 0.25 * k / 16, rev=0.3)
for k in range(8):
    put(T_DROP - 1.0 + k * 0.0625, snare(), 0.25 + 0.15 * k / 8, rev=0.3)
put(T_DROP - 4.0, riser(4.0, 200, 12000), 0.5, rev=0.4)
for k in range(4): put(T_DROP - 2.0 + k * 0.5, kick(), 0.35 + 0.1 * k)

# ================= 3. THE DROP T_DROP -> T_END =================
drop_len = T_END - T_DROP
nbeats = int(drop_len / BEAT)
prog = [(50, [50, 54, 57, 62]), (45, [49, 52, 57, 61]), (47, [50, 54, 59, 62]), (43, [50, 55, 59, 62])]  # D A Bm G
# sidechain envelope (pumps everything melodic)
pump = np.ones(N)
kick_times = [T_DROP + b * BEAT for b in range(nbeats)]
for kt in kick_times:
    s = int(kt * SR); n = min(int(BEAT * SR), N - s)
    if n > 0: pump[s:s + n] = np.minimum(pump[s:s + n], 1 - 0.75 * np.exp(-tt(n) / 0.11))
melL = np.zeros(N); melR = np.zeros(N)
def put_mel(t0, sig, gain, rev=0.0):
    s = int(t0 * SR); n = min(sig.shape[1], N - s)
    if n <= 0: return
    melL[s:s + n] += gain * sig[0, :n]; melR[s:s + n] += gain * sig[1, :n]
    if rev: REV_L[s:s + n] += rev * gain * sig[0, :n]; REV_R[s:s + n] += rev * gain * sig[1, :n]

def near_card(t, w=0.6): return any(c - w < t < c for c in CARDS)
for b in range(nbeats):
    t0 = T_DROP + b * BEAT; beat_in_bar = b % 4; bar = b // 4
    if near_card(t0 + BEAT, 0.6) and beat_in_bar == 3:   # tiny gap before each title-card impact
        pass
    else:
        put(t0, kick(), 0.85)
    if beat_in_bar in (1, 3): put(t0, snare(), 0.42, rev=0.25)
    put(t0 + 0.25, hat(open_=(b % 2 == 1)), 0.20 if b % 2 else 0.16, pan=0.25, rev=0.1)
    put(t0, hat(), 0.07, pan=-0.3); put(t0 + 0.125, hat(), 0.05, pan=-0.3); put(t0 + 0.375, hat(), 0.06, pan=-0.3)
# bass + stabs + pad per bar
nbars = int(np.ceil(drop_len / 2.0))
for bar in range(nbars):
    t_bar = T_DROP + bar * 2.0
    if t_bar >= T_END: break
    root, ch = prog[bar % 4]
    # bass: 8ths, octave bounce, detuned saw -> lowpass, saturated
    for e in range(16):
        t0 = t_bar + e * 0.125 * 2 / 2
        if e % 2: continue
        tb = t_bar + (e // 2) * 0.25
        if tb >= T_END: break
        m = root - 12 + (12 if (e // 2) % 4 == 3 else 0)
        s = supersaw([hz(m)], 0.24, voices=3, detune=0.1, stereo=False)
        n = s.shape[1]; env = adsr(n, 0.004, 0.08, 0.6, 0.03)
        cut = 700 + 500 * ((bar % 8) / 8)
        mono = np.tanh(2.0 * filt(s[0], "low", cut) * env) + 0.6 * np.sin(2 * np.pi * hz(m) * tt(n)) * env
        put_mel(tb, np.array([mono, mono]), 0.45)
    # uplifting supersaw stabs: syncopated  1 . . x . . x . | . . x . x . . .
    for pos in (0, 3, 6, 10, 12):
        ts = t_bar + pos * 0.125
        if ts >= T_END: break
        s = supersaw([hz(m + 12) for m in ch], 0.3, voices=7, detune=0.2)
        n = s.shape[1]; env = adsr(n, 0.003, 0.09, 0.25, 0.08)
        s = np.array([filt(c, "low", 4200) for c in s]) * env
        put_mel(ts, s, 0.30 if pos == 0 else 0.22, rev=0.35)
    # soft background pad
    d = 2.1; p = supersaw([hz(m) for m in ch], d, voices=5, detune=0.14)
    p = np.array([filt(c, "low", 1500) for c in p]); n = p.shape[1]
    p *= np.clip(tt(n) / 0.1, 0, 1) * np.clip((d - tt(n)) / 0.15, 0, 1)
    put_mel(t_bar, p, 0.14, rev=0.4)
    # sparkle arp continues from 52s on ("brighter star"), quieter earlier
    if t_bar >= shift(52.0) - 0.01 or bar % 2 == 1:
        for k in range(16):
            t0 = t_bar + k * 0.125
            if t0 >= T_END: break
            m = ch[k % 4] + 24; n = int(0.3 * SR); x = tt(n)
            bell = np.sin(2 * np.pi * hz(m) * x + np.exp(-x / 0.05) * np.sin(4 * np.pi * hz(m) * x)) * np.exp(-x / 0.12)
            put(t0, bell, 0.05, pan=0.6 * np.sin(k), rev=0.6)
L += melL * pump; R += melR * pump
# title-card risers + impacts
for c in CARDS:
    put(c - 1.0, riser(1.0, 800, 11000), 0.28, rev=0.3)
    put(c, boom(1.6), 0.38, rev=0.45)
    put(c, hat(True) * 1.5, 0.25, rev=0.4)

# ================= 4. FINAL HIT + DECAY =================
put(T_END - 1.5, riser(1.5, 400, 12000), 0.45, rev=0.4)
put(T_END, boom(4.0), 0.9, rev=0.6)
put(T_END, kick(True), 0.7)
tail = TOTAL - T_END
final = supersaw([hz(m) for m in (38, 50, 57, 62, 66, 69, 74)], tail, voices=7, detune=0.16)
n = final.shape[1]; x = tt(n)
final = np.array([sweep_lp(c, 6000, 500) for c in final]) * (np.exp(-x / 2.2) * 0.8 + 0.2 * np.exp(-x / 6)) * np.clip((tail - x) / 1.5, 0, 1)
put(T_END, final, 0.40, rev=0.7)
pad2 = supersaw([hz(m) for m in (50, 57, 61, 64)], tail, voices=5, detune=0.1)
pad2 = np.array([filt(c, "low", 1200) for c in pad2]) * np.clip(x / 0.5, 0, 1) * np.clip((tail - x) / 2.5, 0, 1)
put(T_END, pad2, 0.22, rev=0.6)
for k in range(int(tail / 0.25)):   # fading star arp over the end card
    t0 = T_END + 0.5 + k * 0.25
    if t0 > TOTAL - 1.2: break
    m = [74, 78, 81, 86][k % 4]; nn = int(0.6 * SR); xx = tt(nn)
    put(t0, np.sin(2 * np.pi * hz(m) * xx) * np.exp(-xx / 0.25), 0.07 * np.exp(-k / 14), pan=0.5 * np.sin(k), rev=0.8)

# ================= master =================
rl, rr = reverb(REV_L, REV_R, 2.8)
L += 0.55 * rl; R += 0.55 * rr
# gentle bus glue: low-shelf-ish cleanup + tanh saturation
L = filt(L, "high", 28); R = filt(R, "high", 28)
pk = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(1.2 * L / pk) / np.tanh(1.2); R = np.tanh(1.2 * R / pk) / np.tanh(1.2)
fade = np.clip((TOTAL - tt(N)) / 0.5, 0, 1)
out = np.stack([L, R], 1) * fade[:, None] * 10 ** (-3 / 20)   # peak -3 dBFS
with wave.open("music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
print(f"music.wav {TOTAL:.2f}s peak {np.abs(out).max():.3f}  drop@{T_DROP:.2f} end@{T_END:.2f}")
