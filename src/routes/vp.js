// src/routes/vp.js
import express from "express";
import stringify from "json-stable-stringify";
import { createVerify } from "crypto";
import { getContract } from "../fabric.js";

const r = express.Router();

/*───────────────────────────────────────────────────────────
 ▸ POST /vps/verify           – VP 검증 (Android에서 생성한 VP)
    body { vp : {...} , challenge }
 ----------------------------------------------------------------*/
r.post("/verify", async (req, res) => {
  console.log("VP verification request received");
  try {
    const { vp, challenge } = req.body;
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    

    /* ① VP 구조 검증 */
    if (!vp || !vp.verifiableCredential || !vp.proof || !vp.holder) {
      const structureError = {
        hasVp: !!vp,
        hasVC: !!(vp && vp.verifiableCredential),
        hasProof: !!(vp && vp.proof),
        hasHolder: !!(vp && vp.holder)
      };
      return res.status(400).json({ valid: false, reason: "Invalid VP structure - missing required fields" });
    }
    
    if (!vp.proof.proofValue || !vp.proof.challenge) {
      return res.status(400).json({ valid: false, reason: "Invalid VP proof structure" });
    }

    /* ② VC on-chain 검증 */
    const vcId = vp.verifiableCredential.id;
    if (!vcId) {
      return res.status(400).json({ valid: false, reason: "VC ID not found in VP" });
    }
    const contract = await getContract();
    const check = JSON.parse(
      (await contract.evaluateTransaction("verifyVC", vcId)).toString()
    );
    if (!check.valid) {
      return res.status(400).json({ valid: false, reason: "VC invalid" });
    }

    /* ③ holder 공개키 확보 - 체인에서 DID Document 조회 */
    const holderDid = vp.holder;
    
    let pubPem;
    try {
      // 체인에서 DID Document 가져오기
      const didDocBuf = await contract.evaluateTransaction("getDID", holderDid);
      const didDoc = JSON.parse(didDocBuf.toString());
      
      // 공개키 추출
      if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
        throw new Error("No verification method found in DID document");
      }
      // publicKeyPem 또는 publicKeyMultibase에서 공개키 찾기
      pubPem = didDoc.verificationMethod[0].publicKeyPem || 
               didDoc.verificationMethod[0].publicKeyMultibase;
    } catch (error) {
      console.error("Error retrieving DID document:", error);
      return res.status(400).json({ valid: false, reason: "Holder key not found: " + error.message });
    }

    /* ④ VP 서명 확인 */
    if (!pubPem) {
      return res.status(400).json({ valid: false, reason: "Public key not found in DID document" });
    }
    
    const unsigned = { ...vp };
    delete unsigned.proof;
    const verify = createVerify("SHA256").update(stringify(unsigned)).end();
    const sigOK = verify.verify(
      pubPem,
      Buffer.from(vp.proof.proofValue, "base64")
    );

    /* ⑤ challenge 비교 */
    const challengeOK = vp.proof.challenge === challenge;

    res.json({
      valid: sigOK && challengeOK,
      reason: sigOK
        ? challengeOK
          ? "VP valid"
          : "challenge mismatch"
        : "signature mismatch",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;