# Runner promo recreation

A frame-accurate recreation of a 14.7s product promo for an AI agent app called Runner, built by Claude Code (Opus 5.5).
The original promo is by [@byshubh](https://x.com/byshubh/status/2104974911425196258).
The reference clip and its audio are included in `ref/` so the recreation can be rendered and scored from a fresh clone; all rights to them belong to the original creator.

Live session replay: see `site/` (published via ChatGPT sites).

## How it works

The video is a deterministic web page: `src/comp.js` exposes `window.seek(t)` and draws the frame at time `t`.
The metaball spheres and the Runner logo are a WebGL signed-distance-field shader.
The headline, suggestion wheel, prompt box, cursor, loader and 0/1 grid are DOM, SVG and canvas.
Every value (positions, scales, colours, timings) comes from measurements of the reference, refined over three rounds of AI critic panels.

- `render.mjs` - captures every frame with Playwright (headless Chromium).
- `assemble.py` - encodes the frames with ffmpeg and muxes the original audio.
- `score.sh` - per-second SSIM against the reference.
- `compare.sh`, `probe.mjs` - side-by-side contact sheets and single-frame probes.
- `site/` - the session replay website.

## Render it yourself

The reference clip and audio are already in `ref/`, so just run:

```
npm install
python3 -m venv .venv && .venv/bin/pip install numpy pillow
node render.mjs && .venv/bin/python assemble.py && ./score.sh
```

The output lands in `out/recreation.mp4`.

## Results

SSIM against the original went from 0.862 on the first render to 0.926 on the final one.
Critic panel scores (three segments, out of 10) went from 3 / 4 / 4.5 in round one to 5 / 7 / 6 in round three.
