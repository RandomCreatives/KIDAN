import { randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export function generatePublicCode(): string {
  let suffix = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    suffix += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `KD-${suffix}`;
}
