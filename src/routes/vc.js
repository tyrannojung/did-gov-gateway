// src/routes/vc.js
import express from "express";
import { signVC } from "../vc-sign.js";
import { getContract } from "../fabric.js";
import {
  getIssuerInfo,
  getLatestLicenseDid,
} from "../utils/key-io.js";
import { DID_CONFIG } from "../config.js";

const r = express.Router();

/*---------------------------------------------------------------
 ▸ POST /vcs/driver-license     —  VC 발급
    body { licenseDid? : "did:anam145:license:…" } (선택적)
 ----------------------------------------------------------------*/
r.post("/driver-license", async (req, res) => {
  try {
    // licenseDid가 제공되지 않으면 최신 것 사용
    const licenseDid = req.body.licenseDid || getLatestLicenseDid();
    const { issuerDid } = getIssuerInfo();

    /* 1) VC skeleton 작성 & 서명 */
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "DriverLicenseVC"],
      issuer: { id: issuerDid, name: DID_CONFIG.issuerName },
      issuanceDate: new Date().toISOString(),
      credentialSubject: { licenseId: licenseDid },
    };
    const signed = signVC(unsigned);

    /* 2) 체인코드 저장 */
    const contract = await getContract();
    await contract.submitTransaction("putVC", JSON.stringify(signed));

    res.status(201).json(signed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*---------------------------------------------------------------
 ▸ GET /vcs/:vcId               —  특정 VC 조회
 ----------------------------------------------------------------*/
r.get("/:vcId", async (req, res) => {
  try {
    const contract = await getContract();
    const vcBuf = await contract.evaluateTransaction("getVC", req.params.vcId);
    const vc = JSON.parse(vcBuf.toString());
    res.json(vc);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

export default r;