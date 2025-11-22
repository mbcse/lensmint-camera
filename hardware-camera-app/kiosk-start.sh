#!/bin/bash

sleep 5

xset s off
xset s noblank
xset -dpms

unclutter -idle 0.1 -root &

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --no-first-run \
  --fast \
  --fast-start \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --start-fullscreen \
  --app="$FRONTEND_URL"

sleep 5
exec $0
