'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserProvider } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { getContract, PlayerStats } from '@/lib/web3';

interface WalletContextType {
    isLoading: boolean;
    provider: BrowserProvider | null;
    address: string | null;
    isConnected: boolean;
    isRegistered: boolean;
    playerStats: PlayerStats | null;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    checkRegistration: () => Promise<void>;
    refreshPlayerStats: () => Promise<void>;
    retryRegistrationCheck: () => Promise<void>;
    switchToMorphNetwork: () => Promise<boolean>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const { ready, authenticated, user, login, logout } = usePrivy();
    const { wallets } = useWallets();

    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Add retry mechanism for registration checks
    const [registrationRetryCount, setRegistrationRetryCount] = useState(0);
    const maxRegistrationRetries = 3;

    // Get the wallet address from Privy
    const address = user?.wallet?.address || null;
    const isConnected = ready && authenticated && !!address;

    // Initialize provider when wallet is connected
    useEffect(() => {
        const initializeProvider = async () => {
            if (isConnected && wallets.length > 0) {
                try {
                    const wallet = wallets[0];
                    console.log('Initializing provider for wallet:', wallet.walletClientType);

                    // Get the Ethereum provider
                    const ethProvider = await wallet.getEthereumProvider();
                    console.log('Got Ethereum provider:', ethProvider);

                    // Check if provider is valid before creating BrowserProvider
                    if (ethProvider && typeof ethProvider === 'object' && 'request' in ethProvider) {
                        try {
                            // Create provider with ENS disabled since Morph doesn't support ENS
                            const ethersProvider = new BrowserProvider(ethProvider, {
                                // Disable ENS
                                name: 'Morph Holesky Testnet',
                                chainId: 2810,
                                // Set to empty string instead of null for type safety
                                ensAddress: ''  // Explicitly disable ENS
                            });

                            // Verify we're on the correct network
                            const network = await ethersProvider.getNetwork();
                            console.log('Connected to network:', network);

                            if (network.chainId !== BigInt(2810)) {
                                console.warn(`Connected to wrong network: ${network.chainId}. Expected: 2810`);
                                // Don't set provider if on wrong network
                                setProvider(null);
                                return;
                            }

                            console.log('Created Ethers provider successfully');
                            setProvider(ethersProvider);
                        } catch (providerError) {
                            console.error('Error creating BrowserProvider:', providerError);
                            setProvider(null);
                        }
                    } else {
                        console.warn('Invalid Ethereum provider received:', ethProvider);
                        setProvider(null);
                    }
                } catch (error) {
                    console.error('Error initializing provider:', error);
                    setProvider(null);
                }
            } else {
                console.log('Not connected or no wallets available');
                setProvider(null);
            }
        };

        initializeProvider();
    }, [isConnected, wallets]);

    const checkPlayerRegistration = useCallback(async (playerAddress: string) => {
        if (!provider) return;

        try {
            setIsLoading(true);

            // First, verify we're on the right network
            const network = await provider.getNetwork();
            if (network.chainId !== BigInt(2810)) {
                console.error(`Connected to wrong network: ${network.chainId}. Expected: 2810`);
                throw new Error(`Wrong network: ${network.chainId}. Please connect to Morph Holesky Testnet (2810)`);
            }

            // Get signer and then contract
            const signer = await provider.getSigner();
            const contract = getContract(provider);

            // Check if player is registered
            const isPlayerRegistered = await contract.registeredPlayers(playerAddress);

            console.log('Registration check for:', playerAddress, 'Result:', isPlayerRegistered);
            setIsRegistered(isPlayerRegistered);

            if (isPlayerRegistered) {
                await fetchPlayerStats(playerAddress);
                setRegistrationRetryCount(0);
            } else {
                setPlayerStats(null);
            }
        } catch (error) {
            console.error('Error checking player registration:', error);

            // Check if this is an ENS error
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('ENS') || errorMessage.includes('UNSUPPORTED_OPERATION')) {
                console.warn('ENS not supported on this network, continuing without ENS');
                // We can still try to continue, but with retry logic
            }

            if (registrationRetryCount < maxRegistrationRetries) {
                console.log(`Registration check failed, retrying... (${registrationRetryCount + 1}/${maxRegistrationRetries})`);
                setRegistrationRetryCount(prev => prev + 1);
                setTimeout(() => checkPlayerRegistration(playerAddress), 2000);
            } else {
                console.error('Max registration check retries reached');
                setIsRegistered(false);
                setPlayerStats(null);
            }
        } finally {
            setIsLoading(false);
        }
    }, [provider, registrationRetryCount, maxRegistrationRetries]);

    // Check registration status when address changes
    useEffect(() => {
        if (address && provider) {
            checkPlayerRegistration(address);
        } else {
            setIsRegistered(false);
            setPlayerStats(null);
            setRegistrationRetryCount(0);
        }
    }, [address, provider, checkPlayerRegistration]); const fetchPlayerStats = async (playerAddress: string) => {
        if (!provider) return;

        try {
            // Verify network before fetching stats
            const network = await provider.getNetwork();
            if (network.chainId !== BigInt(2810)) {
                console.error(`Connected to wrong network: ${network.chainId}. Expected: 2810`);
                throw new Error(`Wrong network: ${network.chainId}. Please connect to Morph Holesky Testnet (2810)`);
            }

            const contract = getContract(provider);
            const stats = await contract.getPlayerStats(playerAddress);

            const playerStatsFormatted: PlayerStats = {
                walksXp: stats.walksXp,
                healthScore: stats.healthScore,
                lastCheckin: Number(stats.lastCheckin),
                totalArtifacts: stats.totalArtifacts,
                currentColony: stats.currentColony,
                petsOwned: stats.petsOwned,
                grassTouchStreak: stats.grassTouchStreak
            };

            console.log('Player stats fetched:', playerStatsFormatted);
            setPlayerStats(playerStatsFormatted);
        } catch (error) {
            console.error('Error fetching player stats:', error);

            // Handle ENS errors specifically
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('ENS') || errorMessage.includes('UNSUPPORTED_OPERATION')) {
                console.warn('ENS not supported on this network, continuing without ENS');
                // ENS issue but don't panic, we might still be able to use the app
            }

            setPlayerStats(null);
        }
    };

    const connect = async () => {
        try {
            await login();
        } catch (error) {
            console.error('Failed to connect wallet:', error);
        }
    };

    const disconnect = async () => {
        try {
            await logout();
            // Clear local state
            setProvider(null);
            setIsRegistered(false);
            setPlayerStats(null);
            setRegistrationRetryCount(0);
        } catch (error) {
            console.error('Failed to disconnect wallet:', error);
        }
    };

    const checkRegistration = async () => {
        if (address) {
            await checkPlayerRegistration(address);
        }
    };

    const refreshPlayerStats = async () => {
        if (address && provider) {
            await fetchPlayerStats(address);
        }
    };

    const retryRegistrationCheck = async () => {
        if (address) {
            setRegistrationRetryCount(0);
            await checkPlayerRegistration(address);
        }
    };

    // Helper function to switch to Morph Holesky Testnet
    const switchToMorphNetwork = async () => {
        if (!isConnected) {
            console.error('Not connected to any wallet');
            return false;
        }

        try {
            // For wallets that support network switching
            if (wallets.length > 0) {
                const wallet = wallets[0];
                if (wallet && wallet.getEthereumProvider) {
                    const ethProvider = await wallet.getEthereumProvider();

                    // Try to add and switch to Morph Holesky testnet
                    try {
                        await ethProvider.request({
                            method: 'wallet_addEthereumChain',
                            params: [
                                {
                                    chainId: '0xAFA', // 2810 in hex
                                    chainName: 'Morph Holesky Testnet',
                                    nativeCurrency: {
                                        name: 'Ether',
                                        symbol: 'ETH',
                                        decimals: 18,
                                    },
                                    rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc-holesky.morphl2.io'],
                                    blockExplorerUrls: ['https://explorer-holesky.morphl2.io'],
                                },
                            ],
                        });

                        console.log('Successfully added Morph network');

                        // Now switch to the network
                        await ethProvider.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: '0xAFA' }], // 2810 in hex
                        });

                        console.log('Successfully switched to Morph network');
                        return true;
                    } catch (error) {
                        console.error('Failed to switch network:', error);
                        return false;
                    }
                }
            }
        } catch (error) {
            console.error('Error switching network:', error);
            return false;
        }

        return false;
    };

    // Initialize loading state
    useEffect(() => {
        if (!isConnected) {
            setIsLoading(false);
        }
    }, [isConnected]);

    const contextValue: WalletContextType = {
        isLoading,
        provider,
        address: address || null,
        isConnected,
        isRegistered,
        playerStats,
        connect,
        disconnect,
        checkRegistration,
        refreshPlayerStats,
        retryRegistrationCheck,
        switchToMorphNetwork
    };

    return (
        <WalletContext.Provider value={contextValue}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
