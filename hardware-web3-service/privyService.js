import axios from 'axios';

class PrivyService {
  constructor() {
    this.appId = null;
    this.appSecret = null;
    this.initialized = false;
    this.apiBase = 'https://api.privy.io/v1';
  }

  initialize() {
    try {
      this.appId = process.env.PRIVY_APP_ID;
      this.appSecret = process.env.PRIVY_APP_SECRET;

      if (!this.appId || !this.appSecret) {
        console.warn('⚠️ Privy credentials not set. Privy features disabled.');
        return false;
      }

      this.initialized = true;
      console.log('✅ Privy service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Privy service:', error);
      this.initialized = false;
      return false;
    }
  }

  async createSessionSigner(walletAddress, userId) {
    if (!this.initialized) {
      throw new Error('Privy service not initialized');
    }

    try {
      // Create session signer via Privy API
      // This allows the backend to sign transactions on behalf of the user
      const response = await axios.post(
        `${this.apiBase}/apps/${this.appId}/session-signers`,
        {
          walletAddress,
          userId,
          permissions: ['mint', 'transfer'],
          expiresIn: 86400 * 30 // 30 days
        },
        {
          headers: {
            'Authorization': `Bearer ${this.appSecret}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        id: response.data.id,
        address: response.data.address,
        permissions: response.data.permissions
      };
    } catch (error) {
      console.error('Error creating session signer:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to create session signer');
    }
  }

  async sendTransaction(sessionSignerId, transaction) {
    if (!this.initialized) {
      throw new Error('Privy service not initialized');
    }

    try {
      // Send transaction with gas sponsorship via Privy API
      const response = await axios.post(
        `${this.apiBase}/apps/${this.appId}/session-signers/${sessionSignerId}/transactions`,
        {
          ...transaction,
          gasSponsorship: {
            enabled: true,
            policy: 'sponsor-all' // Sponsor all gas fees
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.appSecret}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        txHash: response.data.hash,
        blockNumber: response.data.blockNumber
      };
    } catch (error) {
      console.error('Error sending transaction:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to send transaction');
    }
  }

  async getSessionSigner(sessionSignerId) {
    if (!this.initialized) {
      throw new Error('Privy service not initialized');
    }

    try {
      const response = await axios.get(
        `${this.apiBase}/apps/${this.appId}/session-signers/${sessionSignerId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.appSecret}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting session signer:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to get session signer');
    }
  }
}

const privyService = new PrivyService();
export default privyService;

