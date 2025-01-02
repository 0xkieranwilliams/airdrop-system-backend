import { recoverMessageAddress } from "viem";
import { abi, CONTRACT_ADDRESS } from "../constants";

export default async (req: Request) => {

  const db = globalThis.mongodbDatabase;
  const viemClient = globalThis.viemClient;
  const viemAccount = globalThis.viemAccount;

  const url = new URL(req.url);
  const signature = url.searchParams.get("signature");
  const signingMessage = url.searchParams.get("signingMessage");
  const epoch = parseInt(url.searchParams.get("epoch") || "-1", 10);

  const account = await recoverMessageAddress({message: String(signingMessage), signature: String(signature) as `0x${string}`})

  if (!signature || !signingMessage || isNaN(epoch)) {
    return new Response(
      JSON.stringify({ error: "Invalid account or epoch parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }


  const rewardsCollection = "reward-vault-epoch-points"
  const rewards = await db!.collection(rewardsCollection).find({address: account, epoch}).toArray();

  if (rewards.length === 0) {
    return new Response(
      JSON.stringify({eligible: false, pointsAvailableThisEpoch: 0, poolPercentage: 0}), 
      { headers: { "Content-Type": "application/json" } 
    });
  }

  const totalPoints = await db!
    .collection(rewardsCollection)
    .aggregate([
      { $match: { epoch } }, // Match documents in the current epoch
      { $group: { _id: null, totalPoints: { $sum: "$points" } } }, // Sum the points
    ])
    .toArray();
  let calculatedPoolPercentage: number = rewards[0]?.points / totalPoints[0]?.totalPoints;
   calculatedPoolPercentage = Math.floor(calculatedPoolPercentage * 100);
  const scaledPoolPercentage = calculatedPoolPercentage * 10000;

  // TODO :: addUserToEpochRewards(address, poolPercentage) in smart contract
  const {request} = await viemClient!.simulateContract({
    address: CONTRACT_ADDRESS,
    abi,
    functionName: 'addUserToEpochRewards',
    args: [account, scaledPoolPercentage],
    account: viemAccount
  });
  console.log("here")
  const tx = await viemWalletClient!.writeContract(request);
  console.log(tx)

  return new Response(
    JSON.stringify({eligible: true, pointsAvailableThisEpoch: rewards[0]?.points, poolPercentage: calculatedPoolPercentage}), 
    { headers: { "Content-Type": "application/json" } 
  });
}
