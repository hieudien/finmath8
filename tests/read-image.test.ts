import { describe, it, expect, vi } from "vitest";
import { parseTagged, normalizeText, parseAnswers, readExamImage } from "../lib/read-image";
import { checkImageRead } from "../lib/image-check";
import type { LlmCfg } from "../lib/llm";

const BS = String.fromCharCode(92);
const SYS = `$${BS}begin{cases} x + 2y = m + 3 ${BS}${BS} 2x - 3y = m ${BS}end{cases}$`;
const DE = `Câu 1: Cho hệ phương trình ${SYS} $(I)$ ($m$ là tham số).\na) Giải hệ phương trình $(I)$ khi $m = 1$.\nb) Tìm $m$ để hệ $(I)$ có nghiệm duy nhất $(x; y)$ thỏa mãn $x + y = -3$.`;
const tagged = (de: string, dapan = "", cach = "") => `<de>\n${de}\n</de>\n<dapan>\n${dapan}\n</dapan>\n<cachgiai>\n${cach}\n</cachgiai>`;
const cfg = { provider: "gemini", key: "k", model: "m", temperature: 0 } as unknown as LlmCfg;
const img = { mime: "image/jpeg", b64: "AAAA" };
const legacy = vi.fn(async () => ({ statement: "Đề cũ $x = 1$.", solution: {}, solution_steps: [] as string[] }));

describe("parseTagged", () => {
  it("tách đủ ba thẻ", () => {
    expect(parseTagged(tagged("Đề $x$", "x = 3", "Bước một\nBước hai"))).toEqual({ de: "Đề $x$", dapan: "x = 3", cachgiai: "Bước một\nBước hai" });
  });
  it("thiếu thẻ đóng, có lời dẫn và rào markdown vẫn tách được", () => {
    const r = parseTagged("Đây là kết quả:\n```\n<de>Đề $x$\n<dapan>x = 3\n</dapan>\n```");
    expect(r).toEqual({ de: "Đề $x$", dapan: "x = 3", cachgiai: "" });
  });
  it("không có thẻ de thì null", () => {
    expect(parseTagged("Cho hệ phương trình ...")).toBeNull();
    expect(parseTagged('{"statement":"x"}')).toBeNull();
  });
});

describe("normalizeText và parseAnswers", () => {
  it("\\n dạng chữ ngoài công thức thành xuống dòng, trong công thức giữ nguyên", () => {
    expect(normalizeText(`tham số).${BS}n${BS}na) Giải $x ${BS}neq 0$.${BS}n${BS}nb) Tìm`)).toBe(`tham số).\n\na) Giải $x ${BS}neq 0$.\n\nb) Tìm`);
  });
  it("¦ ngoài công thức bỏ, trong công thức đổi lại thành \\", () => {
    expect(normalizeText("a ¦ b $¦frac{1}{2}$")).toBe(`a  b $${BS}frac{1}{2}$`);
  });
  it("đáp án dạng tên = giá trị", () => {
    expect(parseAnswers("x = 2\ny = -1.5\nket_luan = m khác -4\nlinh tinh")).toEqual({ x: 2, y: -1.5, ket_luan: "m khác -4" });
  });
});

describe("checkImageRead", () => {
  it("đề mẫu đạt", () => {
    expect(checkImageRead({ statement: DE, steps: [] })).toEqual([]);
  });
  it("bắt hệ thiếu dấu ngăn hàng", () => {
    const bad = DE.replace(`${BS}${BS} `, "");
    expect(checkImageRead({ statement: bad, steps: [] }).join(" ")).toMatch(/thiếu dấu ngăn/);
  });
  it("bắt $ lẻ, công thức lỗi, ¦ và lẫn lời giải", () => {
    expect(checkImageRead({ statement: "Tìm $x", steps: [] }).join(" ")).toMatch(/dấu \$ bị lẻ/);
    expect(checkImageRead({ statement: `Tính $${BS}frac{1}{$.`, steps: [] }).join(" ")).toMatch(/không dựng được/);
    expect(checkImageRead({ statement: "Tìm x", steps: ["a ¦ b"] }).join(" ")).toMatch(/¦/);
    expect(checkImageRead({ statement: "Tìm x\nLời giải: x = 2", steps: [] }).join(" ")).toMatch(/lời giải/);
    expect(checkImageRead({ statement: "", steps: [] })).toContain("Đề đang rỗng.");
  });
});

describe("readExamImage", () => {
  it("đúng ngay lần đầu: gọi 1 lần, không cảnh báo, (I) cùng dòng với hệ", async () => {
    const ask = vi.fn().mockResolvedValue(tagged(DE, "x = 2\ny = 1", "Thay m = 1."));
    const r = await readExamImage(cfg, img, legacy, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r.warnings).toEqual([]);
    expect(r.solution).toEqual({ x: 2, y: 1 });
    expect(r.statement.split("\n")[0]).toBe(`Câu 1: Cho hệ phương trình ${SYS} $(I)$ ($m$ là tham số).`);
    expect(r.statement.split("\n")).toHaveLength(3);
  });
  it("sai rồi đúng: gọi lại kèm danh sách lỗi, lấy kết quả đúng", async () => {
    const ask = vi.fn().mockResolvedValueOnce(tagged(DE.replace(`${BS}${BS} `, ""))).mockResolvedValueOnce(tagged(DE));
    const r = await readExamImage(cfg, img, legacy, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(r.attempts).toBe(2);
    expect(r.warnings).toEqual([]);
    const second = ask.mock.calls[1][2] as { role: string; text: string }[];
    expect(second.at(-1)!.text).toMatch(/thiếu dấu ngăn/);
    expect(second.at(-2)!.role).toBe("model");
  });
  it("sai cả ba lần: trả kết quả ít lỗi nhất kèm cảnh báo", async () => {
    const bad = DE.replace(`${BS}${BS} `, "");
    const worse = bad + " $x";
    const ask = vi.fn().mockResolvedValueOnce(tagged(worse)).mockResolvedValueOnce(tagged(bad)).mockResolvedValueOnce(tagged(worse));
    const r = await readExamImage(cfg, img, legacy, ask);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(r.warnings.join(" ")).toMatch(/thiếu dấu ngăn/);
    expect(r.warnings.join(" ")).not.toMatch(/dấu \$ bị lẻ/);
  });
  it("không tách được thẻ ở lần đầu: rơi về cách cũ", async () => {
    legacy.mockClear();
    const ask = vi.fn().mockResolvedValue('{"statement":"x"}');
    const r = await readExamImage(cfg, img, legacy, ask);
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(r.statement).toBe("Đề cũ $x = 1$.");
  });
  it("lỗi gọi model ở lần đầu thì ném ra, không nuốt", async () => {
    const ask = vi.fn().mockRejectedValue(new Error("AI_TIMEOUT"));
    await expect(readExamImage(cfg, img, legacy, ask)).rejects.toThrow(/AI_TIMEOUT/);
  });
  it("\\n dạng chữ trong kết quả model được sửa trước khi kiểm", async () => {
    const ask = vi.fn().mockResolvedValue(tagged(`Cho ${SYS} $(I)$.${BS}n${BS}na) Giải khi $m = 1$.${BS}n${BS}nb) Tìm $m$.`));
    const r = await readExamImage(cfg, img, legacy, ask);
    expect(r.statement).not.toContain(`${BS}n`);
    expect(r.statement.split("\n").filter((l) => /^[ab]\) /.test(l))).toHaveLength(2);
  });
});
