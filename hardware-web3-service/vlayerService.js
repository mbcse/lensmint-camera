import { decodeAbiParameters } from 'viem';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const WEB_PROVER_API_CLIENT_ID = process.env.WEB_PROVER_API_CLIENT_ID;
const WEB_PROVER_API_SECRET = process.env.WEB_PROVER_API_SECRET;
const ZK_PROVER_API_URL = process.env.ZK_PROVER_API_URL || 'https://zk-prover.vlayer.xyz/api/v0';
const CLAIM_SERVER_URL = process.env.CLAIM_SERVER_URL || 'https://lensmint.onrender.com';

if (!WEB_PROVER_API_CLIENT_ID || !WEB_PROVER_API_SECRET) {
  throw new Error('WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET must be set in environment variables');
}
export async function generateProof(claimId) {
  try {
    // Construct metadata URL for proof generation
    const metadataUrl = `${CLAIM_SERVER_URL}/api/metadata/${claimId}`;
    
    console.log(`🔐 [VLAYER] Generating proof for claim: ${claimId}`);
    console.log(`   📍 Metadata URL: ${metadataUrl}`);

    const response = await fetch('https://web-prover.vlayer.xyz/api/v1/prove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': WEB_PROVER_API_CLIENT_ID,
        'Authorization': 'Bearer ' + WEB_PROVER_API_SECRET,
      },
      body: JSON.stringify({
        url: metadataUrl,
        headers: []
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Web prover API error: ${response.status} - ${errorText}`);
    }

    const presentation = await response.json();
    console.log('✅ Initial web proof response received');

    if (!presentation || !presentation.data) {
      throw new Error('No presentation data found in response');
    }

    const extractConfig = {
      "response.body": {
        "jmespath": [
          "properties.signature",
          "properties.deviceAddress",
          "properties.deviceId",
          "properties.imageHash",
          "properties.tokenId",
          "properties.filecoinCid",
          "properties.cameraId"
        ]
      }
    };

    const requestBody = {
      presentation,
      extraction: extractConfig
    };

    console.log('🔐 Compressing web proof and extracting metadata fields...');
    console.log('Extract config:', JSON.stringify(extractConfig, null, 2));

    const compressResponse = await fetch(`${ZK_PROVER_API_URL}/compress-web-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': WEB_PROVER_API_CLIENT_ID,
        'Authorization': 'Bearer ' + WEB_PROVER_API_SECRET,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(85000)
    });

    if (!compressResponse.ok) {
      const errorText = await compressResponse.text();
      console.error('ZK Prover API error response:', errorText);
      throw new Error(`HTTP error! status: ${compressResponse.status} - ${errorText}`);
    }

    const compressedData = await compressResponse.json();

    console.log('=== ZK PROOF COMPRESSION RESPONSE ===');
    console.log('Response status:', compressResponse.status);
    console.log('Response data:', JSON.stringify(compressedData, null, 2));
    console.log('=== END ZK PROOF RESPONSE ===');

    try {
      const journalDataAbi = compressedData.data.journalDataAbi;
      console.log('\n=== DECODING EXTRACTED DATA ===');
      
      const decoded = decodeAbiParameters(
        [
          { type: 'bytes32' },
          { type: 'string' },
          { type: 'string' },
          { type: 'uint256' },
          { type: 'bytes32' },
          { type: 'string' }
        ],
        journalDataAbi
      );
      
      const [notaryKeyFingerprint, method, url, timestamp, queriesHash, extractedData] = decoded;
      
      console.log('Decoded values:');
      console.log('  Notary Key Fingerprint:', notaryKeyFingerprint);
      console.log('  Method:', method);
      console.log('  URL:', url);
      console.log('  Timestamp:', timestamp.toString(), `(${new Date(Number(timestamp) * 1000).toISOString()})`);
      console.log('  Queries Hash:', queriesHash);
      console.log('  Extracted Data:', extractedData);
      console.log('=== END DECODING ===\n');
    } catch (error) {
      console.error('Error decoding journalDataAbi:', error.message);
      console.log('Could not decode extracted data, but proof was generated successfully.');
    }

    const proofData = {
      success: compressedData.success,
      data: {
        zkProof: compressedData.data.zkProof,
        journalDataAbi: compressedData.data.journalDataAbi
      }
    };

    console.log(`✅ Proof generated successfully for claim: ${claimId}`);
    
    return proofData;

  } catch (error) {
    console.error(`❌ Error generating proof for claim ${claimId}:`, error);
    throw error;
  }
}

export async function submitProofOnChain(claimId, zkProof, journalDataAbi, deviceWallet = null) {
  try {
    const verifierAddress = process.env.VERIFIER_CONTRACT_ADDRESS;
    const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;

    if (!verifierAddress) {
      throw new Error('VERIFIER_CONTRACT_ADDRESS must be set in environment variables');
    }

    if (!rpcUrl) {
      throw new Error('RPC_URL or SEPOLIA_RPC_URL not set');
    }

    console.log(`🔗 [VLAYER] Submitting proof on-chain for claim: ${claimId}`);
    console.log(`   📍 Verifier Contract: ${verifierAddress}`);

    let wallet;
    if (deviceWallet) {
      wallet = deviceWallet;
      console.log(`   🔑 Using device wallet: ${wallet.address}`);
    } else {
      const devicePrivateKey = process.env.DEVICE_PRIVATE_KEY;
      if (!devicePrivateKey) {
        throw new Error('Device wallet not available. Ensure DEVICE_PRIVATE_KEY is set or pass deviceWallet parameter.');
      }
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      wallet = new ethers.Wallet(devicePrivateKey, provider);
      console.log(`   🔑 Using device wallet from DEVICE_PRIVATE_KEY: ${wallet.address}`);
    }

    const verifierABI = [
      "function submitMetadata(string memory claimId, bytes calldata journalData, bytes calldata seal) external",
      "function getVerifiedMetadata(string memory claimId) external view returns (tuple(string signature, string deviceAddress, string deviceId, string imageHash, uint256 tokenId, string filecoinCid, string cameraId, uint256 timestamp, bool verified))",
      "error InvalidNotaryKeyFingerprint()",
      "error InvalidQueriesHash()",
      "error InvalidUrl()",
      "error InvalidMetadata()",
      "error ZKProofVerificationFailed()"
    ];

    const verifierContract = new ethers.Contract(verifierAddress, verifierABI, wallet);

    const sealBytes = ethers.getBytes(zkProof);
    const journalDataBytes = ethers.getBytes(journalDataAbi);

    console.log(`   📝 Seal length: ${sealBytes.length} bytes`);
    console.log(`   📝 Journal data length: ${journalDataBytes.length} bytes`);

    try {
      const gasEstimate = await verifierContract.submitMetadata.estimateGas(
        claimId,
        journalDataBytes,
        sealBytes
      );
      console.log(`   ⛽ Estimated gas: ${gasEstimate.toString()}`);
    } catch (estimateError) {
      console.warn(`   ⚠️ Gas estimation failed: ${estimateError.message}`);
    }

    console.log(`   📤 Submitting transaction...`);
    const tx = await verifierContract.submitMetadata(
      claimId,
      journalDataBytes,
      sealBytes,
      { gasLimit: 5000000 }
    );

    console.log(`   ✅ Transaction submitted: ${tx.hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();

    console.log(`   ✅ Transaction confirmed!`);
    console.log(`      Block: ${receipt.blockNumber}`);
    console.log(`      Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`      Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);

    if (receipt.status === 1) {
      console.log(`   🎉 Proof verified and stored on-chain!`);
      console.log(`   🔗 View on Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`);
    } else {
      throw new Error('Transaction failed');
    }

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status === 1 ? 'verified' : 'failed'
    };

  } catch (error) {
    console.error(`❌ Error submitting proof on-chain for claim ${claimId}:`, error);
    
    if (error.data) {
      try {
        const verifierABI = [
          "error InvalidNotaryKeyFingerprint()",
          "error InvalidQueriesHash()",
          "error InvalidUrl()",
          "error InvalidMetadata()",
          "error ZKProofVerificationFailed()"
        ];
        const iface = new ethers.Interface(verifierABI);
        const decoded = iface.parseError(error.data);
        console.error(`   📋 Contract error: ${decoded.name}`);
      } catch (e) {
      }
    }
    
    throw error;
  }
}

