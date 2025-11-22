import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeploymentService {
  constructor() {
    this.deployment = null;
    this.deploymentPath = null;
  }

  loadDeployment() {
    // Try multiple possible paths for deployment.json
    const possiblePaths = [
      path.join(__dirname, 'deployment.json'),
      process.env.DEPLOYMENT_JSON_PATH ? path.resolve(process.env.DEPLOYMENT_JSON_PATH) : null,
      path.join(__dirname, '../contracts/deployment.json'),
      path.join(__dirname, '../../deployment.json')
    ].filter(Boolean);

    for (const deploymentPath of possiblePaths) {
      try {
        if (fs.existsSync(deploymentPath)) {
          const content = fs.readFileSync(deploymentPath, 'utf8');
          this.deployment = JSON.parse(content);
          this.deploymentPath = deploymentPath;
          console.log(`✅ Loaded deployment from: ${deploymentPath}`);
          return true;
        }
      } catch (error) {
        console.warn(`⚠️  Could not load deployment from ${deploymentPath}:`, error.message);
      }
    }

    return false;
  }

  getContractAddress(contractName) {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    const contract = this.deployment.contracts?.[contractName];
    return contract?.address || null;
  }

  getContractABI(contractName) {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    const contract = this.deployment.contracts?.[contractName];
    return contract?.abi || null;
  }

  getDeployment() {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    return this.deployment;
  }

  getNetwork() {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    return {
      network: this.deployment.network,
      chainId: this.deployment.chainId
    };
  }

  isLoaded() {
    return this.deployment !== null;
  }

  getDeviceRegistryAddress() {
    return this.getContractAddress('DeviceRegistry');
  }

  getLensMintAddress() {
    return this.getContractAddress('LensMintERC1155');
  }

  getDeviceRegistryABI() {
    return this.getContractABI('DeviceRegistry');
  }

  getLensMintABI() {
    return this.getContractABI('LensMintERC1155');
  }
}

const deploymentService = new DeploymentService();

export default deploymentService;
