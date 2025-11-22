#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
VENV_PATH="${VENV_PATH:-$HOME/camera-env}"

BACKEND_DIR="$PROJECT_ROOT/hardware-web3-service"
BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
CLAIM_SERVER_URL="${CLAIM_SERVER_URL:-https://lensmint.onrender.com}"

BACKEND_PID=""

cleanup() {
    echo ""
    echo "Shutting down services..."
    
    if [ ! -z "$BACKEND_PID" ]; then
        echo "Stopping backend server (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null || true
    fi
    
    if [ -d "$VENV_PATH" ]; then
        deactivate 2>/dev/null || true
    fi
    
    echo "Cleanup complete."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Starting LensMint Camera System"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   Please install Node.js first: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs"
    exit 1
fi

if [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ Error: Backend directory not found at $BACKEND_DIR"
    exit 1
fi

if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd "$BACKEND_DIR"
    npm install
fi

echo ""
echo "🔄 Starting backend server..."
cd "$BACKEND_DIR"
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi
node server.js 2>&1 | tee /tmp/lensmint-backend.log &
BACKEND_PID=$!
echo "   Backend server started (PID: $BACKEND_PID)"
echo "   Logs: /tmp/lensmint-backend.log"

echo "   Waiting for backend to initialize..."
sleep 3
for i in {1..30}; do
    if curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
        echo "   ✅ Backend server is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "   ⚠️  Backend server may not be ready, continuing anyway..."
    else
        sleep 1
    fi
done

echo ""
echo "🔄 Checking external claim server..."
for i in {1..10}; do
    if curl -s "$CLAIM_SERVER_URL/health" > /dev/null 2>&1; then
        echo "   ✅ External claim server is accessible at $CLAIM_SERVER_URL"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "   ⚠️  External claim server may not be accessible, continuing anyway..."
    else
        sleep 1
    fi
done

if [ -d "$VENV_PATH" ]; then
    echo ""
    echo "🐍 Activating Python virtual environment..."
    source "$VENV_PATH/bin/activate"
    export PYTHONPATH="/usr/lib/python3/dist-packages:$PYTHONPATH"
fi

if [ ! -f "$SCRIPT_DIR/raspberry_pi_camera_app.py" ]; then
    echo "❌ Error: raspberry_pi_camera_app.py not found in $SCRIPT_DIR"
    exit 1
fi

export KIVY_NO_ARGS=1
export DISPLAY=${DISPLAY:-:0}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📸 Starting Camera App"
echo "═══════════════════════════════════════════════════════════════"
echo "   Backend: $BACKEND_URL"
echo "   Claim Server: $CLAIM_SERVER_URL"
echo ""
echo "   Press Ctrl+C to stop all services"
echo "═══════════════════════════════════════════════════════════════"
echo ""

cd "$SCRIPT_DIR"
python3 raspberry_pi_camera_app.py
