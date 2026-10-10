import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
});

export const auctionAddress = "0xacC12B4bdae66Ef42939340Fa1811BD629F18cC2" as const;
export const saleTokenAddress = "0x803cbeb14E07249E6DbE64a76751AbF253925ab5" as const;
export const quoteTokenAddress = "0x19655Bdde974d7410e8AFaf5FA0158e558043105" as const;

export const chainIdHex = "0x279f";
