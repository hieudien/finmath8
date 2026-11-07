import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const key = () => {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("Thiếu APP_SECRET trong biến môi trường.");
  return createHash("sha256").update(s).digest();
};

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(s: string) {
  const [iv, tag, enc] = s.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
