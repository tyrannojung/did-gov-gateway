// src/routes/vc.js
import express from "express";
import { signVC } from "../vc-sign.js";
import { getContract } from "../fabric.js";
import {
  getIssuerInfo,
  getLatestLicenseDid,
  saveUserVC,
  getLatestVcId,
} from "../utils/key-io.js";

const r = express.Router();

/*---------------------------------------------------------------
 ▸ POST /vcs/issue               —  VC 발급 (클라이언트 요청)
    body { licenseDid: "did:anam145:license:…" }
 ----------------------------------------------------------------*/
r.post("/issue", async (req, res) => {
  try {
    const { licenseDid } = req.body;
    
    if (!licenseDid) {
      return res.status(400).json({ error: "licenseDid is required" });
    }
    
    const { issuerDid } = getIssuerInfo();

    /* 1) VC skeleton 작성 & 서명 */
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "DriverLicenseVC"],
      issuer: { id: issuerDid, name: "정부24 Driver-License" },
      issuanceDate: new Date().toISOString(),
      credentialSubject: { licenseId: licenseDid },
    };
    const signed = signVC(unsigned);

    /* 2) 체인코드 저장 */
    const contract = await getContract();
    await contract.submitTransaction("putVC", JSON.stringify(signed));

    /* 3) 클라이언트에게 반환 (서버 저장 안함) */
    res.status(201).json(signed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /vcs/latest/verify       —  최신 VC on-chain 검증
 ----------------------------------------------------------------*/
r.get("/latest/verify", async (req, res) => {
  try {
    const vcId = getLatestVcId();
    const contract = await getContract();
    const result = await contract.evaluateTransaction("verifyVC", vcId);
    res.json(JSON.parse(result.toString()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /vcs/:vcId/verify        —  특정 VC on-chain 검증
 ----------------------------------------------------------------*/
r.get("/:vcId/verify", async (req, res) => {
  try {
    const contract = await getContract();
    const result = await contract.evaluateTransaction(
      "verifyVC",
      req.params.vcId
    );
    res.json(JSON.parse(result.toString()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;