import stringify from "json-stable-stringify";
import { createSign } from "crypto";
import { randomId } from "./id-utils.js";
import { loadWalletPem, getIssuerInfo } from "./utils/key-io.js";

export function signVC(vc) {
  const { issuerId, issuerDid } = getIssuerInfo();
  const { prvPem } = loadWalletPem("issuer");

  vc.id = randomId();

  const canon = Buffer.from(stringify(vc));
  const sign = createSign("SHA256");
  sign.update(canon).end();

  vc.proof = {
    type: "Secp256r1Signature2018",
    created: new Date().toISOString(),
    verificationMethod: `${issuerDid}#keys-1`,
    proofPurpose: "assertionMethod",
    proofValue: sign.sign(prvPem).toString("base64"),
  };
  return vc;
}
