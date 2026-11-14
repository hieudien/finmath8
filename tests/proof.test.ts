import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/llm", () => ({ askJson: vi.fn(), askText: vi.fn() }));
vi.mock("../lib/errors", () => ({ reportError: vi.fn(async () => "REF"), swallow: () => () => null }));

import { askJson } from "../lib/llm";
import { crossCheck, checkKey } from "../lib/verify-solution";
import { makeSteps } from "../lib/fill";
import { proofAnswer } from "../lib/solve";
import { problemSchema } from "../lib/schema/problem";
import type { LlmCfg } from "../lib/llm";

const cfg = { provider: "gemini", key: "k", model: "m", temperature: 0 } as unknown as LlmCfg;
const proof = (solution: Record<string, unknown>) => problemSchema.parse({
  id: "BT", title: "t", grade: 9, statement: "Chứng minh rằng tứ giác CEHD nội tiếp. Xác định tâm đường tròn.", solution,
  step_checks: [{ result: "Tứ giác CEHD nội tiếp", accepts: [] }], hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
});

describe("đề chứng minh", () => {
  it("proofAnswer: một đáp án chữ đổi tên ket_luan, câu 'đã chứng minh xong' bị bỏ, số giữ nguyên", () => {
    const st = "Chứng minh rằng A. Xác định tâm.";
    expect(proofAnswer(st, { h_tam: "H là tâm" })).toEqual({ ket_luan: "H là tâm" });
    expect(proofAnswer(st, { ket_luan: "Đã chứng minh xong 5 ý" })).toEqual({});
    expect(proofAnswer(st, { x: 3 })).toEqual({ x: 3 });
    expect(proofAnswer("Giải $2x=8$", { a: "chữ" })).toEqual({ a: "chữ" });
  });

  it("crossCheck và checkKey bỏ qua đề chứng minh có đáp án chữ (không gọi AI)", async () => {
    vi.mocked(askJson).mockReset();
    expect(await crossCheck(cfg, proof({ ket_luan: "H là tâm đường tròn nội tiếp" }))).toBe("");
    expect(await checkKey(cfg, proof({ ket_luan: "H" }))).toBe("");
    expect(askJson).not.toHaveBeenCalled();
  });

  it("makeSteps cho phép đổi model khi một model treo (attemptMs)", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValue({ steps: ["Chia hai vế cho $2$ được $x = 4$.", "Vậy $x = 4$."] });
    const p = problemSchema.parse({ id: "T", title: "t", grade: 9, statement: "Giải $2x = 8$", solution: { x: 4 }, hints: [1, 2, 3].map((level) => ({ level, text: "g" })) });
    await makeSteps(cfg, p, "", 30_000);
    const opts = vi.mocked(askJson).mock.calls[0][4] as { attemptMs?: number; deadlineMs?: number };
    expect(opts.attemptMs).toBe(15_000);
    expect(opts.deadlineMs).toBe(30_000);
  });
});

import { proofKey } from "../lib/solve";
describe("proofKey", () => {
  it("không phải đề chứng minh thì không gọi AI; có thì dùng model mạnh hơn và trả đáp án", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValue({ answer: " H là tâm đường tròn nội tiếp tam giác DEF " });
    expect(await proofKey(cfg, { statement: "Giải $2x = 8$" })).toBeNull();
    expect(askJson).not.toHaveBeenCalled();
    expect(await proofKey(cfg, { statement: "Chứng minh A. Xác định tâm." })).toBe("H là tâm đường tròn nội tiếp tam giác DEF");
    expect((vi.mocked(askJson).mock.calls[0][0] as LlmCfg).model).not.toBe("m");
  });
});

import { fallbackChain } from "../lib/models";
describe("chuỗi model dự phòng", () => {
  it("bỏ model chậm gemini-3.1-flash-lite, giữ thứ tự còn lại", () => {
    const c = fallbackChain("gemini", "gemini-3.5-flash-lite");
    expect(c).not.toContain("gemini-3.1-flash-lite");
    expect(c[0]).toBe("gemini-3.5-flash-lite");
    expect(c.length).toBeGreaterThan(1);
  });
});
