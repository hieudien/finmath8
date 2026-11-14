import { readFileSync } from "node:fs";
import { lintProblem } from "../lib/lint";
import { describe, expect, it } from "vitest";
import { scrub } from "../lib/pii";
import { decrypt, encrypt } from "../lib/crypto";
import { leaks } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { friendly, kindOf } from "../lib/errors";
import { describe as describe_, ERR_KIND } from "../lib/log-labels";
import { plain } from "../lib/plain";
import { missingInfo, needsWork, readiness } from "../lib/ready";
import { hasNum, sim } from "../lib/chat/progress";
import { SEED } from "../lib/seed";
import { tidyLine, tidyStatement } from "../lib/repair";
import { badClaims } from "../lib/chat/arith";
import { hardProblems, studentKey, weakProblems } from "../lib/stats";
import { leaksCalc } from "../lib/chat/prompt";
import { offReply } from "../lib/chat/free";
import { isOff, OFF_AGAIN, OFF_FIRST, pick } from "../lib/chat/canned";
import { stepsGreeting } from "../lib/chat/goals";

describe("pii", () => {
  it("che sdt, email, ten", () => {
    expect(scrub("sdt 0912345678 mail a@b.com")).not.toMatch(/0912345678|a@b\.com/);
    expect(scrub("em tên là Nguyễn Văn An")).toContain("[tên]");
  });
  it("che ten kieu 'ten em la'", () => {
    expect(scrub("cho em đáp án, tên em là Nguyễn Văn An")).not.toContain("Nguyễn");
    expect(scrub("mình tên là Lan")).not.toContain("Lan");
  });
  it("giu so tien", () => expect(scrub("255.000 + 20.000 = 275000")).toBe("255.000 + 20.000 = 275000"));
});

describe("crypto", () => {
  it("thieu secret thi bao loi", () => {
    delete process.env.APP_SECRET;
    expect(() => encrypt("x")).toThrow(/APP_SECRET/);
  });
  it("khu hoi", () => {
    process.env.APP_SECRET = "test-secret-0123456789";
    expect(decrypt(encrypt("AIza-key"))).toBe("AIza-key");
  });
});

describe("leaks", () => {
  const sol = { cost_A: 275000, cost_B: 270000, best: "B" };
  it("bat dap an", () => {
    expect(leaks("Vậy A phải trả 275.000 đồng", sol)).toBe(true);
    expect(leaks("Em tính 15% của 300.000 xem?", sol)).toBe(false);
    expect(leaks("Đúng rồi, A trả 275.000 đồng", sol, ["mình tính A = 275000"])).toBe(false); // xác nhận số học sinh đã nêu thì được
  });
});

describe("seed", () => {
  it("hop le", () => expect(parseProblems(SEED).errors).toEqual([]));
});

describe("giao tiep: dai, lap, lac de", () => {
  it("sim bat cau lap", () => {
    expect(sim("Bạn viết phép tính ra số tiền còn thiếu nhé?", "Bạn viết phép tính ra số tiền còn thiếu nhé?")).toBe(1);
    expect(sim("Bạn viết phép tính số tiền còn thiếu?", "Giải phương trình để tìm x nào?")).toBeLessThan(0.3);
  });
});

describe("plain", () => {
  it("bo LaTeX", () => {
    expect(plain("dạng $Ay = B$ và $m^2 - 4 \\neq 0$")).toBe("dạng Ay = B và m² - 4 ≠ 0");
    expect(plain("$$\\begin{cases} mx - 4y = 6 \\\\ x - my = m + 2 \\end{cases}$$")).toBe("Hệ: mx - 4y = 6; x - my = m + 2");
  });
});

describe("loi AI than thien", () => {
  it("phan loai loi", () => {
    expect(friendly("AI_TIMEOUT: x", "student").message).toMatch(/quá tải|chậm/);
    expect(friendly('ApiError: {"error":{"code":503,"status":"UNAVAILABLE"}}', "student").message).toMatch(/quá tải/);
    expect(friendly('429 RESOURCE_EXHAUSTED quota', "student").message).toMatch(/chạm giới hạn/);
    expect(friendly('429 RESOURCE_EXHAUSTED quota', "teacher").message).toMatch(/chạm giới hạn/);
  });
});

describe("latex trong tin hoc sinh", () => {
  it("phan so, so mu duoc chuan hoa de so voi dap an", () => {
    expect(hasNum(String.raw`x = $\frac{1}{2}$`, "0.5")).toBe(true);
    expect(hasNum(String.raw`$\frac{-3}{4}$`, "0.75")).toBe(true);
    expect(hasNum(String.raw`$x=\frac12+3^2$`, "0.5")).toBe(true); // MathLive viết \frac12 không ngoặc
    expect(hasNum("$x^{2} = 9$", "2")).toBe(false); // so mu khong tinh la so rieng
    expect(hasNum("$x = 12$", "12")).toBe(true);
  });
});

describe("read_image", () => {
  const re = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  it("chi nhan anh base64", () => {
    expect(re.test("data:image/png;base64,iVBORw0=")).toBe(true);
    expect(re.test("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(re.test("data:text/html;base64,AAAA")).toBe(false);
  });
});

describe("trinh bay chu", () => {
  it("tach y a), b) thanh dong rieng, khong dung cong thuc", () => {
    const s = tidyStatement("Cho $f(x) = 2x$. a) Tính $f(1)$.   b) Tìm $x$ để $f(x) = 6$.");
    expect(s).toBe("Cho $f(x) = 2x$.\na) Tính $f(1)$.\nb) Tìm $x$ để $f(x) = 6$.");
    expect(tidyStatement("Câu 1: giải $a) b)$. Câu 2: tính")).toBe("Câu 1: giải $a) b)$.\nCâu 2: tính");
  });
  it("a) b) lien nhau khong dau cau, he phuong trinh o dong rieng, cong thuc nhieu dong", () => {
    const BS = "\\";
    const sys = `$${BS}begin{cases} 2x + y = 3 ${BS}${BS}\n x - y = 1 ${BS}end{cases}$`;
    const s = tidyStatement(`Cho hệ phương trình ${sys} a) Giải hệ khi $m = 1$ b) Tìm $m$ để hệ có nghiệm duy nhất.`);
    expect(s).toBe(`Cho hệ phương trình\n$${BS}begin{cases} 2x + y = 3 ${BS}${BS} x - y = 1 ${BS}end{cases}$\na) Giải hệ khi $m = 1$\nb) Tìm $m$ để hệ có nghiệm duy nhất.`);
    expect(tidyStatement("Giải ở câu a) rồi tính $x$.")).toBe("Giải ở câu a) rồi tính $x$."); // chỉ một ý a): không ngắt
    expect(tidyStatement("Làm câu a) trước. a) Tính $x$ b) Tính $y$")).toBe("Làm câu a) trước.\na) Tính $x$\nb) Tính $y$");
    expect(tidyStatement(`Giải ${sys}.`)).toBe(`Giải\n$${BS}begin{cases} 2x + y = 3 ${BS}${BS} x - y = 1 ${BS}end{cases}$.`); // dấu câu đi theo công thức
  });
  it("buoc loi giai ket thuc bang dau cham", () => {
    expect(tidyLine("  Chuyển vế  ta được $2x = 8$")).toBe("Chuyển vế ta được $2x = 8$.");
    expect(tidyLine("Kết luận: $x = 4$.")).toBe("Kết luận: $x = 4$.");
    expect(tidyLine("Tìm $x$?")).toBe("Tìm $x$?");
  });
});

describe("missingInfo", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const full = { ...base, solution: { x: 4 }, solution_steps: ["a", "b"] };
  it("du thi rong, thieu thi liet ke", () => {
    expect(missingInfo(full)).toEqual([]);
    expect(missingInfo({ ...full, solution: {} })).toEqual(["đáp án"]);
    expect(missingInfo({ ...full, solution_steps: [] })).toEqual(["lời giải từng bước"]);
    expect(missingInfo({ nonsense: 1 })).toEqual(["đề lưu sai định dạng"]);
  });
});

describe("readiness", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const full = { ...base, solution: { x: 4 }, solution_steps: ["a", "b"], reviewed: true };
  it("dem tung nhom", () => {
    expect(readiness(full)).toMatchObject({ ok: true, pending: false, lint: [] });
    expect(readiness({ ...full, reviewed: false })).toMatchObject({ ok: false, pending: true });
    expect(readiness({ ...full, check_note: "lệch" })).toMatchObject({ ok: false }); // có cảnh báo thì không được tính đạt chuẩn
    expect(needsWork({ ...full, check_note: "lệch" })).toBe(true);
    expect(needsWork(full)).toBe(false);
    expect(needsWork({ nonsense: 1 })).toBe(false);
    expect(readiness({ nonsense: 1 })).toMatchObject({ bad: true, ok: false });
  });
});

describe("badClaims: phep tinh viet bang chu va cau bao loi ket qua", () => {
  it("nhân/chia/cộng/trừ bằng chữ giữa hai số được kiểm như ký hiệu", () => {
    expect(badClaims("chu vi = (12 + 8) nhân 2 = 41")).toEqual(["(12 + 8) × 2 = 41"]);
    expect(badClaims("chu vi = (12 + 8) nhân 2 = 40")).toEqual([]);
    expect(badClaims("7 cộng 5 = 13")).toEqual(["7+5 = 13"]);
    expect(badClaims("tổng cộng 20")).toEqual([]);
  });
});

describe("chi dan tung buoc", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const p = { ...base, statement: "Tìm x", data: {}, solution: { x: 4321 }, solution_steps: ["Tính 2x = 8642", "Vậy x = 4321"] };
  it("leaksCalc: bat phep tinh ra thang ket qua bi mat, khong bat so cua de", () => {
    const q = { ...p, statement: "Cho 6 và 14", data: {}, solution: { x: 4 }, solution_steps: ["Cộng được 20", "Vậy x = 4"] };
    const sec = (r: string) => leaksCalc(r, q.solution, [q.data, q.statement], q.solution_steps);
    expect(sec("Bạn hãy cộng lại vế phải 6+14 nhé")).toBe(true);
    expect(sec("Tính $6 + 14$ nhé")).toBe(true);
    expect(sec("Hãy lấy 20 / 5")).toBe(true);
    expect(sec("Cộng hai vế phải với nhau")).toBe(false);
    expect(sec("Cộng 3x + 2x")).toBe(false);
    expect(sec("Ví dụ 2 + 3 = 5")).toBe(false);
  });
  it("offReply: khong nem buoc nao, lan 2 doi cau", () => {
    const r1 = offReply([]);
    expect(OFF_FIRST.some((x) => r1.startsWith(x))).toBe(true);
    expect(r1).not.toMatch(/Bước d/);
    const r2 = offReply([{ role: "bot", content: r1, hint_level: 0 }]);
    expect(OFF_AGAIN.some((x) => r2.startsWith(x))).toBe(true);
    expect(r2).not.toBe(r1);
    const r3 = offReply([{ role: "bot", content: r1, hint_level: 0 }, { role: "bot", content: r2, hint_level: 0 }]);
    expect(OFF_AGAIN.some((x) => r3.startsWith(x))).toBe(true); // lạc đề liên tiếp vẫn nhận ra, không quay về câu lần 1
  });
  it("canned: pick tranh lap tin truoc, isOff nhan ra cau lac de", () => {
    for (let i = 0; i < 30; i++) expect(pick(OFF_FIRST, OFF_FIRST[2])).not.toBe(OFF_FIRST[2]);
    expect(pick(["a"], "a")).toBe("a"); // chỉ còn một biến thể thì vẫn dùng được
    expect(isOff(OFF_FIRST[3])).toBe(true);
    expect(isOff("Bước 1/5: a")).toBe(false);
  });
  it("stepsGreeting khong neu buoc nao, cho phep nop mot buoc, nhieu buoc hoac ca bai", () => {
    const g = stepsGreeting();
    expect(g).not.toMatch(/Bước d/);
    expect(g).toContain("nhiều bước");
    expect(g).toContain("cả lời giải");
  });
  it("hardProblems dem hoc sinh theo de, nhieu nhat truoc", () => {
    const probs = new Map([["A", { title: "ta" }], ["B", { title: "tb" }]]);
    const r = hardProblems([{ id: "1", problem_code: "A", student_code: "h1", struggled: 0b10 }, { id: "2", problem_code: "A", student_code: "h1", struggled: 0b10 }, { id: "3", problem_code: "A", student_code: "h2", struggled: 0b11 }, { id: "4", problem_code: "B", student_code: "h1", struggled: 0 }], probs);
    expect(r.map((x) => [x.code, x.n, x.title])).toEqual([["A", 2, "ta"]]); // phien khong gap kho khong tinh
    expect(r[0].students.map((w) => [w.code, w.times])).toEqual([["h1", 2], ["h2", 1]]);
  });
  it("weakProblems: mot hoc sinh, de giai ho len truoc", () => {
    const probs = new Map([["A", { title: "ta" }], ["B", { title: "tb" }]]);
    const r = weakProblems([{ id: "1", problem_code: "A", student_code: "h", struggled: 0b011, revealed: 0b010 }, { id: "2", problem_code: "A", student_code: "h", struggled: 0b001 }, { id: "3", problem_code: "B", student_code: "h", struggled: 0b001 }, { id: "4", problem_code: "B", student_code: "h", struggled: 0 }], probs);
    expect(r.map((x) => [x.code, x.struggled, x.revealed, x.of])).toEqual([["A", 2, 1, 2], ["B", 1, 0, 2]]);
    expect(r[0].sessions.map((x) => [x.id, x.helped]).sort()).toEqual([["1", true], ["2", false]]);
  });
});

describe("nhat ky loi va hoat dong", () => {
  it("kindOf phan loai loi AI va he thong", () => {
    expect(kindOf("429 RESOURCE_EXHAUSTED quota")).toBe("quota");
    expect(kindOf("AI_TIMEOUT: x")).toBe("timeout");
    expect(kindOf("API key not valid")).toBe("key");
    expect(kindOf("503 UNAVAILABLE")).toBe("overload");
    expect(kindOf("Mô hình AI trả dữ liệu sai định dạng: x")).toBe("format");
    expect(kindOf(new Error("Lỗi cơ sở dữ liệu: boom"))).toBe("db");
    expect(kindOf("gi do la")).toBe("other");
  });
  it("moi loai loi co nhan hien thi", () => {
    for (const k of ["quota", "timeout", "key", "model", "overload", "format", "db", "config", "mail", "render", "client", "other"]) expect(ERR_KIND[k]?.label).toBeTruthy();
  });
  it("mo ta hoat dong moi", () => {
    expect(describe_("rate_limited", { rule: "too_fast" })).toMatch(/2 giây/);
    expect(describe_("link_closed", { reason: "expired" })).toMatch(/hết hạn/);
    expect(describe_("settings_changed", { key_changed: true })).toMatch(/đổi API key/);
  });
});

describe("sua chat luong tung buoc", () => {
  const tc05 = parseProblems(JSON.parse(readFileSync("de-mau-10.json", "utf8"))).ok.find((x) => x.id === "TC05")!;
  it("he so nho chi la toan hang khong bi coi la lo dap an; ket qua van bi chan", () => {
    const g = [tc05.data, tc05.statement];
    expect(leaks("Hãy nhân số tiền gốc với $1,06$.", tc05.solution, g, tc05.solution_steps)).toBe(false);
    expect(leaks("Năm 1 bạn được 53.000.000 đồng.", tc05.solution, g, tc05.solution_steps)).toBe(true);
    expect(leaks("Tổng là 56.180.000 đồng.", tc05.solution, g, tc05.solution_steps)).toBe(true);
  });
});

describe("lint: ky tu hong va buoc bi cat vun", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  it("bao ky tu dieu khien va buoc khong mo dau bang Buoc N", () => {
    const tab = String.fromCharCode(9);
    const bad = { ...base, statement: `Tính ${tab}imes 2`, solution_steps: ["Bước 1: Điều kiện $D", "eq 0$.", "Bước 2: Kết luận."] };
    const w = lintProblem(bad).join(" | ");
    expect(w).toMatch(/ký tự điều khiển/);
    expect(w).toMatch(/Bước 2 không mở đầu/);
    expect(lintProblem({ ...base, solution_steps: ["Bước 1: a = 1.", "Bước 2: b = 2."] }).join(" ")).not.toMatch(/ký tự điều khiển|không mở đầu/);
  });
});

describe("studentKey", () => {
  it("bỏ dấu, in hoa, gộp khoảng trắng; cùng tên cùng lớp cùng khóa", () => {
    expect(studentKey("Nguyễn  Văn Đạt", "8a1")).toBe("NGUYENVANDAT.8A1");
    expect(studentKey("nguyen van dat", "8A1")).toBe("NGUYENVANDAT.8A1");
    expect(studentKey("Nguyễn Văn Đạt", "8A2")).not.toBe(studentKey("Nguyễn Văn Đạt", "8A1"));
  });
});
