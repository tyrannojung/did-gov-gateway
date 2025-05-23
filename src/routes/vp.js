// src/routes/vp.js
import express from "express";
import stringify from "json-stable-stringify";
import { createSign, createVerify } from "crypto";
import { getContract } from "../fabric.js";
import { randomId } from "../id-utils.js";
// 사용자 로컬 키 의존성 제거

const r = express.Router();

/* ❌ VP 생성 제거 - 안드로이드에서 처리 */

/*───────────────────────────────────────────────────────────
 ▸ POST /vps/verify           – 발표받은 VP 검증
    body { vp : {…} , challenge }
 ----------------------------------------------------------------*/
r.post("/verify", async (req, res) => {
  try {
    const { vp, challenge } = req.body;
    
    console.log("Received VP:", JSON.stringify(vp, null, 2));
    console.log("Received challenge:", challenge);

    /* ① VP 구조 검증 */
    if (!vp || !vp.verifiableCredential || !vp.proof || !vp.holder) {
      console.log("VP structure check failed:", {
        hasVp: !!vp,
        hasVC: !!(vp && vp.verifiableCredential),
        hasProof: !!(vp && vp.proof),
        hasHolder: !!(vp && vp.holder)
      });
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

    /* ② holder 공개키 확보 (블록체인에서) */
    let pubPem;
    try {
      const holderDidData = JSON.parse(
        (await contract.evaluateTransaction("getDID", vp.holder)).toString()
      );
      pubPem = holderDidData.publicKey;
    } catch (error) {
      return res.status(400).json({ valid: false, reason: "Holder DID not found on chain" });
    }

    /* ③ VP 서명 확인 */
    const unsigned = { ...vp };
    delete unsigned.proof;
    const verify = createVerify("SHA256").update(stringify(unsigned)).end();
    const sigOK = verify.verify(
      pubPem,
      Buffer.from(vp.proof.proofValue, "base64")
    );

    /* ④ challenge 비교 */
    const chalOK = vp.proof.challenge === challenge;

    res.json({
      valid: sigOK && chalOK,
      reason: sigOK
        ? chalOK
          ? "VP valid"
          : "challenge mismatch"
        : "signature mismatch",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* ❌ VP 자동 생성/검증 제거 - 안드로이드에서 처리 */

export default r;
