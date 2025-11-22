import { createWalletClient, createPublicClient, http, decodeErrorResult, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

interface ProofData {
  success: boolean;
  data?: {
    zkProof?: string;
    journalDataAbi?: string;
  };
  zkProof?: string;
  journalDataAbi?: string;
}

// LensMintVerifier ABI
const contractABI = [
  {
    inputs: [
      { name: 'claimId', type: 'string' },
      { name: 'journalData', type: 'bytes' },
      { name: 'seal', type: 'bytes' }
    ],
    name: 'submitMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'claimId', type: 'string' }],
    name: 'getVerifiedMetadata',
    outputs: [
      {
        components: [
          { name: 'signature', type: 'string' },
          { name: 'deviceAddress', type: 'string' },
          { name: 'deviceId', type: 'string' },
          { name: 'imageHash', type: 'string' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'filecoinCid', type: 'string' },
          { name: 'cameraId', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'verified', type: 'bool' }
        ],
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // Custom errors
  { name: 'InvalidNotaryKeyFingerprint', type: 'error', inputs: [] },
  { name: 'InvalidQueriesHash', type: 'error', inputs: [] },
  { name: 'InvalidUrl', type: 'error', inputs: [] },
  { name: 'InvalidMetadata', type: 'error', inputs: [] },
  { name: 'ZKProofVerificationFailed', type: 'error', inputs: [] },
] as const;

function getRevertData(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const top = err as Record<string, unknown>;
    if (typeof top.data === 'string') return top.data;
    if (typeof top.cause === 'object' && top.cause !== null) {
      const cause = top.cause as Record<string, unknown>;
      if (typeof cause.data === 'string') return cause.data;
    }
  }
  return undefined;
}

async function submitProof(claimId: string, proofFile: string, contractAddress: Address) {
  console.log(`\n=== Submitting ZK Proof for Claim: ${claimId} ===\n`);

  const rpcUrl = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL or SEPOLIA_RPC_URL not set');
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set');
  }

  const account = privateKeyToAccount(privateKey as Hex);
  console.log(`Wallet: ${account.address}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`RPC: ${rpcUrl}`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  // Load proof data
  const proofPath = path.resolve(proofFile);
  if (!fs.existsSync(proofPath)) {
    throw new Error(`Proof file not found: ${proofPath}`);
  }

  const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8')) as ProofData;
  const zkProof = proofData.data?.zkProof || proofData.zkProof;
  const journalDataAbi = proofData.data?.journalDataAbi || proofData.journalDataAbi;

  if (!zkProof || !journalDataAbi) {
    throw new Error('Invalid proof file: missing zkProof or journalDataAbi');
  }

  console.log(`\nProof Details:`);
  console.log(`  ZK Proof length: ${zkProof.length} chars`);
  console.log(`  Journal Data length: ${journalDataAbi.length} chars`);

  // Simulate transaction
  console.log(`\nSimulating transaction...`);
  try {
    await publicClient.simulateContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'submitMetadata',
      args: [claimId, journalDataAbi as Hex, zkProof as Hex],
      account: account.address,
    });
    console.log(`✓ Simulation successful`);
  } catch (error) {
    const revertData = getRevertData(error);
    if (revertData) {
      try {
        const decoded = decodeErrorResult({ abi: contractABI, data: revertData as Hex });
        console.error(`✗ Simulation failed: ${decoded.errorName}`);
      } catch {
        console.error(`✗ Simulation failed:`, (error as Error).message);
      }
    } else {
      console.error(`✗ Simulation failed:`, (error as Error).message);
    }
    throw error;
  }

  // Submit transaction
  console.log(`\nSubmitting transaction...`);
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'submitMetadata',
    args: [claimId, journalDataAbi as Hex, zkProof as Hex],
  });

  console.log(`\nTransaction submitted: ${hash}`);
  console.log(`Waiting for confirmation...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`\n✓ Transaction confirmed!`);
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);
  console.log(`  Status: ${receipt.status}`);
  console.log(`\nView on Etherscan: https://sepolia.etherscan.io/tx/${hash}`);

  return {
    transactionHash: hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(`
Usage: tsx scripts/submitProof.ts <claimId> <proofFile> <contractAddress>

Example:
  tsx scripts/submitProof.ts 275862cb-326e-4866-9b38-680d1816499e proof.json 0x0b693F079939c6C6A08AAd4cEAfbcd2cF2FdcCAc
`);
    process.exit(1);
  }

  const [claimId, proofFile, contractAddress] = args;

  try {
    await submitProof(claimId, proofFile, contractAddress as Address);
    console.log(`\n=== Submission Complete ===`);
  } catch (error) {
    console.error(`\n✗ Error:`, (error as Error).message);
    process.exit(1);
  }
}

main();

