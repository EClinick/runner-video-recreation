#!/bin/bash
# compare.sh START DUR FPS NAME -> out/cmp/NAME.png : rows of [reference | recreation]
mkdir -p out/cmp
ffmpeg -v error -y -ss $1 -t $2 -i ref/video.mp4 -ss $1 -t $2 -i out/recreation.mp4 -filter_complex \
 "[0:v]fps=$3,scale=640:-1[a];[1:v]fps=$3,scale=640:-1[b];[a][b]hstack=inputs=2,pad=iw:ih+6:0:0:red,tile=2x$(python3 -c "import math;print(math.ceil($2*$3/2))")" -frames:v 1 out/cmp/$4.png
