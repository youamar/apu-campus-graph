"""Shared scene timeline (seconds, for the cut WITHOUT AI shots).
AI shots shift timings: AI1 is inserted at the very start, AI2 between S2 stats (ends 13.8s)
and S3. Set env AI1_DUR / AI2_DUR (seconds) and every cue is remapped via shift()."""
import os
AI1 = float(os.environ.get("AI1_DUR", "0") or 0)
AI2 = float(os.environ.get("AI2_DUR", "0") or 0)
BASE_LEN = 79.97

def shift(t):
    return t + AI1 + (AI2 if t >= 13.8 - 1e-6 else 0.0)

TOTAL = BASE_LEN + AI1 + AI2

# (start, deadline, text)  deadline = next scene / next line start
VO = [
    (0.3, 6.0, "Joining one club at APU... takes five tabs of research."),
    (6.2, 13.8, "A hundred and thirty-seven clubs. Zero list a fee. Zero have a join link."),
    (14.0, 18.8, "What if campus just... told you?"),
    (19.0, 21.9, "Introducing APU Campus Graph."),
    (22.2, 27.3, "Every club, on one living map."),
    (27.5, 34.8, "Just ask, in your own words."),
    (35.0, 42.3, "Gemini answers, and the map shows you exactly where to go."),
    (42.5, 52.0, "Can I join? Will it fit my week? What does it cost? It's all right here."),
    (52.1, 61.3, "Brighter stars mean something's coming up."),
    (61.5, 66.4, "And you never have to go alone."),
    (66.6, 72.9, "Campus life, in your pocket."),
    (73.2, 79.6, "APU Campus Graph. Every club. One living map. Just ask."),
]
