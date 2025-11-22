#!/bin/bash

pkill -f mjpg_streamer

sleep 2

WIDTH="${STREAM_WIDTH:-1280}"
HEIGHT="${STREAM_HEIGHT:-720}"
FPS="${STREAM_FPS:-30}"
STREAM_PORT="${STREAM_PORT:-8081}"

echo "🎥 Starting MJPG-streamer with libcamera..."
/usr/local/bin/mjpg_streamer \
  -i "input_libcamera.so -r ${WIDTH}x${HEIGHT} -f ${FPS}" \
  -o "output_http.so -p ${STREAM_PORT} -w /usr/local/share/mjpg-streamer/www" &

sleep 3

if ! pgrep -f mjpg_streamer > /dev/null; then
  echo "⚠️ libcamera failed, trying legacy camera..."

  /usr/local/bin/mjpg_streamer \
    -i "input_uvc.so -d ${VIDEO_DEVICE:-/dev/video0} -r ${WIDTH}x${HEIGHT} -f ${FPS}" \
    -o "output_http.so -p ${STREAM_PORT} -w /usr/local/share/mjpg-streamer/www" &
fi

echo "✅ MJPG-streamer started on port ${STREAM_PORT}"
