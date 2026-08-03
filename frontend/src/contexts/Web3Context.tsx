import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ethers } from 'ethers';
import { CRONOS_CHAIN_ID, CRONOS_NETWORK } from '../utils/config';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Web3ContextType {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  chainId: number | null;
  balance: string;
  isConnecting: boolean;
  isConnected: boolean;
  readOnlyProvider: ethers.AbstractProvider | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToCronos: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType>({
  provider: null, signer: null, address: null, chainId: null, balance: '0',
  isConnecting: false, isConnected: false, readOnlyProvider: null,
  connect: async () => {}, disconnect: () => {}, switchToCronos: async () => {},
});

export const useWeb3 = () => useContext(Web3Context);

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState('0');
  const [isConnecting, setIsConnecting] = useState(false);
  const hasRestoredRef = useRef(false);

  const readOnlyProvider = useMemo(() => {
    for (const url of CRONOS_NETWORK.rpcUrls) {
      try {
        const p = new ethers.JsonRpcProvider(url, CRONOS_CHAIN_ID, { staticNetwork: true });
        return p;
      } catch {}
    }
    return null;
  }, []);

  const fetchBalance = useCallback(async (prov: ethers.BrowserProvider, addr: string) => {
    try {
      const bal = await prov.getBalance(addr);
      setBalance(ethers.formatEther(bal));
    } catch { setBalance('0'); }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    setIsConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);

      // Auto-switch to Cronos Testnet if not already
      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== CRONOS_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CRONOS_NETWORK.chainId }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [CRONOS_NETWORK],
            });
          }
        }
        // Reload provider after switch
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await newProvider.send('eth_requestAccounts', []);
        const ethSigner = await newProvider.getSigner();
        const newNetwork = await newProvider.getNetwork();
        setProvider(newProvider);
        setSigner(ethSigner);
        setAddress(accounts[0]);
        setChainId(Number(newNetwork.chainId));
        await fetchBalance(newProvider, accounts[0]);
        setIsConnecting(false);
        return;
      }

      const accounts = await browserProvider.send('eth_requestAccounts', []);
      const ethSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(ethSigner);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
      await fetchBalance(browserProvider, accounts[0]);
    } catch (err) {
      console.error('Connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [fetchBalance]);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setBalance('0');
  }, []);

  const switchToCronos = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CRONOS_NETWORK.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [CRONOS_NETWORK],
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const ethereum = window.ethereum;
    ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts.length > 0) connect();
    }).catch(() => {});

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) { disconnect(); return; }
      setAddress(accounts[0]);
      if (provider) fetchBalance(provider, accounts[0]);
    };
    const handleChainChanged = () => { window.location.reload(); };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [connect, disconnect, provider, fetchBalance]);

  return (
    <Web3Context.Provider value={{
      provider, signer, address, chainId, balance,
      isConnecting, isConnected: !!address,
      readOnlyProvider, connect, disconnect, switchToCronos,
    }}>
      {children}
    </Web3Context.Provider>
  );
}
