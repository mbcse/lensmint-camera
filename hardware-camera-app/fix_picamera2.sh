#!/bin/bash

echo "========================================================================"
echo "Fixing Picamera2 Access in Virtual Environment"
echo "========================================================================"
echo ""

VENV_PATH="${VENV_PATH:-$HOME/camera-env}"

echo "[1/3] Checking system picamera2 installation..."
if python3 -c "import picamera2; print('System picamera2:', picamera2.__version__)" 2>/dev/null; then
    echo "✓ Picamera2 found in system packages"
else
    echo "✗ Picamera2 NOT found in system packages"
    echo "Installing python3-picamera2..."
    sudo apt install -y python3-picamera2
fi
echo ""

if [ -d "$VENV_PATH" ]; then
    echo "[2/3] Recreating virtual environment with system packages access..."

    if [ -d "${VENV_PATH}.backup" ]; then
        rm -rf "${VENV_PATH}.backup"
    fi
    mv "$VENV_PATH" "${VENV_PATH}.backup"

    python3 -m venv --system-site-packages "$VENV_PATH"
    source "$VENV_PATH/bin/activate"

    echo "Reinstalling Kivy in new virtual environment..."
    pip install --upgrade pip
    pip install Cython
    pip install kivy --no-deps
    pip install Kivy-Garden pygments docutils requests
    pip install smbus2

    deactivate

    echo "✓ Virtual environment recreated with system packages access"
else
    echo "[2/3] No virtual environment found, skipping..."
fi
echo ""

echo "[3/3] Testing picamera2 access..."
if [ -d "$VENV_PATH" ]; then
    source "$VENV_PATH/bin/activate"
    if python3 -c "import picamera2; print('✓ Picamera2 accessible in venv:', picamera2.__version__)" 2>/dev/null; then
        echo "SUCCESS! Picamera2 is now accessible"
    else
        echo "⚠ Picamera2 still not accessible in venv"
        echo "Try running the app without virtual environment:"
        echo "  python3 raspberry_pi_camera_app.py"
    fi
    deactivate
else
    if python3 -c "import picamera2; print('✓ Picamera2 accessible:', picamera2.__version__)" 2>/dev/null; then
        echo "SUCCESS! Picamera2 is accessible"
    else
        echo "✗ Picamera2 not accessible"
    fi
fi

echo ""
echo "========================================================================"
echo "Done!"
echo "Run the app with: bash run_camera_app.sh"
echo "========================================================================"
