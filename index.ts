import "dotenv/config";
import { serve  } from "bun";
import { MongoClient, Db, ServerApiVersion } from "mongodb";
import { createPublicClient, createWalletClient, http, type PrivateKeyAccount, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from 'viem/chains'

import { OWNER_PRIVATE_KEY } from "./constants";
import checkEligibility from "./routes/check-eligibility"

const PORT = 3000;
const MONGO_URI = process.env.MONGO_URI;
const DATABASE_NAME = "main";

const viemClient = createPublicClient({
  chain: sepolia,
  transport: http("https://eth-sepolia.g.alchemy.com/v2/hxTSZOuKnY2GWCXVmh3KkPwUrss2ZqJ2"),
})
const viemAccount = privateKeyToAccount('0x'+OWNER_PRIVATE_KEY! as `0x${string}`);
const viemWalletClient = createWalletClient({
  chain: sepolia,
  transport: http("https://eth-sepolia.g.alchemy.com/v2/hxTSZOuKnY2GWCXVmh3KkPwUrss2ZqJ2"),
})
globalThis.viemClient = viemClient;
globalThis.viemWalletClient = viemWalletClient
globalThis.viemAccount = viemAccount;

declare global {
  // Extend the global object to include our MongoDB client and database
  var mongodbClient: MongoClient | undefined;
  var mongodbDatabase: Db | undefined;
  var viemClient: PublicClient | undefined;
  var viemWalletClient: WalletClient | undefined;
  var viemAccount: PrivateKeyAccount | undefined;
}

async function connectToMongoDB() {
  try {
    const client = new MongoClient(MONGO_URI!, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
    await client.connect();
    const db = client.db(DATABASE_NAME);

    // Assign the client and database to the global object
    globalThis.mongodbClient = client;
    globalThis.mongodbDatabase = db;

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

const handler = async (req: Request) => {
  // Example route handling
  const url = new URL(req.url);

  if (url.pathname === "/") {
    return new Response("Hello, Bun!", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  if(url.pathname === "/check-eligibility") {
    return await checkEligibility(req); 
  }

  // Default 404 response
  return new Response("Not Found", { status: 404 });
};

// Start the Bun server
serve({
  port: PORT,
  fetch: handler,
  error(err: Error) {
    console.error("Server error:", err);
    return new Response("Internal Server Error", { status: 500 });
  },
});

connectToMongoDB().catch((err) => {
  console.error("Failed to initialize MongoDB connection. Exiting...");
  process.exit(1);
});

console.log(`Server running on http://localhost:${PORT}`);

