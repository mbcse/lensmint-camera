#!/bin/bash

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         📷 LensMint Web3 Camera Installation             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    echo "⚠️  Warning: This doesn't appear to be a Raspberry Pi"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

INSTALL_DIR="${INSTALL_DIR:-${1:-/home/pi/lensmint}}"
echo "📁 Installation directory: $INSTALL_DIR"
echo ""

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "🔍 Checking Node.js installation..."
if command_exists node; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo "✅ Node.js $(node -v) found"

    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "⚠️  Node.js 18+ required. Current version is too old."
        echo "📦 Installing Node.js 18..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
else
    echo "📦 Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
fi

echo ""
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y git build-essential cmake libjpeg-dev chromium-browser unclutter xdotool

echo ""
echo "🔍 Checking MJPG-Streamer installation..."
if command_exists mjpg_streamer; then
    echo "✅ MJPG-Streamer already installed"
else
    echo "📦 Installing MJPG-Streamer..."
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    git clone https://github.com/jacksonliam/mjpg-streamer.git
    cd mjpg-streamer/mjpg-streamer-experimental
    make
    sudo make install
    cd ~
    rm -rf "$TEMP_DIR"
    echo "✅ MJPG-Streamer installed"
fi

echo ""
echo "📁 Creating project directories..."
mkdir -p "$INSTALL_DIR/captures"
mkdir -p "$INSTALL_DIR/logs"

echo ""
echo "📦 Installing backend dependencies..."
cd "$INSTALL_DIR/hardware-web3-service"
npm install

echo ""
echo "📦 Installing frontend dependencies and building..."
cd "$INSTALL_DIR/frontend"
npm install
npm run build

echo ""
echo "📦 Installing PM2 process manager..."
if command_exists pm2; then
    echo "✅ PM2 already installed"
else
    sudo npm install -g pm2
fi

echo ""
echo "⚙️  Setting up PM2 to start on boot..."
pm2 startup systemd -u pi --hp /home/pi | grep "sudo" | bash || true

echo ""
echo "🚀 Starting LensMint services..."
cd "$INSTALL_DIR"
pm2 delete all || true  # Clear any existing processes
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "⚙️  Setting up MJPG-Streamer service..."
chmod +x "$INSTALL_DIR/mjpg-streamer-start.sh"

sudo tee /etc/systemd/system/mjpg-streamer.service > /dev/null <<EOF
[Unit]
Description=MJPG-Streamer for LensMint
After=network.target

[Service]
Type=forking
User=pi
ExecStart=$INSTALL_DIR/mjpg-streamer-start.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mjpg-streamer.service
sudo systemctl start mjpg-streamer.service

echo ""
read -p "🖥️  Setup kiosk mode (auto-start UI on boot)? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "⚙️  Setting up kiosk mode..."
    chmod +x "$INSTALL_DIR/kiosk-start.sh"

    mkdir -p ~/.config/lxsession/LXDE-pi

    # Backup existing autostart
    if [ -f ~/.config/lxsession/LXDE-pi/autostart ]; then
        cp ~/.config/lxsession/LXDE-pi/autostart ~/.config/lxsession/LXDE-pi/autostart.backup
    fi

    # Create autostart file
    cat > ~/.config/lxsession/LXDE-pi/autostart <<EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@$INSTALL_DIR/kiosk-start.sh
EOF

    echo "✅ Kiosk mode configured"
fi

echo ""
echo "📷 Checking camera..."
if vcgencmd get_camera | grep -q "detected=1"; then
    echo "✅ Camera detected"
else
    echo "⚠️  Camera not detected. Enable it with: sudo raspi-config"
    echo "   Navigate to: Interface Options > Camera > Enable"
fi

echo ""
echo "🧪 Testing services..."
sleep 3

if curl -s http://localhost:5000/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "⚠️  Backend test failed"
fi

if curl -s -I http://localhost:3000 | grep -q "200"; then
    echo "✅ Frontend is running"
else
    echo "⚠️  Frontend test failed (may still be building)"
fi

if sudo systemctl is-active --quiet mjpg-streamer; then
    echo "✅ MJPG-Streamer is running"
else
    echo "⚠️  MJPG-Streamer not running"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                  ✨ Installation Complete!                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Service Status:"
pm2 list
echo ""
echo "🌐 Access Points:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend:  http://localhost:5000"
echo "   - Stream:   http://localhost:8081/stream"
echo ""
echo "📝 Useful Commands:"
echo "   - View logs:        pm2 logs"
echo "   - Restart services: pm2 restart all"
echo "   - Stop services:    pm2 stop all"
echo "   - Status check:     pm2 status"
echo ""
echo "📚 Documentation:"
echo "   - README.md              - Full documentation"
echo "   - SETUP-CHECKLIST.md     - Setup verification"
echo "   - QUICK-COMMANDS.md      - Command reference"
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "🖥️  Kiosk mode is enabled. The UI will auto-start on next boot."
    echo ""
    read -p "🔄 Reboot now to start LensMint in kiosk mode? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Rebooting in 3 seconds..."
        sleep 3
        sudo reboot
    fi
else
    echo "💡 To test manually, open Chromium and go to http://localhost:3000"
fi

echo ""
echo "🎉 Happy capturing with LensMint!"
echo ""
