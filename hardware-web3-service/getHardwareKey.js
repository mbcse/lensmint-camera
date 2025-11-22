import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HardwareKeyExtractor {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.hardwareIdentityPath = path.join(__dirname, '../hardware-camera-app/hardware_identity.py');
    this.cacheFile = path.join(__dirname, '.hardware_key_cache');
  }

  getPrivateKey(cameraId = null) {
    try {
      // Try to read from exported key file first
      const exported = this._tryReadFromExportFile();
      if (exported) {
        if (!cameraId) {
          try {
            const exportFile = path.join(__dirname, '../hardware-camera-app/.device_key_export');
            if (fs.existsSync(exportFile)) {
              const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
              cameraId = data.cameraId || null;
              if (cameraId) {
                console.log(`✅ Using camera ID from export file: ${cameraId}`);
              }
            }
          } catch (e) {
            // Ignore
          }
        }
        return exported;
      }

      if (fs.existsSync(this.cacheFile)) {
        try {
          const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
          if (Date.now() - cached.timestamp < 3600000) {
            console.log('✅ Using cached hardware key');
            return cached.privateKey;
          }
        } catch (e) {
        }
      }

      if (!cameraId) {
        try {
          const exportFile = path.join(__dirname, '../kivy/.device_key_export');
          if (fs.existsSync(exportFile)) {
            const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
            cameraId = data.cameraId || null;
            if (cameraId) {
              console.log(`📷 Using camera ID from export file: ${cameraId}`);
            }
          }
        } catch (e) {
        }
      }

      const exportScript = path.join(__dirname, '../hardware-camera-app/export_key.py');
      if (fs.existsSync(exportScript)) {
        try {
          execSync(`${this.pythonPath} ${exportScript}`, {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            timeout: 10000,
            stdio: 'pipe'
          });
          
          const exportedAfter = this._tryReadFromExportFile();
          if (exportedAfter) {
            try {
              const exportFile = path.join(__dirname, '../hardware-camera-app/.device_key_export');
              if (fs.existsSync(exportFile)) {
                const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
                cameraId = data.cameraId || cameraId;
              }
            } catch (e) {
            }
            return exportedAfter;
          }
        } catch (e) {
          console.log('Export script failed, trying direct call...');
        }
      }

      if (!cameraId) {
        console.warn('⚠️ No camera ID available - hardware key may not match Kivy app!');
        console.warn('   The backend address may differ from Kivy app address');
        console.warn('   Ensure Kivy app has initialized and created .device_key_export file');
      }
      
      let pythonScript = `
import sys
import json
sys.path.insert(0, '${path.join(__dirname, '../hardware-camera-app').replace(/\\/g, '/')}')

try:
    from hardware_identity import get_hardware_identity
    
    camera_id = ${cameraId ? `'${cameraId}'` : 'None'}
    if camera_id:
        print(f"Using camera ID: {camera_id}", file=sys.stderr)
    hw_id = get_hardware_identity(camera_id=camera_id)
    
    private_key = hw_id.private_key.to_string().hex()
    
    result = {
        'success': True,
        'privateKey': '0x' + private_key,
        'address': hw_id.get_address(),
        'cameraId': hw_id.get_camera_id()
    }
    print(json.dumps(result))
except Exception as e:
    result = {
        'success': False,
        'error': str(e)
    }
    print(json.dumps(result))
    sys.exit(1)
`;

      const tempScript = path.join(__dirname, '.temp_get_key.py');
      fs.writeFileSync(tempScript, pythonScript, 'utf8');
      
      try {
        const output = execSync(
          `${this.pythonPath} ${tempScript}`,
          { 
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            timeout: 10000,
            stdio: 'pipe'
          }
        );
        
        // Clean up temp file
        if (fs.existsSync(tempScript)) {
          fs.unlinkSync(tempScript);
        }

        const result = JSON.parse(output.trim());

        if (result.success && result.privateKey) {
          // Cache the result
          fs.writeFileSync(
            this.cacheFile,
            JSON.stringify({
              privateKey: result.privateKey,
              address: result.address,
              cameraId: result.cameraId,
              timestamp: Date.now()
            }),
            'utf8'
          );

          console.log(`✅ Hardware key extracted: ${result.address}`);
          return result.privateKey;
        } else {
          throw new Error(result.error || 'Failed to get hardware key');
        }
      } finally {
        if (fs.existsSync(tempScript)) {
          try {
            fs.unlinkSync(tempScript);
          } catch (e) {
          }
        }
      }
    } catch (error) {
      console.error('❌ Error extracting hardware key:', error.message);
      
      return this._tryReadFromExportFile();
    }
  }

  _tryReadFromExportFile() {
    const exportFile = path.join(__dirname, '../kivy/.device_key_export');
    
    if (fs.existsSync(exportFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
        if (data.privateKey) {
          console.log('✅ Read hardware key from export file');
          console.log(`   📍 Address from export: ${data.address}`);
          console.log(`   📷 Camera ID from export: ${data.cameraId || 'none'}`);
          
          fs.writeFileSync(
            this.cacheFile,
            JSON.stringify({
              privateKey: data.privateKey,
              address: data.address,
              cameraId: data.cameraId,
              timestamp: Date.now()
            }),
            'utf8'
          );
          
          return data.privateKey;
        } else {
          console.warn('   ⚠️ Export file exists but has no privateKey');
        }
      } catch (e) {
        console.error('   ❌ Error reading export file:', e.message);
      }
    } else {
      console.log(`   ℹ️ Export file not found: ${exportFile}`);
      console.log(`   ℹ️ Kivy app will create it on startup`);
    }
    
    return null;
  }

  getDeviceAddress() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        return cached.address;
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }

  clearCache() {
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }
}

const hardwareKeyExtractor = new HardwareKeyExtractor();

export default hardwareKeyExtractor;
