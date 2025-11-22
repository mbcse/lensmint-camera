#!/bin/bash

set -e

echo "========================================================================"
echo "Raspberry Pi Camera App - Dependency Installation"
echo "========================================================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
    echo -e "${YELLOW}Warning: This doesn't appear to be a Raspberry Pi${NC}"
    echo -e "${YELLOW}Some features may not work correctly${NC}"
    echo ""
fi

if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please do not run this script as root (don't use sudo)${NC}"
    echo -e "${YELLOW}The script will prompt for sudo password when needed${NC}"
    exit 1
fi

echo -e "${GREEN}[1/7] Updating system packages...${NC}"
sudo apt update
sudo apt upgrade -y
echo ""

echo -e "${GREEN}[2/7] Installing Python development tools...${NC}"
sudo apt install -y \
    python3-pip \
    python3-dev \
    python3-setuptools \
    python3-virtualenv \
    build-essential \
    libffi-dev \
    libssl-dev \
    libcap-dev
echo ""

echo -e "${GREEN}[3/7] Installing multimedia libraries for Kivy...${NC}"
sudo apt install -y \
    libsdl2-dev \
    libsdl2-image-dev \
    libsdl2-mixer-dev \
    libsdl2-ttf-dev \
    libportmidi-dev \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavdevice-dev \
    libavfilter-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    pkg-config \
    zlib1g-dev \
    libgstreamer1.0-dev \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    libmtdev-dev \
    libjpeg-dev \
    libpng-dev \
    libfreetype6-dev \
    xclip \
    xsel
echo ""

echo -e "${GREEN}[4/7] Installing camera libraries...${NC}"
sudo apt install -y \
    python3-picamera2 \
    python3-libcamera \
    python3-kms++ \
    libcamera-apps
echo ""

echo -e "${GREEN}[4.5/7] Installing pre-built Python packages from apt (faster, no compilation)...${NC}"
sudo apt install -y \
    python3-numpy \
    python3-pil \
    python3-opencv \
    python3-setuptools
echo ""

echo -e "${GREEN}[5/7] Installing optional I2C tools for battery monitoring...${NC}"
sudo apt install -y \
    python3-smbus \
    i2c-tools
echo ""

echo -e "${GREEN}[6/7] Installing Python packages...${NC}"

echo -e "${YELLOW}Do you want to install Python packages in a virtual environment? (recommended)${NC}"
echo "y = Yes (create ~/camera-env)"
echo "n = No (install system-wide)"
read -p "Choice [y/n]: " use_venv

if [ "$use_venv" = "y" ] || [ "$use_venv" = "Y" ]; then
    VENV_PATH="${VENV_PATH:-$HOME/camera-env}"
    echo "Creating virtual environment at $VENV_PATH..."
    echo "Using --system-site-packages to access apt-installed packages (picamera2, numpy, PIL)"
    python3 -m venv --system-site-packages "$VENV_PATH"
    source "$VENV_PATH/bin/activate"

    pip install --upgrade pip

    echo "Installing Cython (required for Kivy)..."
    pip install Cython

    echo "Installing Kivy core dependencies..."
    pip install docutils pygments requests

    echo "Installing Kivy (this may take 5-10 minutes on Raspberry Pi)..."
    echo "Note: Errors about 'av' or 'simplejpeg' can be safely ignored"
    echo ""

    pip install kivy --no-deps
    pip install Kivy-Garden pygments docutils requests || true

    echo ""
    echo "Installing additional libraries..."
    pip install smbus2 || echo "Warning: smbus2 install failed"
    pip install ecdsa || echo "Warning: ecdsa install failed (required for hardware identity)"

    echo ""
    echo -e "${GREEN}Virtual environment created at: $VENV_PATH${NC}"
    echo -e "${YELLOW}To activate it, run: source $VENV_PATH/bin/activate${NC}"
else
    echo "Installing packages system-wide..."
    echo "Installing Cython (required for Kivy)..."
    pip3 install --user Cython

    echo "Installing Kivy core dependencies..."
    pip3 install --user docutils pygments requests

    echo "Installing Kivy (this may take 5-10 minutes on Raspberry Pi)..."
    echo "Note: Errors about 'av' or 'simplejpeg' can be safely ignored"
    echo ""

    pip3 install --user kivy --no-deps
    pip3 install --user Kivy-Garden pygments docutils requests || true

    echo ""
    echo "Installing additional libraries..."
    pip3 install --user smbus2 || echo "Warning: smbus2 install failed"
    pip3 install --user ecdsa || echo "Warning: ecdsa install failed (required for hardware identity)"
fi
echo ""

echo -e "${GREEN}[7/7] Setting up directories and permissions...${NC}"

CAPTURE_DIR="${CAPTURE_DIR:-/home/$USER/captures}"
mkdir -p "$CAPTURE_DIR"
chmod 755 "$CAPTURE_DIR"
echo "Created capture directory: $CAPTURE_DIR"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -f "$SCRIPT_DIR/raspberry_pi_camera_app.py" ]; then
    chmod +x "$SCRIPT_DIR/raspberry_pi_camera_app.py"
    echo "Made raspberry_pi_camera_app.py executable"
fi
echo ""

echo "========================================================================"
echo -e "${GREEN}Testing camera...${NC}"
echo "========================================================================"
if command -v libcamera-hello &> /dev/null; then
    echo "Running camera test (5 seconds)..."
    if libcamera-hello --timeout 5000 2>&1 | grep -q "Running"; then
        echo -e "${GREEN}✓ Camera test successful!${NC}"
    else
        echo -e "${YELLOW}⚠ Camera test had issues. Check camera connection.${NC}"
    fi
else
    echo -e "${YELLOW}⚠ libcamera-hello not found, skipping camera test${NC}"
fi
echo ""

echo "========================================================================"
echo -e "${GREEN}Installation Complete!${NC}"
echo "========================================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Enable camera interface (if not already done):"
echo "   sudo raspi-config"
echo "   → Interface Options → Camera → Yes"
echo ""
echo "2. Run the app:"
if [ "$use_venv" = "y" ] || [ "$use_venv" = "Y" ]; then
    echo "   source ~/camera-env/bin/activate"
fi
echo "   python3 $SCRIPT_DIR/raspberry_pi_camera_app.py"
echo ""
echo "3. (Optional) Set up auto-start on boot:"
echo "   See SETUP_INSTRUCTIONS.md for details"
echo ""
echo "4. Captured files will be saved to:"
echo "   $CAPTURE_DIR"
echo ""
echo -e "${GREEN}Enjoy your camera app! 📸${NC}"
echo ""
