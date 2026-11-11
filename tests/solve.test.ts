import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/llm", () => ({ askText: vi.fn() }));

import { askText } from "../lib/llm";
import type { LlmCfg } from "../lib/llm";
import { parseSolved, fracToNumber, tidyAnswers, sameAnswers, solveReliable, verifyBySubstitution } from "../lib/solve";
import { tagged } from "../lib/tagged";

const cfg = { provider: "gemini", key: "k", model: "m", temperature: 0 } as unknown as LlmCfg;
const P = { statement: "Tìm $m$ ...", grade: 9 };
const solved = (ans: string) => `<loi_giai>\nBước một.\nBước hai.\n</loi_giai>\n<kiem_tra>\nthay m = 1: khớp\n</kiem_tra>\n<dap_an>\n${ans}\n</dap_an>`;
const verdict = (v: string) => `<tinh>\nthay số\n</tinh>\n<ket_qua>\n${v}\n</ket_qua>`;
const ask = vi.mocked(askText);

describe("tagged và parseSolved", () => {
  it("tách thẻ, thiếu thẻ đóng vẫn lấy được, thẻ vắng là null", () => {
    expect(tagged("lời dẫn <a>1</a> <b>2", ["a", "b", "c"])).toEqual({ a: "1", b: "2", c: null });
  });
  it("tách lời giải, kiểm tra, đáp án; phân số thành số", () => {
    const r = parseSolved(solved("m = 14/3\nx = 2\nket_luan = m = 14/3"));
    expect(r!.steps).toEqual(["Bước một.", "Bước hai."]);
    expect(r!.check).toMatch(/khớp/);
    expect(r!.answers.m).toBeCloseTo(4.666667, 5);
    expect(r!.answers.x).toBe(2);
  });
  it("không có đáp án thì null", () => {
    expect(parseSolved("<loi_giai>a</loi_giai>")).toBeNull();
    expect(parseSolved("không có thẻ")).toBeNull();
  });
  it("fracToNumber chỉ đổi dạng a/b", () => {
    expect(fracToNumber({ a: "1/4", b: "-3/2", c: "x/2", d: 5 })).toEqual({ a: 0.25, b: -1.5, c: "x/2", d: 5 });
  });
});

describe("tidyAnswers", () => {
  it("\"m = -6\" và \"$m = 14/3$\" thành số có tên; chữ khác giữ nguyên", () => {
    expect(tidyAnswers({ ket_luan: "m = -6", x: 2 })).toEqual({ m: -6, x: 2 });
    expect(tidyAnswers({ ket_luan: "$m = 14/3$" }).m).toBeCloseTo(4.666667, 5);
    expect(tidyAnswers({ ket_luan: "vô nghiệm", s: "(4; -3)" })).toEqual({ ket_luan: "vô nghiệm", s: "(4; -3)" });
  });
  it("vote coi {ket_luan: \"m = -6\"} và {m: -6} là cùng đáp án", () => {
    expect(sameAnswers(tidyAnswers({ ket_luan: "m = -6" }), { m: -6 })).toBe(true);
  });
});

describe("sameAnswers", () => {
  it("cùng số không kể thứ tự và tên; khác số thì không", () => {
    expect(sameAnswers({ x: 2, y: 1 }, { b: 1, a: 2 })).toBe(true);
    expect(sameAnswers({ m: -6 }, { m: -9 })).toBe(false);
    expect(sameAnswers({ m: -6 }, { m: -6, x: 2 })).toBe(false);
  });
  it("đáp án chữ so chuỗi chính tắc", () => {
    expect(sameAnswers({ ket_luan: "vô nghiệm" }, { ket_luan: "Vô nghiệm" })).toBe(true);
    expect(sameAnswers({ ket_luan: "vô nghiệm" }, { ket_luan: "m khác 2" })).toBe(false);
  });
});

describe("verifyBySubstitution", () => {
  it("đọc dung/sai từ khung kết quả", async () => {
    ask.mockReset().mockResolvedValueOnce(verdict("dung")).mockResolvedValueOnce(verdict("sai")).mockResolvedValueOnce(verdict("Đúng"));
    expect((await verifyBySubstitution(cfg, P, { m: -6 })).ok).toBe(true);
    expect((await verifyBySubstitution(cfg, P, { m: -9 })).ok).toBe(false);
    expect((await verifyBySubstitution(cfg, P, { m: -6 })).ok).toBe(true);
  });
});

describe("solveReliable", () => {
  it("once: một lần gọi, không có đáp án thì flagged", async () => {
    ask.mockReset().mockResolvedValueOnce(solved("m = -6"));
    const r = await solveReliable(cfg, P, "once");
    expect(r).toMatchObject({ flagged: false, calls: 1 });
    ask.mockReset().mockResolvedValueOnce("rác");
    expect((await solveReliable(cfg, P, "once")).flagged).toBe(true);
  });
  it("verify: thay số đạt thì nhận ngay (2 lần gọi)", async () => {
    ask.mockReset().mockResolvedValueOnce(solved("m = -6")).mockResolvedValueOnce(verdict("dung"));
    const r = await solveReliable(cfg, P, "verify");
    expect(r).toMatchObject({ flagged: false, calls: 2 });
    expect(r.solved!.answers.m).toBe(-6);
  });
  it("verify: đáp án sai bị loại, giải lại ra đáp án đúng và qua kiểm", async () => {
    ask.mockReset()
      .mockResolvedValueOnce(solved("m = -9")).mockResolvedValueOnce(verdict("sai"))
      .mockResolvedValueOnce(solved("m = -6")).mockResolvedValueOnce(verdict("dung"));
    const r = await solveReliable(cfg, P, "verify");
    expect(r).toMatchObject({ flagged: false, calls: 4 });
    expect(r.solved!.answers.m).toBe(-6);
  });
  it("verify: giải lại vẫn không qua kiểm thì flagged", async () => {
    ask.mockReset()
      .mockResolvedValueOnce(solved("m = -9")).mockResolvedValueOnce(verdict("sai"))
      .mockResolvedValueOnce(solved("m = -9")).mockResolvedValueOnce(verdict("sai"));
    const r = await solveReliable(cfg, P, "verify");
    expect(r.flagged).toBe(true);
    expect(r.why).toMatch(/thay số/);
  });
  it("vote: hai lần trùng thì nhận (2 lần gọi); lệch thì lần ba lấy đa số; ba khác nhau thì flagged", async () => {
    ask.mockReset().mockResolvedValueOnce(solved("m = -6")).mockResolvedValueOnce(solved("m = -6"));
    expect(await solveReliable(cfg, P, "vote")).toMatchObject({ flagged: false, calls: 2 });
    ask.mockReset().mockResolvedValueOnce(solved("m = -9")).mockResolvedValueOnce(solved("m = -6")).mockResolvedValueOnce(solved("m = -6"));
    const r = await solveReliable(cfg, P, "vote");
    expect(r).toMatchObject({ flagged: false, calls: 3 });
    expect(r.solved!.answers.m).toBe(-6);
    ask.mockReset().mockResolvedValueOnce(solved("m = 1")).mockResolvedValueOnce(solved("m = 2")).mockResolvedValueOnce(solved("m = 3"));
    expect((await solveReliable(cfg, P, "vote")).flagged).toBe(true);
  });
});
