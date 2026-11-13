"""Voiceover via edge-tts (sends only the script text to Microsoft TTS). Writes vo/NN.wav and vo_track.wav."""
import asyncio, subprocess, os, sys, json
import numpy as np
from timeline import VO, shift, TOTAL
VOICE = os.environ.get("VOICE", "en-US-AndrewMultilingualNeural")
RATE = "+5%"
SR = 48000
os.makedirs("vo", exist_ok=True)

async def synth(i, text):
    import edge_tts
    mp3 = f"vo/{i:02d}.mp3"
    if not os.path.exists(mp3) or os.path.getsize(mp3) == 0 or os.environ.get("FORCE"):
        for attempt in range(6):  # the free endpoint fails intermittently (403 / no audio): retry
            try:
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(mp3)
                if os.path.getsize(mp3) > 0: break
            except Exception as e:
                print("retry", i, type(e).__name__, file=sys.stderr)
            await asyncio.sleep(1.5 * (attempt + 1))
        else:
            raise SystemExit(f"TTS failed for line {i}")
    return mp3

def decode(path, tempo=1.0):
    af = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse"
    if tempo != 1.0: af += f",atempo={tempo:.4f}"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", af, "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)

async def main():
    mp3s = [await synth(i, t) for i, (_, _, t) in enumerate(VO)]
    track = np.zeros(int(TOTAL * SR) + SR, np.float32)
    report = []
    for i, ((st, dl, text), mp3) in enumerate(zip(VO, mp3s)):
        x = decode(mp3)
        avail = (dl - st) - 0.1
        tempo = 1.0
        if len(x) / SR > avail:
            tempo = min(1.35, (len(x) / SR) / avail)
            x = decode(mp3, tempo)
        s = int(shift(st) * SR)
        track[s:s + len(x)] += x[: len(track) - s]
        report.append((st, round(len(x) / SR, 2), round(dl - st, 2), round(tempo, 3), text))
    import wave
    pcm = (np.clip(track, -1, 1) * 32767).astype(np.int16)
    st = np.repeat(pcm[:, None], 2, 1)
    with wave.open("vo_track.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    for r in report: print("%5.1fs  dur %5.2f / slot %5.2f  tempo %.3f  %s" % r)

asyncio.run(main())
