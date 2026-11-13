#!/usr/bin/env bash
# Rebuilds the promo soundtrack (original procedural score + edge-tts voiceover) and muxes it onto the video.
#   bash audio/build.sh                      -> APU-Campus-Graph-Promo-sound.mp4 from APU-Campus-Graph-Promo.mp4
#   IN=x.mp4 OUT=y.mp4 bash audio/build.sh   -> override input/output
#   VOICE=en-US-GuyNeural FORCE=1 ...        -> change voice (FORCE re-synthesizes cached vo/*.mp3)
# NOTE: AI shots shift the timings. All cues live in audio/timeline.py for the cut WITHOUT AI shots.
#   If AI1.mp4 / AI2.mp4 were inserted by edit.sh, this script reads their built durations from
#   build/ai1.mp4 / build/ai2.mp4 and exports AI1_DUR / AI2_DUR, so every music cue and VO line
#   after the insertion point moves with the picture (AI1 shifts everything; AI2 shifts >= 13.8s).
#   Re-check sync by eye afterwards; scene-level timings in timeline.py may still need nudging.
set -euo pipefail
cd "$(dirname "$0")"
V=..
IN="${IN:-$V/APU-Campus-Graph-Promo.mp4}"; OUT="${OUT:-$V/APU-Campus-Graph-Promo-sound.mp4}"
PY="${PY:-/c/Users/End User/AppData/Local/Programs/Python/Python312/python.exe}"
[ -x "$PY" ] || PY=python
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
export AI1_DUR=0 AI2_DUR=0
[ -f "$V/AI1.mp4" ] && [ -f "$V/build/ai1.mp4" ] && AI1_DUR=$(dur "$V/build/ai1.mp4")
[ -f "$V/AI2.mp4" ] && [ -f "$V/build/ai2.mp4" ] && AI2_DUR=$(dur "$V/build/ai2.mp4")
echo "AI1_DUR=$AI1_DUR AI2_DUR=$AI2_DUR"
"$PY" build_voice.py
"$PY" build_music.py
"$PY" mix.py
# two-pass loudnorm to -14 LUFS / -1.5 dBTP
J=$(ffmpeg -hide_banner -i premix.wav -af loudnorm=I=-14:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$J" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
ffmpeg -v error -y -i premix.wav -af "loudnorm=I=-14:TP=-2:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" -ar 48000 -c:a pcm_s16le final_audio.wav
ffmpeg -v error -y -i "$IN" -i final_audio.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,sample_rate,channels -of compact "$OUT"
ffmpeg -hide_banner -i "$OUT" -map 0:a -af loudnorm=I=-14:TP=-2:print_format=summary -f null - 2>&1 | grep -E "Input (Integrated|True Peak|LRA)"
ffmpeg -v error -y -i "$OUT" -filter_complex "showwavespic=s=1600x400:split_channels=1" -frames:v 1 waveform.png
