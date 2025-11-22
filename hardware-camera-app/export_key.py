#!/usr/bin/env python3

import json
import sys
import os
from pathlib import Path

try:
    from hardware_identity import get_hardware_identity
    
    camera_id = None
    if len(sys.argv) > 1:
        camera_id = sys.argv[1]
    elif 'CAMERA_ID' in os.environ:
        camera_id = os.environ['CAMERA_ID']
    
    if not camera_id:
        try:
            hw_id_temp = get_hardware_identity()
            camera_id = hw_id_temp.get_camera_id()
            if camera_id:
                print(f"Using existing camera ID: {camera_id}", file=sys.stderr)
        except:
            pass
    
    hw_id = get_hardware_identity(camera_id=camera_id)
    private_key_hex = hw_id.private_key.to_string().hex()
    
    export_data = {
        'privateKey': f'0x{private_key_hex}',
        'address': hw_id.get_address(),
        'cameraId': hw_id.get_camera_id(),
        'publicKey': hw_id.get_public_key_hex()
    }
    
    export_file = Path(os.getenv('DEVICE_KEY_EXPORT_PATH', str(Path(__file__).parent / '.device_key_export')))
    with open(export_file, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f"✅ Hardware key exported to: {export_file}")
    print(f"   Address: {export_data['address']}")
    print(f"   Camera ID: {export_data['cameraId']}")
    
except Exception as e:
    print(f"❌ Error exporting key: {e}")
    sys.exit(1)

