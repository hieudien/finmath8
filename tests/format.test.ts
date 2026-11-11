import { describe, it, expect } from "vitest";
import { tidyStatement, tidyLine, repairProblem } from "../lib/repair";
import { problemSchema } from "../lib/schema/problem";
import { plain } from "../lib/plain";

const BS = String.fromCharCode(92);

describe("trình bày đề và lời giải (ca hệ phương trình có tham số)", () => {
  it("đề: bỏ dấu \\ thừa trước a) b) và tách mỗi ý một dòng", () => {
    const s = `Câu 1: Cho hệ $(I)$ ($m$ là tham số). ${BS}a) Giải hệ $(I)$ khi $m = 1$. ${BS}b) Tìm $m$ để hệ $(I)$ có nghiệm duy nhất.`;
    const r = tidyStatement(s);
    expect(r).not.toContain(`${BS}a)`);
    expect(r.split("\n").filter((l) => /^[ab]\) /.test(l))).toHaveLength(2);
  });

  const SYS = `$${BS}begin{cases} x + 2y = m + 3 ${BS}${BS} 2x - 3y = m ${BS}end{cases}$`;

  it("đề: (I) và câu dẫn nằm cùng dòng với hệ như đề gốc; ý a) b) xuống dòng", () => {
    const r = tidyStatement(`Câu 1: Cho hệ phương trình ${SYS} $(I)$ ($m$ là tham số). a) Giải $(I)$ khi $m = 1$. b) Tìm $m$ để hệ $(I)$ có nghiệm.`);
    const lines = r.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(`Câu 1: Cho hệ phương trình ${SYS} $(I)$ ($m$ là tham số).`);
    expect(lines[1]).toMatch(/^a\) /);
    expect(lines[2]).toMatch(/^b\) /);
  });

  it("đề: dấu \\ ngắt dòng lạc (\\ a), \\ b), ¦) ngoài công thức bị bỏ, trong công thức giữ nguyên", () => {
    const r = tidyStatement(`Cho hệ ${SYS} $(I)$. ${BS} a) Giải khi $m = 1$. ${BS} b) Tìm $m$.`);
    expect(r.replace(/\$[^$]+\$/g, "")).not.toContain(BS);
    expect(r).toContain(`${BS}${BS} 2x - 3y`);
    expect(r.split("\n").filter((l) => /^[ab]\) /.test(l))).toHaveLength(2);
  });

  it("đề: hệ đứng cuối câu hoặc ngay trước a) vẫn ở dòng riêng; đề không có hệ không bị đổi; hai hệ trong một đề", () => {
    expect(tidyStatement(`Giải hệ ${SYS}.`)).toBe(`Giải hệ\n${SYS}.`);
    expect(tidyStatement("Câu 1: Tính $2 + 3$. a) Cộng. b) Trừ.")).toBe("Câu 1: Tính $2 + 3$.\na) Cộng.\nb) Trừ.");
    const two = tidyStatement(`Cho ${SYS} (I) và ${SYS} (II). Tìm $m$.`);
    expect(two.split("\n")).toHaveLength(1);
  });

  it("lời giải: dấu \\ lạc cuối dòng hoặc trước nhãn ý bị bỏ", () => {
    expect(tidyLine(`a) Thay $m = 1$ vào hệ. ${BS}`)).toBe("a) Thay $m = 1$ vào hệ.");
    expect(tidyLine(`${BS}b) Giải tiếp.`)).toBe("b) Giải tiếp.");
  });

  it("lời giải: bọc $...$ quanh công thức còn trần, không đụng chữ thường", () => {
    const r = tidyLine(`Suy ra x = ${BS}frac{5m + 9}{7}, tiếp theo y = 3${BS}left(${BS}frac{5m + 9}{7}${BS}right) - 2m - 3.`);
    expect(r).toBe(`Suy ra $x = ${BS}frac{5m + 9}{7}$, tiếp theo $y = 3${BS}left(${BS}frac{5m + 9}{7}${BS}right) - 2m - 3$.`);
  });

  it("lời giải: hệ cases trần được bọc, câu không có lệnh LaTeX giữ nguyên", () => {
    expect(tidyLine(`Ta được ${BS}begin{cases} x + 2y = 4 ${BS}${BS} 2x - 3y = 1 ${BS}end{cases}.`)).toContain(`$${BS}begin{cases}`);
    expect(tidyLine("Tiền giảm là 300000 x 0,15 = 45000.")).toBe("Tiền giảm là 300000 x 0,15 = 45000.");
  });

  it("repairProblem: một phần tử nhiều dòng tách thành nhiều bước, không cắt trong $...$", () => {
    const p = problemSchema.parse({ id: "T", title: "t", grade: 9, statement: "s", solution: { x: 1 }, solution_steps: ["a) Thay m = 1.\nNhân hai vế với 2.\nb) Cho $\\begin{cases} x = 1 \\\\\ny = 2 \\end{cases}$ thì sao."], hints: [1, 2, 3].map((level) => ({ level, text: "g" })) });
    const r = repairProblem(p).solution_steps;
    expect(r).toHaveLength(3);
    expect(r[2]).toContain("\\begin{cases}");
  });

  it("repairProblem: cases mất dấu \\ (\\ đơn ngăn hàng, \\ end) được trả về \\\\ và \\end", () => {
    const bad = `Ta được $${BS}begin{cases} x + 2y = 4 ${BS} 2x - 3y = 1 ${BS} end{cases}$.`;
    const p = problemSchema.parse({ id: "T", title: "t", grade: 9, statement: "s", solution: { x: 1 }, solution_steps: [bad, "Vậy x = 1."], hints: [1, 2, 3].map((level) => ({ level, text: "g" })) });
    expect(repairProblem(p).solution_steps[0]).toBe(`Ta được $${BS}begin{cases} x + 2y = 4 ${BS}${BS} 2x - 3y = 1 ${BS}end{cases}$.`);
  });

  it("đề và lời giải từ bước AI giải (\\begin thành \\b, \\frac thành \\f) được sửa nên lint không báo ký tự điều khiển", () => {
    const c = String.fromCharCode;
    const p = problemSchema.parse({
      id: "T", title: "t", grade: 9, statement: `Cho hệ $${c(8)}egin{cases} x = 1 ${BS}${BS} y = 2 ${c(8)}nd{cases}$ khi $${c(12)}rac{1}{2}$.`.replace(`${c(8)}nd`, `${BS}end`), solution: { x: 1 },
      solution_steps: [`Ta có $${c(12)}rac{1}{2}$.`, `Hệ $${c(8)}egin{cases} x = 1 ${BS}${BS} y = 2 ${BS}end{cases}$.`], hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    });
    const r = repairProblem(p);
    expect([r.statement, ...r.solution_steps].some((t) => /[\t\f\b\v\r]/.test(t))).toBe(false);
    expect(r.solution_steps[0]).toContain(`${BS}frac{1}{2}`);
    expect(r.statement).toContain(`${BS}begin{cases}`);
  });

  it("plain: \\left \\right không còn thành chữ, cases ngăn bằng \\ đơn vẫn tách hàng", () => {
    expect(plain(`3${BS}left(${BS}frac{1}{7}${BS}right) - 2`)).toBe("3((1)/(7)) - 2");
    expect(plain(`${BS}begin{cases} x = 4 ${BS} y = 1 ${BS}end{cases}`)).toBe("Hệ: x = 4; y = 1");
  });
});
