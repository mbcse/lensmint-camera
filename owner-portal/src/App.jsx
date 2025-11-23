import { PrivyProvider } from '@privy-io/react-auth'
import { createPrivyWagmiConfig } from '@privy-io/wagmi'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sepolia } from 'wagmi/chains'
import OwnerDashboard from './components/OwnerDashboard'

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'
const queryClient = new QueryClient()
const wagmiConfig = createPrivyWagmiConfig({
  chains: [sepolia],
})

function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email', 'sms'],
        appearance: {
          theme: 'light',
          accentColor: '#667eea',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <OwnerDashboard />
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  )
}

export default App

