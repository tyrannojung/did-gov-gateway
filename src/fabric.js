import { Gateway, Wallets } from "fabric-network";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { DID_CONFIG } from "./config.js";
dotenv.config();

const ccpPath = process.env.FABRIC_CCP_JSON; // connection.json
const mspId = process.env.FABRIC_MSPID; // Org1MSP
const idLabel = process.env.FABRIC_ID_LABEL; // admin
const certPath = process.env.FABRIC_CERT_PEM;
const keyPath = process.env.FABRIC_KEY_PEM;

export async function getContract() {
  const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
  const wallet = await Wallets.newInMemoryWallet();
  await wallet.put(idLabel, {
    credentials: {
      certificate: fs.readFileSync(certPath, "utf8"),
      privateKey: fs.readFileSync(keyPath, "utf8"),
    },
    mspId,
    type: "X.509",
  });

  const gw = new Gateway();
  await gw.connect(ccp, {
    wallet,
    identity: idLabel,
    discovery: { enabled: true, asLocalhost: DID_CONFIG.fabric.asLocalhost },
  });
  const network = await gw.getNetwork(DID_CONFIG.fabric.channelName);
  return network.getContract(DID_CONFIG.fabric.chaincodeName);
}
