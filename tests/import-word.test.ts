import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { parseMulti, readExamItems, stripLabel } from "../lib/read-multi";
import { blocks, chunkText, readDocx, TEXT_MAX } from "../lib/docx-read";
import { answersToLines } from "../lib/answers";
import { holdAnswer, looseAnswers, releaseAnswer, summary, viewOf, type BatchItem } from "../lib/import-batch";
import type { Problem } from "../lib/schema/problem";
import type { LlmCfg } from "../lib/llm";

const cfg = { provider: "gemini", key: "k", model: "m", temperature: 0 } as unknown as LlmCfg;
const bai = (de: string, dapan = "", cach = "") => `<bai>\n<de>\n${de}\n</de>\n<dapan>\n${dapan}\n</dapan>\n<cachgiai>\n${cach}\n</cachgiai>\n</bai>`;
const D1 = "Bài A.03: Tổng hai số bằng 51. Tìm hai số đó biết rằng $\\frac{2}{5}$ số thứ nhất thì bằng $\\frac{1}{6}$ số thứ hai.";
const D2 = "Bài 4: Theo kế hoạch hai tổ sản xuất được giao làm 600 sản phẩm. Tính số sản phẩm mỗi tổ làm theo kế hoạch.";

describe("stripLabel và parseMulti", () => {
  it("bỏ nhãn Bài 4, Bài A.03, Câu 2)", () => {
    expect(stripLabel("Bài A.03: Tổng hai số bằng 51.")).toBe("Tổng hai số bằng 51.");
    expect(stripLabel("Bài 4. Cho x = 2")).toBe("Cho x = 2");
    expect(stripLabel("Câu 2) Tìm x")).toBe("Tìm x");
    expect(stripLabel("Một ô tô đi từ A")).toBe("Một ô tô đi từ A");
  });
  it("tách nhiều đề, đáp số gắn đúng đề, đề không đáp số thì rỗng", () => {
    const r = parseMulti(bai(D1, "x1 = 15\nx2 = 36") + "\n" + bai(D2));
    expect(r).toHaveLength(2);
    expect(r[0].statement.startsWith("Tổng hai số")).toBe(true);
    expect(r[0].solution).toEqual({ x1: 15, x2: 36 });
    expect(r[1].solution).toEqual({});
    expect(r[1].statement.startsWith("Theo kế hoạch")).toBe(true);
  });
  it("chịu thiếu thẻ đóng và rào markdown; bỏ đề quá ngắn", () => {
    const r = parseMulti("```\n<bai><de>" + D2 + "</de><dapan>x = 3\n<bai><de>ngắn</de></bai>\n```");
    expect(r).toHaveLength(1);
    expect(r[0].solution).toEqual({ x: 3 });
  });
  it("không có thẻ thì rỗng", () => {
    expect(parseMulti("Đề 1: giải phương trình")).toEqual([]);
  });
});

describe("readExamItems", () => {
  it("đề sạch: một lượt", async () => {
    const ask = vi.fn(async () => bai(D1) + bai(D2));
    const r = await readExamItems(cfg, { text: "x".repeat(30) }, ask);
    expect(r.items).toHaveLength(2);
    expect(r.attempts).toBe(1);
  });
  it("đề lỗi công thức: đọc lại một lần, giữ bản ít lỗi", async () => {
    const hong = "Tổng hai số bằng 51, biết $\\frac{2}{5 số thứ nhất bằng số thứ hai nhé các em.";
    const ask = vi.fn().mockResolvedValueOnce(bai(hong)).mockResolvedValueOnce(bai(D1));
    const r = await readExamItems(cfg, { image: { mime: "image/png", b64: "AAAA" } }, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(r.items[0].warnings).toEqual([]);
  });
  it("không tách được đề nào thì ném lỗi", async () => {
    const ask = vi.fn(async () => "xin lỗi tôi không đọc được");
    await expect(readExamItems(cfg, { text: "x".repeat(30) }, ask)).rejects.toThrow(/Không tách được/);
  });
});

describe("docx", () => {
  const W = (b: string) => `<w:document xmlns:w="w" xmlns:r="r" xmlns:a="a" xmlns:m="m"><w:body>${b}</w:body></w:document>`;
  it("giữ đúng thứ tự chữ và ảnh, đọc cả công thức Word và ký tự đặc biệt XML", () => {
    const xml = W(`<w:p><w:r><w:t>Bài 1. 5 &amp; 6</w:t></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="rId4"/></w:drawing></w:r></w:p><w:p><m:oMath><m:r><m:t>x=2</m:t></m:r></m:oMath></w:p><w:p/>`);
    expect(blocks(xml)).toEqual([{ text: "Bài 1. 5 & 6" }, { embed: "rId4" }, { text: "x=2" }]);
  });
  it("gộp chữ liền nhau và cắt khi quá dài", () => {
    expect(chunkText(["a", "b"])).toEqual(["a\nb"]);
    const long = "x".repeat(TEXT_MAX - 10);
    expect(chunkText([long, long])).toHaveLength(2);
  });
  it("readDocx: ảnh theo thứ tự, bỏ định dạng không hỗ trợ, tệp rác báo lỗi", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", W(`<w:p><w:r><w:t>Đề chữ</w:t></w:r></w:p><w:p><a:blip r:embed="rId1"/></w:p><w:p><a:blip r:embed="rId2"/></w:p>`));
    zip.file("word/_rels/document.xml.rels", `<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/><Relationship Target="media/image2.emf" Id="rId2" Type="image"/></Relationships>`);
    zip.file("word/media/image1.png", new Uint8Array([137, 80, 78, 71]));
    zip.file("word/media/image2.emf", new Uint8Array([1, 2]));
    const { sources, skipped } = await readDocx(await zip.generateAsync({ type: "uint8array" }));
    expect(sources.map((s) => s.kind)).toEqual(["text", "image"]);
    expect(sources[1].kind === "image" && sources[1].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(skipped).toHaveLength(1);
    await expect(readDocx(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe("giữ đáp số mà không khóa", () => {
  const p = { solution: { x: 1 }, answer_locked: false } as never as Problem;
  it("có đáp số: khóa tạm cho AI, trả về luôn mở", () => {
    expect(holdAnswer(p, true).answer_locked).toBe(true);
    expect(releaseAnswer(holdAnswer(p, true)).answer_locked).toBe(false);
  });
  it("không có đáp số: không khóa", () => {
    expect(holdAnswer(p, false).answer_locked).toBe(false);
  });
});

describe("import-batch", () => {
  it("đáp số dòng <-> bản ghi", () => {
    const a = looseAnswers("x1 = 15\nx2 = 36\nket_luan = vô nghiệm\nrác");
    expect(a).toEqual({ x1: 15, x2: 36, ket_luan: "vô nghiệm" });
    expect(looseAnswers(answersToLines(a))).toEqual(a);
    expect(looseAnswers("")).toEqual({});
  });
  it("summary và viewOf", () => {
    const it = (status: BatchItem["status"], answers: Record<string, unknown> = {}, code?: string): BatchItem => ({ statement: "s", answers, steps: [], status, code });
    const items = [it("ok", { x: 1 }, "BT01"), it("review"), it("failed"), it("pending"), it("drafted")];
    expect(summary(items)).toEqual({ found: 5, ok: 1, review: 1, failed: 1, pending: 2, withAnswer: 1, saved: 1 });
    expect(viewOf(items)[0]).toMatchObject({ status: "ok", code: "BT01", drafted: false });
  });
});
