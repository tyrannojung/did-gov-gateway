import crypto from "crypto";
import bs58 from "bs58";

export function randomId() {
  return bs58.encode(crypto.randomBytes(20)); // 160-bit
}
