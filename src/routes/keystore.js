// src/routes/keystore.js
import express from "express";
import { generateKeyPairSync } from "crypto";
import { randomId } from "../id-utils.js";
import { saveWallet } from "../utils/key-io.js";

const r = express.Router();

function newKeyPair() {
  return generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

/* ─ Issuer wallet ─────────────────────────────────────────────── */
r.post("/issuer", (req, res) => {
  const issuerId = req.body.issuerId || process.env.ISSUER_ID || randomId();
  const { publicKey, privateKey } = newKeyPair();
  saveWallet("issuer", issuerId, publicKey, privateKey);

  res.json({
    issuerId,
    did: `did:anam145:issuer:${issuerId}`,
    publicKeyB64: publicKey.replace(/-----[^-]+-----|\s+/g, ""),
  });
});

/* ─ User wallet (서버에도 저장) ────────────────────────────────── */
r.post("/user", (req, res) => {
  const userId = randomId();
  const { publicKey, privateKey } = newKeyPair();
  saveWallet("user", userId, publicKey, privateKey);

  res.json({
    userId,
    did: `did:anam145:user:${userId}`,
    publicKeyB64: publicKey.replace(/-----[^-]+-----|\s+/g, ""),
    privateKeyB64: privateKey.replace(/-----[^-]+-----|\s+/g, ""),
  });
});

export default r;
