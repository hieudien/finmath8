import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/llm", () => ({ askJson: vi.fn() }));
vi.mock("../lib/errors", () => ({ reportError: vi.fn(async () => "REF") }));

import { askJson } from "../lib/llm";
import { makeStepGuides } from "../lib/step-guides";
import { lintProblem } from "../lib/lint";
import { walk } from "../lib/latex-fix";
import { problemSchema } from "../lib/schema/problem";
import type { LlmCfg } from "../lib/llm";

const BS = String.fromCharCode(92);
const c = String.fromCharCode;
const cfg = { provider: "gemini", key: "k", model: "m", temperature: 0 } as unknown as LlmCfg;
const base = () => problemSchema.parse({
  id: "T", title: "t", grade: 9, statement: "Giải $2x = 8$", solution: { x: 4 }, solution_steps: ["Chia hai vế cho $2$.", "Vậy $x = 4$."],
  hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
});

describe("chỉ dẫn từng bước: ký tự điều khiển do JSON nuốt dấu \\", () => {
  it("makeStepGuides trả ký tự điều khiển về lệnh LaTeX trong goal, hints, why", async () => {
    const step = (hint: string) => ({ goal: "Chia hai vế", hints: [hint, "Dùng phép chia.", "Chia cả hai vế."], result: "", accepts: [], traps: [] });
    vi.mocked(askJson).mockReset().mockResolvedValue({ steps: [step(`Nhân ${c(9)}imes hai vế`), { ...step(`Phân số ${c(12)}rac{1}{2}`), goal: `Tính ${c(8)}eta` }] });
    const g = await makeStepGuides(cfg, base());
    expect(g).not.toBeNull();
    expect(g!.hints[0][0]).toBe(`Nhân ${BS}times hai vế`);
    expect(g!.hints[1][0]).toBe(`Phân số ${BS}frac{1}{2}`);
    expect(g!.goals[1]).toBe(`Tính ${BS}beta`);
  });

  it("walk: \\alpha bị nuốt thành ký tự chuông cũng được trả lại", () => {
    expect(walk({ a: [`${c(7)}lpha + ${c(7)}pprox`] })).toEqual({ a: [`${BS}alpha + ${BS}approx`] });
  });

  it("hệ cases: \\ đơn ngăn hàng, \\begin thay chỗ \\end, \\n + end: đều về dạng đúng; chuỗi đúng giữ nguyên", () => {
    const good = `$${BS}begin{cases} x = 1 ${BS}${BS} y = 2 ${BS}end{cases}$`;
    const single = `$${BS}begin{cases} x = 1 ${BS} y = 2 ${BS}end{cases}$`;
    const swapped = `$${BS}begin{cases} x = 1 ${BS}${BS} y = 2 ${BS}begin{cases}$`;
    const nl = `$${c(8)}egin{cases} x = 1 ${BS} y = 2 ${c(10)}end{cases}$`;
    for (const bad of [single, swapped, nl]) expect(walk(bad)).toBe(good);
    expect(walk(good)).toBe(good);
    const two = `${good} và ${good}`;
    expect(walk(two)).toBe(two);
  });

  it("lint nêu rõ chỗ hỏng: chỉ dẫn bước 2, lời giải bước 1, gợi ý mức 3", () => {
    const p = { ...base(), step_hints: [["ok"], [`Nhân ${c(9)}imes`]] };
    expect(lintProblem(p).join(" ")).toMatch(/chỉ dẫn bước 2/);
    expect(lintProblem({ ...base(), solution_steps: [`Tính ${c(12)}rac{1}{2}.`, "Vậy $x = 4$."] }).join(" ")).toMatch(/lời giải bước 1/);
    expect(lintProblem({ ...base(), hints: [1, 2, 3].map((level) => ({ level, text: level === 3 ? `a${c(7)}b` : "g" })) }).join(" ")).toMatch(/gợi ý mức 3/);
    expect(lintProblem(base()).join(" ")).not.toMatch(/ký tự điều khiển/);
  });
});
