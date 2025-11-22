import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'
import axios from 'axios'
import './OwnerDashboard.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'

function OwnerDashboard() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { address, isConnected } = useAccount()
  const [sessionSigner, setSessionSigner] = useState(null)
  const [signerAddress, setSignerAddress] = useState(null)
  const [status, setStatus] = useState('')
  const [mintStatus, setMintStatus] = useState('')
  const [ipfsHash, setIpfsHash] = useState('')
  const [imageHash, setImageHash] = useState('')
  const [signature, setSignature] = useState('')
  const [maxEditions, setMaxEditions] = useState(10)

  useEffect(() => {
    if (authenticated && wallets.length > 0 && !sessionSigner) {
    }
  }, [authenticated, wallets, sessionSigner])

  const setupSessionSigner = async () => {
    try {
      setStatus('Setting up session signer...')
      
      const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0]
      if (!wallet) {
        setStatus('No wallet found. Please connect a wallet.')
        return
      }

      const walletAddress = wallet.address || address
      if (!walletAddress) {
        setStatus('❌ No wallet address available')
        return
      }

      const response = await axios.post(`${BACKEND_URL}/api/privy/create-session-signer`, {
        walletAddress: walletAddress,
        userId: user?.id || 'unknown'
      })

      if (response.data.success) {
        setSessionSigner(response.data.sessionSigner)
        setSignerAddress(response.data.signerAddress)
        setStatus('✅ Session signer created successfully')
      }
    } catch (error) {
      console.error('Error setting up session signer:', error)
      setStatus(`❌ Error: ${error.response?.data?.error || error.message}`)
    }
  }

  const handleMint = async (ipfsHash, imageHash, signature, maxEditions) => {
    try {
      if (!sessionSigner?.id) {
        setMintStatus('❌ Please setup session signer first')
        return
      }

      if (!address) {
        setMintStatus('❌ No wallet address available')
        return
      }

      setMintStatus('Minting NFT...')
      
      const response = await axios.post(`${BACKEND_URL}/api/privy/mint-with-signer`, {
        recipient: address,
        ipfsHash,
        imageHash,
        signature,
        maxEditions,
        sessionSignerId: sessionSigner.id
      })

      if (response.data.success) {
        setMintStatus(`✅ Minted successfully! TX: ${response.data.txHash}`)
      }
    } catch (error) {
      console.error('Error minting:', error)
      setMintStatus(`❌ Error: ${error.response?.data?.error || error.message}`)
    }
  }

  if (!ready) {
    return (
      <div className="container">
        <div className="card">
          <h1>Loading...</h1>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="container">
        <div className="card">
          <h1>🔐 LensMint Owner Portal</h1>
          <p>Login to manage your LensMint camera system</p>
          {PRIVY_APP_ID === 'your-privy-app-id' && (
            <div className="warning-message">
              ⚠️ Please configure VITE_PRIVY_APP_ID in .env file
            </div>
          )}
          <button onClick={login} className="login-button" disabled={PRIVY_APP_ID === 'your-privy-app-id'}>
            Login with Privy
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1>🎨 LensMint Owner Portal</h1>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </div>

        <div className="section">
          <h2>Account Info</h2>
            <div className="info-grid">
              <div>
                <strong>User ID:</strong> {user?.id || 'N/A'}
              </div>
              <div>
                <strong>Wallet Address:</strong> {address || wallets[0]?.address || 'No wallet'}
              </div>
              <div>
                <strong>Connected:</strong> {isConnected ? '✅' : '❌'}
              </div>
              <div>
                <strong>Wallets:</strong> {wallets.length}
              </div>
            </div>
        </div>

        {sessionSigner && (
          <div className="section">
            <h2>Session Signer</h2>
            <div className="info-grid">
              <div>
                <strong>Signer ID:</strong> {sessionSigner.id}
              </div>
              <div>
                <strong>Signer Address:</strong> {signerAddress}
              </div>
              <div>
                <strong>Status:</strong> {status}
              </div>
            </div>
          </div>
        )}

        <div className="section">
          <h2>Actions</h2>
          <div className="actions">
            {!sessionSigner && (
              <button onClick={setupSessionSigner} className="action-button">
                Setup Session Signer
              </button>
            )}
            {sessionSigner && (
              <div className="mint-form">
                <input 
                  type="text" 
                  placeholder="IPFS Hash" 
                  value={ipfsHash}
                  onChange={(e) => setIpfsHash(e.target.value)}
                  className="input-field" 
                />
                <input 
                  type="text" 
                  placeholder="Image Hash" 
                  value={imageHash}
                  onChange={(e) => setImageHash(e.target.value)}
                  className="input-field" 
                />
                <input 
                  type="text" 
                  placeholder="Signature" 
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="input-field" 
                />
                <input 
                  type="number" 
                  placeholder="Max Editions" 
                  value={maxEditions}
                  onChange={(e) => setMaxEditions(parseInt(e.target.value) || 10)}
                  className="input-field" 
                />
                <button 
                  onClick={() => {
                    if (ipfsHash && imageHash && signature) {
                      handleMint(ipfsHash, imageHash, signature, maxEditions)
                    } else {
                      setMintStatus('❌ Please fill all fields')
                    }
                  }} 
                  className="action-button primary"
                >
                  Mint NFT
                </button>
              </div>
            )}
          </div>
          {mintStatus && (
            <div className="status-message">{mintStatus}</div>
          )}
        </div>

        <div className="section">
          <h2>Gas Sponsorship</h2>
          <p className="info-text">
            ✅ Gas fees are automatically sponsored through Privy. 
            Transactions will be executed without requiring ETH balance.
          </p>
        </div>
      </div>
    </div>
  )
}

export default OwnerDashboard

