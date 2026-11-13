#!/usr/bin/env bash
# Rebuilds the promo from raw/ app footage + clips/ rendered scenes.
#   bash edit.sh                -> APU-Campus-Graph-Promo.mp4 (no AI shots)
#   Drop AI1.mp4 and/or AI2.mp4 into video/ and rerun to insert them:
#     AI1.mp4  (~8s, overwhelmed student) -> very start, before S1 hook
#     AI2.mp4  (~6s, night-sky constellation) -> after S2 stats, before S3 "What if campus just told you?"
#   Options: SKIP_SEGS=1 reuses already-built app segments.  OUT=name.mp4 overrides the output name.
set -euo pipefail
cd "$(dirname "$0")"
OUT="${OUT:-APU-Campus-Graph-Promo.mp4}"
B=build; mkdir -p "$B"
ENC=(-c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -ar 48000 -ac 2)
SIL=(-f lavfi -i anullsrc=r=48000:cl=stereo)

# seg NAME SRC SS DUR SPEED CX CY Z0 Z1 CAPTION|-
seg() {
  local name=$1 src=$2 ss=$3 dur=$4 sp=$5 cx=$6 cy=$7 z0=$8 z1=$9 cap=${10}
  local out_d; out_d=$(awk "BEGIN{printf \"%.3f\", $dur/$sp}")
  local nf; nf=$(awk "BEGIN{printf \"%d\", $out_d*30}")
  local zoom="scale=3840:2160:flags=bicubic,zoompan=z='$z0+($z1-$z0)*on/$nf':x='max(0,min(iw-iw/zoom,$cx*2-iw/zoom/2))':y='max(0,min(ih-ih/zoom,$cy*2-ih/zoom/2))':d=1:s=1920x1080:fps=30"
  local v="[0:v]trim=start=$ss:duration=$dur,setpts=(PTS-STARTPTS)/$sp,fps=30,$zoom,setsar=1,format=yuv420p"
  if [ "$cap" != "-" ]; then
    local fo; fo=$(awk "BEGIN{printf \"%.3f\", $out_d-0.45}")
    ffmpeg -v error -y -i "raw/$src.webm" -loop 1 -i "clips/cap_$cap.png" "${SIL[@]}" -filter_complex \
      "$v[b];[1:v]format=rgba,fade=in:st=0.25:d=0.25:alpha=1,fade=out:st=$fo:d=0.3:alpha=1[c];[b][c]overlay=0:0:shortest=1,format=yuv420p[v]" \
      -map "[v]" -map 2:a -t "$out_d" "${ENC[@]}" "$B/$name.mp4"
  else
    ffmpeg -v error -y -i "raw/$src.webm" "${SIL[@]}" -filter_complex "$v[v]" -map "[v]" -map 1:a -t "$out_d" "${ENC[@]}" "$B/$name.mp4"
  fi
  echo "seg $name ${out_d}s"
}

# scene clips -> add silent audio, normalize
norm() { # NAME FILE
  ffmpeg -v error -y -i "$2" "${SIL[@]}" -map 0:v -map 1:a -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:black,fps=30,setsar=1,format=yuv420p" -shortest "${ENC[@]}" "$B/$1.mp4"
}
# AI clips: keep their own audio when present
norm_ai() {
  if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$2" | grep -q .; then
    ffmpeg -v error -y -i "$2" -map 0:v -map 0:a -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,format=yuv420p" -af "aresample=48000" "${ENC[@]}" "$B/$1.mp4"
  else
    norm_tmp="$B/_ai_noaudio.mp4"
    ffmpeg -v error -y -i "$2" "${SIL[@]}" -map 0:v -map 1:a -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,format=yuv420p" -shortest "${ENC[@]}" "$B/$1.mp4"
  fi
  echo "ai $1"
}

if [ -z "${SKIP_SEGS:-}" ]; then
  for s in s1_hook s2_stats s3_turn s5_end t_ask t_map t_star t_join t_go; do norm "$s" "clips/$s.mp4"; done
  #   name      src       ss    dur   speed cx    cy   z0   z1   caption
  seg a_idle    a_idle    8.5   3.0   1     960   560  1.00 1.07 map
  seg b_filter  b_filter  6.9   2.6   1     760   520  1.04 1.10 filter
  seg c_type    c_ask     5.2   13.6  2.6   1720  780  1.36 1.44 gemini
  seg c_reply   c_ask     19.8  5.6   1     900   560  1.00 1.10 zoom
  seg c_card    c_ask     32.0  6.4   1     1209  450  1.12 1.38 card
  seg b_star    b_filter  20.6  3.2   1     760   620  1.03 1.12 star
  seg e_today   e_today   7.5   3.8   1     1350  480  1.05 1.22 today
  seg c_go      c_ask     49.2  3.0   1     1290  760  1.45 1.55 go
  # mobile: phone composite over rendered backdrop
  ffmpeg -v error -y -i clips/mobile_bg.mp4 -i raw/f_mobile.webm -i clips/phone_mask.png "${SIL[@]}" -filter_complex \
    "[1:v]trim=start=7.2:duration=6.5,setpts=PTS-STARTPTS,fps=30,scale=444:960:flags=lanczos,format=rgba[m];[2:v]format=gray[k];[m][k]alphamerge[p];[0:v][p]overlay=346:60:shortest=1,format=yuv420p[v]" \
    -map "[v]" -map 3:a -t 6.5 "${ENC[@]}" "$B/f_mobile.mp4"
  echo "seg f_mobile"
fi

ORDER=()
[ -f AI1.mp4 ] && { norm_ai ai1 AI1.mp4; ORDER+=(ai1); }
ORDER+=(s1_hook s2_stats)
[ -f AI2.mp4 ] && { norm_ai ai2 AI2.mp4; ORDER+=(ai2); }
ORDER+=(s3_turn a_idle b_filter t_ask c_type t_map c_reply t_join c_card t_star b_star e_today t_go c_go f_mobile s5_end)

: > "$B/list.txt"
for n in "${ORDER[@]}"; do echo "file '$n.mp4'" >> "$B/list.txt"; done
# re-encode on concat so mixed sources (AI clips) stay in sync
ffmpeg -v error -y -f concat -safe 0 -i "$B/list.txt" -vf "fps=30,format=yuv420p" "${ENC[@]}" -movflags +faststart "$OUT"
echo "wrote $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
t=0
for n in "${ORDER[@]}"; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$B/$n.mp4")
  printf "%7.2fs  %s\n" "$t" "$n"; t=$(awk "BEGIN{print $t+$d}")
done

# Soundtrack: score + voiceover are rebuilt and muxed by audio/build.sh (-> APU-Campus-Graph-Promo-sound.mp4).
# AI shots shift the timings: audio/build.sh reads build/ai1.mp4 / build/ai2.mp4 durations and moves every cue.
# Set WITH_SOUND=1 to run it automatically after this cut.
if [ -n "${WITH_SOUND:-}" ]; then IN="$PWD/$OUT" bash audio/build.sh; fi
