// src/routes/vp.js
import express from "express";
import stringify from "json-stable-stringify";
import { createSign, createVerify } from "crypto";
import { getContract } from "../fabric.js";
import { randomId } from "../id-utils.js";
import { loadWalletPem } from "../utils/key-io.js";
import { getUserInfo, getLatestVcId } from "../utils/key-io.js";

const r = express.Router();

/*───────────────────────────────────────────────────────────
 ▸ POST /vps/present          – 지갑에 있는 VC → VP 생성
    body { userId , vcId , challenge? }
 ----------------------------------------------------------------*/
r.post("/present", async (req, res) => {
  try {
    const userId = req.body.userId || getUserInfo().userId;
    const vcId = req.body.vcId || getLatestVcId();
    const challenge = req.body.challenge || randomId();

    /* ① VC 원장에서 읽기 */
    const contract = await getContract();
    const vcBuf = await contract.evaluateTransaction("getVC", vcId);
    const vc = JSON.parse(vcBuf.toString());

    /* ② 사용자 프라이빗키 가져오기 */
    const { prvPem, pubPem } = loadWalletPem("user");
    const holderDid = `did:anam145:user:${userId}`;

    /* ③ VP 본문 */
    const vp = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      holder: holderDid,
      verifiableCredential: vc,
    };

    /* ④ 서명 */
    const canon = Buffer.from(stringify(vp));
    const sign = createSign("SHA256").update(canon).end();
    const proofValue = sign.sign(prvPem).toString("base64");

    vp.proof = {
      type: "Secp256r1Signature2018",
      created: new Date().toISOString(),
      proofPurpose: "authentication",
      verificationMethod: `${holderDid}#keys-1`,
      challenge,
      proofValue,
    };

    res.json({ vp, challenge });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

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

    /* ② holder 공개키 확보 - 체인에서 DID Document 조회 */
    const holderDid = vp.holder;
    console.log("Looking up holder DID:", holderDid);
    
    let pubPem;
    try {
      // 체인에서 DID Document 가져오기
      const didDocBuf = await contract.evaluateTransaction("getDID", holderDid);
      const didDoc = JSON.parse(didDocBuf.toString());
      console.log("DID Document retrieved:", JSON.stringify(didDoc, null, 2));
      
      // 공개키 추출
      if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
        throw new Error("No verification method found in DID document");
      }
      pubPem = didDoc.verificationMethod[0].publicKeyPem;
      console.log("Public key extracted:", pubPem ? "Found" : "Not found");
    } catch (error) {
      console.error("Error retrieving DID document:", error);
      return res.status(400).json({ valid: false, reason: "Holder key not found: " + error.message });
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

/*───────────────────────────────────────────────────────────
 ▸ POST /vps/verify-latest    – 최신 VP 자동 검증
 ----------------------------------------------------------------*/
r.post("/verify-latest", async (req, res) => {
  try {
    // 1) 최신 VP 생성
    const userId = getUserInfo().userId;
    const vcId = getLatestVcId();
    const challenge = randomId();

    // VP 생성 로직 (기존 /present와 동일)
    const contract = await getContract();
    const vcBuf = await contract.evaluateTransaction("getVC", vcId);
    const vc = JSON.parse(vcBuf.toString());

    const { prvPem } = loadWalletPem("user");
    const holderDid = `did:anam145:user:${userId}`;

    const vp = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      holder: holderDid,
      verifiableCredential: vc,
    };

    const canon = Buffer.from(stringify(vp));
    const sign = createSign("SHA256").update(canon).end();
    const proofValue = sign.sign(prvPem).toString("base64");

    vp.proof = {
      type: "Secp256r1Signature2018",
      created: new Date().toISOString(),
      proofPurpose: "authentication",
      verificationMethod: `${holderDid}#keys-1`,
      challenge,
      proofValue,
    };

    // 2) VP 검증 로직 (기존 /verify와 동일)
    const vcIdFromVp = vp.verifiableCredential.id;
    const check = JSON.parse(
      (await contract.evaluateTransaction("verifyVC", vcIdFromVp)).toString()
    );
    if (!check.valid) {
      return res.status(400).json({ valid: false, reason: "VC invalid" });
    }

    const holderId = vp.holder.split(":").pop();
    const { pubPem } = loadWalletPem("user", holderId);

    const unsigned = { ...vp };
    delete unsigned.proof;
    const verify = createVerify("SHA256").update(stringify(unsigned)).end();
    const sigOK = verify.verify(
      pubPem,
      Buffer.from(vp.proof.proofValue, "base64")
    );

    const chalOK = vp.proof.challenge === challenge;

    res.json({
      valid: sigOK && chalOK,
      reason: sigOK
        ? chalOK
          ? "VP valid"
          : "challenge mismatch"
        : "signature mismatch",
      vp,
      challenge,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;
