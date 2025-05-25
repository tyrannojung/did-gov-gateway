import express from "express";
import { randomId } from "../id-utils.js";
import { getContract } from "../fabric.js";
import { signVC } from "../vc-sign.js";
import {
  getIssuerInfo,
  getUserInfo,
  saveUserVC,
} from "../utils/key-io.js";

const r = express.Router();

r.post("/", async (req, res) => {
  try {
    const { licenseNumber = "A-123-456-7890", userDid } = req.body;

    // userDid는 필수
    if (!userDid) {
      throw new Error("userDid is required");
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

    // 즉시 VC 발급
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "DriverLicenseVC"],
      issuer: { id: issuerDid, name: "정부24 Driver-License" },
      issuanceDate: new Date().toISOString(),
      credentialSubject: { licenseId: licenseDid },
    };
    const signed = signVC(unsigned);
    
    // VC 체인코드 저장
    await contract.submitTransaction("putVC", JSON.stringify(signed));
    
    // 로컬 저장
    const filePath = saveUserVC(signed);

    res.json({
      licenseDid,
      vc: signed,
      storedAt: filePath,
      userDid,
      licenseNumber,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;