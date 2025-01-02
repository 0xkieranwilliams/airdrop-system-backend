import { recoverMessageAddress, type WalletClient, type PublicClient, type PrivateKeyAccount } from "viem";
import { abi, CONTRACT_ADDRESS } from "../constants";
import { Db } from "mongodb";

const extractSearchParams = (url: any) => {
  const signature = url.searchParams.get("signature");
  const signingMessage = url.searchParams.get("signingMessage");
  return {signature, signingMessage}
}

const getCurrentEpoch = async (viemClient: PublicClient) => {
  const currentEpochResponse = await viemClient?.readContract({ address: CONTRACT_ADDRESS, abi, functionName: 's_currentEpoch'});
  const currentEpoch = parseInt(String(currentEpochResponse) || "-1", 10);
  return currentEpoch;
}

const getUsersScaledEpochPoolPercentage = async (db: Db, rewardsCollection: string, rewards: any, epoch:number) => {
  const totalPoints = await db!
    .collection(rewardsCollection)
    .aggregate([
      { $match: { epoch } }, // Match documents in the current epoch
      { $group: { _id: null, totalPoints: { $sum: "$points" } } }, // Sum the points
    ])
    .toArray();
  const calculatedPoolPercentage: number = rewards[0]?.points / totalPoints[0]?.totalPoints;
  const scaledPoolPercentage = Math.floor(calculatedPoolPercentage * 100 * 10000);
  return scaledPoolPercentage;
}

const checkIfUserIsInEpochRewardsAlready = async (viemClient: any, epoch: number, account: string) => {
  const userEpochRewardsResponse = await viemClient?.readContract({ address: CONTRACT_ADDRESS, abi, functionName: 'getUserEpochReward', args:[epoch, account]}) as [bigint, boolean, boolean, bigint];
  const userIsEligible = userEpochRewardsResponse[2]
  return userIsEligible
}

const addUserToEpochRewards = async (viemAccount: PrivateKeyAccount, viemClient: PublicClient, viemWalletClient: WalletClient, account: string, scaledPoolPercentage: number) => {
    const {request} = await viemClient!.simulateContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: 'addUserToEpochRewards',
      args: [account, scaledPoolPercentage],
      account: viemAccount
    });

    const tx = await viemWalletClient!.writeContract(request);
    console.log(`addUserToEpochRewards(${account}, ${scaledPoolPercentage}) tx hash: ${tx}`)
}

export default async (req: Request, headers: any) => {
  const db = globalThis.mongodbDatabase;
  const viemClient = globalThis.viemClient;
  const viemWalletClient = globalThis.viemWalletClient;
  const viemAccount = globalThis.viemAccount;

  const url = new URL(req.url);
  const {signature, signingMessage} = extractSearchParams(url);

  const epoch = await getCurrentEpoch(viemClient!);
  console.log({epoch})

  if (!signature || !signingMessage || isNaN(epoch)) {
    return new Response(
      JSON.stringify({ error: "Invalid account or epoch parameter" }),
      { status: 400, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  const account = await recoverMessageAddress({message: String(signingMessage), signature: String(signature) as `0x${string}`})

  const rewardsCollection = "reward-vault-epoch-points"
  const rewards = await db!.collection(rewardsCollection).find({address: account, epoch}).toArray();

  if (rewards.length === 0) {
    return new Response(
      JSON.stringify({eligible: false, pointsAvailableThisEpoch: 0, poolPercentage: 0}), 
      { headers: { "Content-Type": "application/json", ...headers } 
    });
  }

  const scaledPoolPercentage = await getUsersScaledEpochPoolPercentage(db!, rewardsCollection, rewards, epoch)
  console.log({scaledPoolPercentage});
  const userIsEligible = await checkIfUserIsInEpochRewardsAlready(viemClient, epoch, account);

  if (!userIsEligible) {
    addUserToEpochRewards(viemAccount!, viemClient!, viemWalletClient!, account, scaledPoolPercentage);
  }

  return new Response(
    JSON.stringify({eligible: true, pointsAvailableThisEpoch: rewards[0]?.points, poolPercentage: scaledPoolPercentage}), 
    { headers: { "Content-Type": "application/json", ...headers } 
  });
}
