import { createContext, useContext, useState, useEffect, type ReactNode, type FC } from 'react';
import { ethers, type Eip1193Provider } from 'ethers';
import { useContract } from '../hooks/useContract';

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: 'accountsChanged' | 'chainChanged', handler: (...args: any[]) => void) => void;
      removeAllListeners?: (event: 'accountsChanged' | 'chainChanged') => void;
    };
  }
}

interface Web3ContextType {
  account: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  contract: ReturnType<typeof useContract>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within Web3Provider');
  }
  return context;
};

interface Web3ProviderProps {
  children: ReactNode;
}

export const Web3Provider: FC<Web3ProviderProps> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contract = useContract(provider || undefined, signer || undefined);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install MetaMask to use this application.');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      const browserProvider = new ethers.BrowserProvider(window.ethereum as Eip1193Provider);
      await browserProvider.send("eth_requestAccounts", []);

      const web3Signer = await browserProvider.getSigner();
      const address = await web3Signer.getAddress();
      const network = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setSigner(web3Signer);
      setAccount(address);
      setChainId(Number(network.chainId));
    } catch (err: unknown) {
      console.error('Error connecting wallet:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setError(null);
  };

  useEffect(() => {
    if (window.ethereum) {
      const ethereum = window.ethereum as Eip1193Provider & {
        on?: (event: 'accountsChanged' | 'chainChanged', handler: (...args: any[]) => void) => void;
        removeAllListeners?: (event: 'accountsChanged' | 'chainChanged') => void;
      };
      // Handle account changes
      ethereum.on?.('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          disconnectWallet();
        }
      });

      // Handle chain changes
      ethereum.on?.('chainChanged', (newChainId: string) => {
        setChainId(parseInt(newChainId, 16));
        window.location.reload();
      });

      // Cleanup listeners
      return () => {
        if (window.ethereum) {
          const ethereum = window.ethereum as Eip1193Provider & {
            on?: (event: 'accountsChanged' | 'chainChanged', handler: (...args: any[]) => void) => void;
            removeAllListeners?: (event: 'accountsChanged' | 'chainChanged') => void;
          };
          ethereum.removeAllListeners?.('accountsChanged');
          ethereum.removeAllListeners?.('chainChanged');
        }
      };
    }
  }, []);

  const value: Web3ContextType = {
    account,
    provider,
    signer,
    chainId,
    isConnecting,
    error,
    contract,
    connectWallet,
    disconnectWallet,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};
