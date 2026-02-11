// src/types/api/loyalty.ts

export type LoyaltyWallet = {
  userId: string;
  balanceCents: number;
  updatedAt?: string;
};

export type LoyaltyWalletResponse = {
  wallet: LoyaltyWallet | null;
};
