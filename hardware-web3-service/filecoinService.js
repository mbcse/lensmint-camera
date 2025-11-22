import { ethers } from 'ethers';
import { Synapse, RPC_URLS, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import fs from 'fs';

class FilecoinService {
  constructor() {
    this.synapse = null;
    this.initialized = false;
    this.network = process.env.FILECOIN_NETWORK || 'calibration';
    this.wallet = null;
  }

  async initialize(deviceWallet) {
    try {
      if (!deviceWallet) {
        console.warn('⚠️ Device wallet not provided. Filecoin features disabled.');
        this.initialized = false;
        return false;
      }

      this.wallet = deviceWallet;

      const rpcURL = process.env.FILECOIN_RPC_URL || 
        (this.network === 'calibration' ? RPC_URLS.calibration.http : RPC_URLS.mainnet.http);

      console.log(`🔗 Initializing Filecoin Synapse SDK (${this.network})...`);

      this.synapse = await Synapse.create({
        privateKey: deviceWallet.privateKey,
        rpcURL: rpcURL
      });

      if (!this.synapse || !this.synapse.storage || typeof this.synapse.storage.createContext !== 'function') {
        throw new Error('Failed to create Synapse instance or storage API not available');
      }

      this.initialized = true;
      console.log(`✅ Filecoin service initialized`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Filecoin service:', error);
      this.initialized = false;
      return false;
    }
  }

  async getUSDFCBalance() {
    if (!this.initialized || !this.synapse) {
      throw new Error('Filecoin service not initialized');
    }

    const balance = await this.synapse.payments.walletBalance(TOKENS.USDFC);
    return parseFloat(ethers.formatUnits(balance, 18));
  }

  async ensurePaymentSetup() {
    if (!this.initialized || !this.synapse) {
      throw new Error('Filecoin service not initialized');
    }

    // Check if payment is already set up using accountInfo() method
    try {
      if (this.synapse.payments && typeof this.synapse.payments.accountInfo === 'function') {
        const accountInfo = await this.synapse.payments.accountInfo(TOKENS.USDFC);
        if (accountInfo.funds > 0n) {
          console.log(`   ✅ Payment already set up. Total deposit: ${ethers.formatUnits(accountInfo.funds, 18)} USDFC, Available: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);
          return true;
        }
      } else if (this.synapse.payments && typeof this.synapse.payments.balance === 'function') {
        const depositBalance = await this.synapse.payments.balance(TOKENS.USDFC);
        if (depositBalance > 0n) {
          console.log(`   ✅ Payment already set up. Available: ${ethers.formatUnits(depositBalance, 18)} USDFC`);
          return true;
        }
      }
    } catch (error) {
      console.log(`   ℹ️  Could not check deposit balance, proceeding with setup...`);
    }

    // Payment not set up, need to deposit and approve
    // Check wallet balance first
    try {
      if (this.synapse.payments && typeof this.synapse.payments.walletBalance === 'function') {
        const walletBalance = await this.synapse.payments.walletBalance(TOKENS.USDFC);
        const depositAmount = ethers.parseUnits('2.5', 18);
        
        console.log(`   💰 Wallet USDFC balance: ${ethers.formatUnits(walletBalance, 18)} USDFC`);
        console.log(`   💰 Required deposit: ${ethers.formatUnits(depositAmount, 18)} USDFC`);
        
        if (walletBalance < depositAmount) {
          throw new Error(`Insufficient USDFC balance. Need at least 2.5 USDFC, have ${ethers.formatUnits(walletBalance, 18)}`);
        }
      }
    } catch (error) {
      if (error.message?.includes('Insufficient')) {
        throw error;
      }
    }

    // Try to deposit and approve
    try {
      const depositAmount = ethers.parseUnits('2.5', 18);
      console.log(`   💰 Setting up payment: depositing ${ethers.formatUnits(depositAmount, 18)} USDFC...`);
      
      if (!this.synapse.payments || typeof this.synapse.payments.depositWithPermitAndApproveOperator !== 'function') {
        throw new Error('Payment API not available on Synapse instance');
      }
      
      const tx = await this.synapse.payments.depositWithPermitAndApproveOperator(
        depositAmount,
        this.synapse.getWarmStorageAddress(),
        ethers.MaxUint256,
        ethers.MaxUint256,
        TIME_CONSTANTS.EPOCHS_PER_MONTH,
        TOKENS.USDFC
      );

      console.log(`   ⏳ Waiting for transaction confirmation...`);
      await tx.wait();
      console.log(`   ✅ Payment setup completed`);
      
      // Wait for payment to propagate on-chain
      console.log(`   ⏳ Waiting for payment to propagate (3s)...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify deposit was successful
      try {
        if (this.synapse.payments && typeof this.synapse.payments.accountInfo === 'function') {
          const accountInfo = await this.synapse.payments.accountInfo(TOKENS.USDFC);
          console.log(`   ✅ Verified deposit: ${ethers.formatUnits(accountInfo.funds, 18)} USDFC`);
        }
      } catch (e) {
        // Ignore verification errors
      }
      
      return true;
    } catch (error) {
      if (error.message?.includes('insufficient') || error.message?.includes('Insufficient')) {
        throw new Error(`Insufficient USDFC balance. Need at least 2.5 USDFC`);
      }
      throw error;
    }
  }

  async uploadImage(imageData, retries = 3) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }
    
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let fileData;
        if (Buffer.isBuffer(imageData)) {
          fileData = imageData;
        } else {
          fileData = fs.readFileSync(imageData);
        }

        const dataToUpload = Buffer.isBuffer(fileData) 
          ? new Uint8Array(fileData.buffer, fileData.byteOffset, fileData.byteLength)
          : new Uint8Array(fileData);

        if (!this.synapse) {
          throw new Error('Synapse SDK not initialized');
        }

        await this.ensurePaymentSetup();
        
        try {
          if (this.synapse.payments && typeof this.synapse.payments.accountInfo === 'function') {
            const accountInfo = await this.synapse.payments.accountInfo(TOKENS.USDFC);
            console.log(`   📊 Account info - Funds: ${ethers.formatUnits(accountInfo.funds, 18)} USDFC, Available: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);
            
            if (accountInfo.funds === 0n) {
              throw new Error('No funds deposited in payments contract');
            }
            
            if (accountInfo.availableFunds === 0n) {
              console.warn(`   ⚠️  All funds are locked up. Available: 0 USDFC`);
            }
          }
          
          if (this.synapse.payments && typeof this.synapse.payments.serviceApproval === 'function') {
            const warmStorageAddress = this.synapse.getWarmStorageAddress();
            const approval = await this.synapse.payments.serviceApproval(warmStorageAddress, TOKENS.USDFC);
            console.log(`   📊 Service approval - Approved: ${approval.isApproved}, Rate allowance: ${ethers.formatUnits(approval.rateAllowance, 18)}`);
            
            if (!approval.isApproved) {
              console.warn(`   ⚠️  Warm Storage service is not approved. Upload may fail.`);
            }
          }
        } catch (checkError) {
          console.warn(`   ⚠️  Could not verify account/service info: ${checkError.message}`);
        }
        
        const result = await this.synapse.storage.upload(dataToUpload);

        console.log(`   ✅ Upload result: ${result}`);
        
        const pieceCid = result?.pieceCid;
        if (!pieceCid) {
          throw new Error('Upload succeeded but no PieceCID returned');
        }
        
        return pieceCid.toString();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          const delay = attempt * 1000;
          console.warn(`   ⚠️ Upload attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ Filecoin upload failed after ${retries} attempts: ${error}`);
          throw error;
        }
      }
    }
  }

  async uploadMetadata(metadata) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }

    const metadataJson = JSON.stringify(metadata);
    const metadataBytes = new TextEncoder().encode(metadataJson);
    
    try {
      if (!this.synapse) {
        throw new Error('Synapse SDK not initialized');
      }

      await this.ensurePaymentSetup();
      
      try {
        if (this.synapse.payments && typeof this.synapse.payments.accountInfo === 'function') {
          const accountInfo = await this.synapse.payments.accountInfo(TOKENS.USDFC);
          console.log(`   📊 Account info - Funds: ${ethers.formatUnits(accountInfo.funds, 18)} USDFC, Available: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);
          
          if (accountInfo.funds === 0n) {
            throw new Error('No funds deposited in payments contract');
          }
          
          if (accountInfo.availableFunds === 0n) {
            console.warn(`   ⚠️  All funds are locked up. Available: 0 USDFC`);
          }
        }
        
        if (this.synapse.payments && typeof this.synapse.payments.serviceApproval === 'function') {
          const warmStorageAddress = this.synapse.getWarmStorageAddress();
          const approval = await this.synapse.payments.serviceApproval(warmStorageAddress, TOKENS.USDFC);
          console.log(`   📊 Service approval - Approved: ${approval.isApproved}, Rate allowance: ${ethers.formatUnits(approval.rateAllowance, 18)}`);
          
          if (!approval.isApproved) {
            console.warn(`   ⚠️  Warm Storage service is not approved. Upload may fail.`);
          }
        }
      } catch (checkError) {
        console.warn(`   ⚠️  Could not verify account/service info: ${checkError.message}`);
      }
      
      const result = await this.synapse.storage.upload(metadataBytes);
      
      const pieceCid = result?.pieceCid;
      if (!pieceCid) {
        throw new Error('Metadata upload succeeded but no PieceCID returned');
      }

      return pieceCid.toString();
    } catch (error) {
      console.error(`❌ Filecoin metadata upload error: ${error.message}`);
      throw error;
    }
  }

  async retrieveFile(pieceCid) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }

    if (!this.synapse) {
      throw new Error('Synapse SDK not initialized');
    }

    const bytes = await this.synapse.download(pieceCid);
    return Buffer.from(bytes);
  }

  async getStatus() {
    if (!this.initialized) {
      return {
        connected: false,
        message: 'Filecoin service not initialized'
      };
    }

    try {
      if (!this.synapse) {
        return {
          connected: false,
          message: 'Synapse SDK not available'
        };
      }

      const balance = await this.synapse.payments.walletBalance(TOKENS.USDFC);
      const balanceUsdfc = parseFloat(ethers.formatUnits(balance, 18));

      return {
        connected: true,
        address: this.wallet.address,
        balance: balanceUsdfc,
        balanceWei: balance.toString(),
        network: this.network
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  createMetadata(imageData) {
    const {
      name,
      description,
      imageCid,
      deviceAddress,
      deviceId,
      cameraId,
      imageHash,
      signature,
      timestamp
    } = imageData;

    return {
      name: name || `LensMint Photo #${Date.now()}`,
      description: description || 'Captured by LensMint Camera',
      image: `ipfs://${imageCid}`,
      attributes: [
        {
          trait_type: 'Device Address',
          value: deviceAddress
        },
        {
          trait_type: 'Device ID',
          value: deviceId
        },
        {
          trait_type: 'Camera ID',
          value: cameraId
        },
        {
          trait_type: 'Image Hash',
          value: `sha256:${imageHash}`
        },
        {
          trait_type: 'Hardware Signature',
          value: signature
        },
        {
          trait_type: 'Timestamp',
          value: timestamp || new Date().toISOString()
        }
      ],
      properties: {
        device: {
          address: deviceAddress,
          deviceId: deviceId,
          cameraId: cameraId
        },
        image: {
          hash: imageHash,
          signature: signature,
          filecoinCid: imageCid
        }
      }
    };
  }
}

const filecoinService = new FilecoinService();

export default filecoinService;
