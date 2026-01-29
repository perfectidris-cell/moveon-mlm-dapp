import React, { useState, useEffect } from 'react';
import { ethers, type Eip1193Provider } from 'ethers';

declare global {
    interface Window {
        ethereum?: Eip1193Provider & {
            on?: (event: 'accountsChanged' | 'chainChanged', handler: (...args: any[]) => void) => void;
            removeAllListeners?: (event: 'accountsChanged' | 'chainChanged') => void;
        };
    }
}

const WalletConnect: React.FC = () => {
    const [account, setAccount] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const connectWallet = async () => {
        if (!window.ethereum) {
            setError('MetaMask not installed');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const provider = new ethers.BrowserProvider(window.ethereum as Eip1193Provider);
            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();

            setAccount(address);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to connect wallet');
        } finally {
            setLoading(false);
        }
    };

    const disconnectWallet = () => {
        setAccount(null);
        setError(null);
    };

    useEffect(() => {
        if (window.ethereum) {
            const ethereum = window.ethereum as Eip1193Provider & {
                on?: (event: 'accountsChanged' | 'chainChanged', handler: (...args: any[]) => void) => void;
                removeAllListeners?: (event: 'accountsChanged' | 'chainChanged') => void;
            };
            ethereum.on?.('accountsChanged', (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                } else {
                    setAccount(null);
                }
            });

            ethereum.on?.('chainChanged', () => {
                window.location.reload();
            });
        }

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
    }, []);

    return (
        <div className="flex items-center gap-4">
            {account ? (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                        {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                    <button
                        onClick={disconnectWallet}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Disconnect
                    </button>
                </div>
            ) : (
                <button
                    onClick={connectWallet}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                    {loading ? 'Connecting...' : 'Connect Wallet'}
                </button>
            )}
            {error && <span className="text-red-500 text-sm">{error}</span>}
        </div>
    );
};

export default WalletConnect;