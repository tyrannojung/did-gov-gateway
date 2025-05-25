// src/routes/did.js
import express from "express";
import fs from "fs";
import path from "path";
import { randomId } from "../id-utils.js";
import { getContract } from "../fabric.js";
import { b642pem, getUserInfo } from "../utils/key-io.js";

const r = express.Router();

/*------------------------------------------------------------------
 ▸ GET /dids/:did            : 체인코드에서 DID JSON 조회
 -----------------------------------------------------------------*/
r.get("/:did(*)", async (req, res) => {
  try {
    const contract = await getContract();
    const buf = await contract.evaluateTransaction("getDID", req.params.did);
    res.json(JSON.parse(buf.toString()));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/*------------------------------------------------------------------
 ▸ POST /dids/user           : User-DID 생성
    body { publicKeyPem: (base64 or PEM), meta?: {...} }
 -----------------------------------------------------------------*/
r.post("/user", async (req, res) => {
  try {
    const { publicKeyPem, meta = {} } = req.body;

    // publicKeyPem이 제공되지 않으면 에러
    if (!publicKeyPem) {
      throw new Error("publicKeyPem is required");
    }

    // userId 생성 (20바이트 nonce + Base58)
    const userId = randomId();
    const userDid = `did:anam145:user:${userId}`;

    // Base64로 인코딩된 경우 PEM으로 변환
    let pubPem = publicKeyPem;
    if (!publicKeyPem.includes("-----BEGIN")) {
      pubPem = b642pem(publicKeyPem, "PUBLIC KEY");
    }

    const contract = await getContract();
    await contract.submitTransaction(
      "createUserDID",
      userId,
      pubPem,
      JSON.stringify(meta)
    );

    res.status(201).json({
      userId,
      did: userDid,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/*------------------------------------------------------------------
 ▸ POST /dids/issuer/bootstrap : Issuer-DID 부트스트랩
    body { publicKeyPem: (base64), meta?: {...} }
 -----------------------------------------------------------------*/
r.post("/issuer/bootstrap", async (req, res) => {
  try {
    const { publicKeyPem: pubB64, meta = {} } = req.body;
    const pubPem = b642pem(pubB64, "PUBLIC KEY");

    const issuerId = process.env.ISSUER_ID || randomId();
    const contract = await getContract();
    await contract.submitTransaction(
      "createIssuerDID",
      issuerId,
      pubPem,
      JSON.stringify(meta)
    );

    res.status(201).json({
      issuerId,
      did: `did:anam145:issuer:${issuerId}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default r;