import {
  LitActionResource,
  LitPKPResource,
  createSiweMessageWithRecaps,
  generateAuthSig,
} from "@lit-protocol/auth-helpers";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { ethers, Wallet } from "ethers";
import { env } from "../_env";
import { LIT_ABILITY } from "@lit-protocol/constants";
import { DELEGATION_AUTH_SIG } from "../config/delegation";

export class LitService {
  client: LitNodeClient;
  contracts: LitContracts;
  wallet: Wallet;
  network: "datil" = "datil";

  constructor(debug: boolean = false) {
    const provider = new ethers.providers.JsonRpcProvider(
      "https://yellowstone-rpc.litprotocol.com/"
    );
    this.wallet = new Wallet(env.ETHEREUM_PRIVATE_KEY, provider);

    this.client = new LitNodeClient({
      litNetwork: this.network,
      debug: debug,
    });

    this.contracts = new LitContracts({
      signer: this.wallet,
      debug: debug,
      network: this.network,
    });
  }

  async connect() {
    await this.client.connect();
    await this.contracts.connect();
  }

  async run<T>(params: { code: string; params: T }) {
    const session = await this.getSession();

    return this.client.executeJs({
      code: params.code,
      sessionSigs: session,
      jsParams: params.params,
    });
  }

  private async getSession() {
    const _resourceAbilityRequests = [
      {
        resource: new LitPKPResource("*"),
        ability: LIT_ABILITY.PKPSigning,
      },
      {
        resource: new LitActionResource("*"),
        ability: LIT_ABILITY.LitActionExecution,
      },
    ];

    return await this.client.getSessionSigs({
      chain: "ethereum",
      resourceAbilityRequests: _resourceAbilityRequests,
      authNeededCallback: async ({
        uri,
        expiration,
        resourceAbilityRequests,
      }: any) => {
        if (!expiration) {
          throw new Error("expiration is required");
        }

        if (!resourceAbilityRequests) {
          throw new Error("resourceAbilityRequests is required");
        }

        if (!uri) {
          throw new Error("uri is required");
        }

        const toSign = await createSiweMessageWithRecaps({
          uri: uri,
          expiration: expiration,
          resources: resourceAbilityRequests,
          walletAddress: this.wallet.address,
          nonce: await this.client.getLatestBlockhash(),
          litNodeClient: this.client,
        });

        const authSig = await generateAuthSig({
          signer: this.wallet,
          toSign,
        });

        return authSig;
      },
      capabilityAuthSigs: [DELEGATION_AUTH_SIG],
    });
  }

  async getPKPs() {
    const pkps =
      await this.contracts.pkpNftContractUtils.read.getTokensInfoByAddress(
        this.wallet.address
      );

    return pkps;
  }

  async mintPKP() {
    const balance = bigint(await this.wallet.getBalance());
    const mintCost = bigint(
      await this.contracts.pkpNftContract.read.mintCost()
    );

    console.log("balance:", balance);
    console.log("mintCost:", mintCost);

    if (mintCost > balance) {
      throw new Error("Insufficient balance");
    }

    const metadata = await this.contracts.pkpNftContractUtils.write.mint();

    return {
      info: metadata.pkp,
      mintTx: metadata.tx,
      mintReceipt: metadata.res,
    };
  }

  async mintCreditsNFT() {
    const capacityTokenId = (
      await this.contracts.mintCapacityCreditsNFT({
        requestsPerKilosecond: 200,
        daysUntilUTCMidnightExpiration: 14,
      })
    ).capacityTokenIdStr;

    return capacityTokenId;
  }

  async getDelegationAuthSig(capacityTokenId: string) {
    return (
      await this.client.createCapacityDelegationAuthSig({
        dAppOwnerWallet: this.wallet,
        capacityTokenId: capacityTokenId,
        // Sets a maximum limit of 200 times that the delegation can be used and prevents usage beyond it
        uses: "200",
        expiration: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
    ).capacityDelegationAuthSig;
  }
}

function bigint(value: any) {
  return BigInt(value.toString());
}
