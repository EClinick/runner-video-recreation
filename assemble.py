# Average sub-frames into motion-blurred frames, add film grain, mux the original audio.
import glob, os, subprocess, sys, numpy as np
from PIL import Image
src, dst = 'out/frames', 'out/blur'; os.makedirs(dst, exist_ok=True)
frames = sorted({p.split('/')[-1].split('_')[0] for p in glob.glob(src + '/*.jpg')})
for f in frames:
    subs = sorted(glob.glob(f'{src}/{f}_*.jpg'))
    acc = np.mean([np.asarray(Image.open(p), dtype=np.float32) for p in subs], axis=0)
    Image.fromarray(np.clip(acc + 0.5, 0, 255).astype(np.uint8)).save(f'{dst}/{f}.png')
start = int(frames[0])
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '24', '-start_number', str(start), '-i', f'{dst}/%04d.png',
  '-i', 'ref/audio.mp3', '-vf', 'format=yuv420p,noise=c0s=3:c0f=t', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
  '-c:a', 'aac', '-b:a', '256k', '-shortest', 'out/recreation.mp4'], check=True)
print('wrote out/recreation.mp4', len(frames), 'frames')
