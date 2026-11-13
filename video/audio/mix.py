"""Duck music ~8 dB under the voice (volume automation from the VO envelope) and sum -> premix.wav."""
import numpy as np, wave
from scipy.ndimage import maximum_filter1d, uniform_filter1d
SR = 48000
def rd(p):
    with wave.open(p) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, w.getnchannels()) / 32768.0
    return x
m, v = rd("music.wav"), rd("vo_track.wav")
n = len(m); v = np.pad(v, ((0, max(0, n - len(v))), (0, 0)))[:n]
env = np.abs(v).max(1)
active = maximum_filter1d((uniform_filter1d(env, 960) > 0.01).astype(float), int(0.35 * SR))  # bridge word gaps
# smooth: ~80 ms attack, ~400 ms release
g = np.empty(n); s = 0.0; a = 1 - np.exp(-1 / (0.08 * 1000)); r = 1 - np.exp(-1 / (0.4 * 1000))  # 1 kHz control rate
for i, x in enumerate(active[::48]):   # 1 ms control rate
    s += (a if x > s else r) * (x - s); g[i*48:(i+1)*48] = s
duck = 10 ** (-8 * g / 20)
out = m * duck[:, None] + v * 0.9
out /= max(1.0, np.abs(out).max() / 0.89)
with wave.open("premix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
print("premix.wav peak %.3f, ducked %.1f%% of time" % (np.abs(out).max(), 100 * (g > 0.5).mean()))
