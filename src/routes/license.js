import express from "express";
import { randomId } from "../id-utils.js";
import { getContract } from "../fabric.js";
import { signVC } from "../vc-sign.js";
import { getIssuerInfo } from "../utils/key-io.js";

const r = express.Router();

r.post("/", async (req, res) => {
  try {
    const { licenseNumber = "A-123-456-7890", userDid } = req.body;

    if (!userDid) {
      return res.status(400).json({ error: "userDid is required" });
    }

    const licenseId = randomId();
    const licenseDid = `did:anam145:license:${licenseId}`;
    const { issuerDid } = getIssuerInfo();

    const contract = await getContract();
    await contract.submitTransaction(
      "createLicenseDID",
      licenseId,
      issuerDid,
      userDid,
      licenseNumber,
      '{"licenseType":"일반"}'
    );

    res.json({
      licenseId,
      licenseDid,
      userDid,
      licenseNumber,
      issuerDid,
      message: "License DID created. Request VC issuance separately."
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;