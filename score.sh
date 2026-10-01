#!/bin/bash
# score.sh -> per-second SSIM (ref vs recreation) and overall
ffmpeg -v error -i out/recreation.mp4 -i ref/video.mp4 -lavfi "[0:v]scale=480:270,format=gray[a];[1:v]scale=480:270,format=gray[b];[a][b]ssim=stats_file=out/ssim.log" -f null - 
python3 - <<'PY'
import re
v=[float(re.search(r'All:([\d.]+)',l).group(1)) for l in open('out/ssim.log')]
print('overall SSIM %.4f'%(sum(v)/len(v)))
print(' '.join('%d:%.3f'%(s, sum(v[s*24:(s+1)*24])/len(v[s*24:(s+1)*24])) for s in range(15) if v[s*24:(s+1)*24]))
w=sorted(range(len(v)),key=lambda i:v[i])[:8]; print('worst frames (t):',' '.join('%.2f'%(i/24) for i in sorted(w)))
PY
