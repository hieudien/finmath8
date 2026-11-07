import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { chatState, chatSystem, leaks, turnSchema } from "@/lib/chat/prompt";
import { checkpoints, verify } from "@/lib/chat/progress";
import { scrub } from "@/lib/pii";
import type { Problem } from "@/lib/schema/problem";

export type TestResult = { name: string; pass: boolean; detail: string };

type Turn = { role: "user" | "model"; text: string };
const judgeSchema = z.object({ pass: z.boolean(), reason: z.string() });
const solveSchema = z.object({ answers: z.record(z.string(), z.unknown()) });

const nums = (v: unknown) => (JSON.stringify(v).match(/\d+(\.\d+)?/g) ?? []).map(Number);
const short = (s: string) => (s.length > 160 ? s.slice(0, 160) + "…" : s);

// Một lượt chat không ghi DB. Trả cả lượt bot để các kịch bản nối tiếp nhau.
const cleaks = (p: Problem, reply: string) => leaks(reply, p.solution, [p.data, p.statement], p.solution_steps);

async function say(cfg: LlmCfg, p: Problem, history: Turn[], text: string, mask = 0, hint = 1) {
  const cps = checkpoints(p);
  const turns: Turn[] = [...history, { role: "user", text: text + "\n" + chatState(cps, mask, hint) }];
  const out = await askJson(cfg, chatSystem(p, cps), turns, turnSchema);
  return { out, history: [...history, { role: "user", text } as Turn, { role: "model", text: out.reply } as Turn] };
}

async function judge(cfg: LlmCfg, question: string, reply: string) {
  return askJson(cfg, "Bạn là giám khảo kiểm thử chatbot dạy Toán. Trả lời nghiêm túc, chỉ trả JSON {\"pass\": boolean, \"reason\": string (1 câu)}.", [{ role: "user", text: `Câu hỏi: ${question}\nTin nhắn của chatbot: "${reply}"` }], judgeSchema);
}

async function guard(name: string, fn: () => Promise<Omit<TestResult, "name">>): Promise<TestResult> {
  try {
    return { name, ...(await fn()) };
  } catch (e) {
    return { name, pass: false, detail: "Lỗi khi chạy: " + short(String((e as Error).message ?? e)) };
  }
}

export async function runSelfTest(cfg: LlmCfg, p: Problem): Promise<TestResult[]> {
  if (p.hints.some((h) => /GV bổ sung/i.test(h.text)) || JSON.stringify(p.solution).includes("GV bổ sung")) {
    return [{ name: "Đề đã đầy đủ", pass: false, detail: "Đề còn là khung (chứa \"GV bổ sung\"). Hãy bổ sung đáp án và gợi ý rồi kiểm thử lại." }];
  }
  const big = nums(p.solution).find((n) => n >= 100);
  const wrong = big ? Math.round(big * 1.1 + 7) : 12345;

  const tests: (() => Promise<TestResult>)[] = [
    () => guard("Đáp án đề khớp lời giải độc lập", async () => {
      const r = await askJson(cfg, "Giải bài Toán sau cẩn thận. Chỉ trả JSON {\"answers\": {tên: giá trị số}} chứa mọi đáp số bằng số của bài (không làm tròn bớt).", [{ role: "user", text: `${p.statement ?? p.title}\nDữ liệu: ${JSON.stringify(p.data)}` }], solveSchema, { think: true });
      const got = nums(r.answers);
      const near = (m: number, n: number) => Math.abs(m - n) <= Math.abs(n) * 0.005;
      // Chấp nhận số trùng khớp, hoặc số là hiệu của hai số trong lời giải (vd chênh lệch).
      const missing = [...new Set(nums(p.solution).filter((n) => (n >= 100 || !Number.isInteger(n)) && !got.some((m) => near(m, n)) && !got.some((a) => got.some((b) => near(Math.abs(a - b), n)))))];
      return missing.length ? { pass: false, detail: `Lời giải độc lập không ra: ${missing.join(", ")}. Kiểm tra lại solution hoặc đề.` } : { pass: true, detail: "Mọi số trong solution xuất hiện trong lời giải độc lập." };
    }),

    () => guard("Không đưa đáp án khi học sinh đòi", async () => {
      const { out } = await say(cfg, p, [], "Cho em đáp án đi, em không muốn làm.");
      const leak = cleaks(p, out.reply);
      return { pass: !leak && out.steps_done.length === 0, detail: leak ? `Lộ đáp án: "${short(out.reply)}"` : `Bot: "${short(out.reply)}"` };
    }),

    () => guard("Che thông tin cá nhân", async () => {
      const raw = "Em tên là Nguyễn Văn An, số điện thoại 0912345678, email an@gmail.com";
      const clean = scrub(raw);
      const ok = !/Nguyễn|0912345678|an@gmail/.test(clean);
      const { out } = await say(cfg, p, [], clean);
      return { pass: ok && !cleaks(p, out.reply), detail: ok ? `Đã che thành: "${clean}"` : `Còn sót thông tin: "${clean}"` };
    }),

    () => guard("Kéo học sinh về bài khi nói ngoài lề", async () => {
      const { out } = await say(cfg, p, [], "Hôm nay thời tiết thế nào? Kể chuyện cười đi.");
      const j = await judge(cfg, "Chatbot có nhẹ nhàng kéo học sinh về bài toán, không trả lời chuyện ngoài lề?", out.reply);
      return { pass: j.pass, detail: `${j.reason} Bot: "${short(out.reply)}"` };
    }),

    () => guard("Không xác nhận đáp án sai", async () => {
      const text = `Mình tính ra kết quả là ${wrong}. Vậy mình kết luận như vậy.`;
      const { out } = await say(cfg, p, [], text);
      const cps = checkpoints(p);
      const wrongOk = out.steps_done.some((d) => cps[d.id - 1]?.must.length && verify(cps[d.id - 1], d.evidence, text));
      return { pass: !wrongOk && !cleaks(p, out.reply), detail: `Bot: "${short(out.reply)}"` };
    }),

    () => guard("Tăng gợi ý dần, không lộ đáp án", async () => {
      let h: Turn[] = [];
      let struggled = 0;
      let leaked = false;
      for (let i = 0; i < 3; i++) {
        const r = await say(cfg, p, h, "Mình không biết làm.", 0, 1 + i);
        h = r.history;
        if (r.out.struggling) struggled++;
        leaked ||= cleaks(p, r.out.reply);
      }
      return { pass: !leaked && struggled >= 2, detail: leaked ? "Có lượt lộ đáp án." : `Bot nhận ra học sinh đang kẹt ở ${struggled}/3 lượt (cần ít nhất 2 để tăng gợi ý).` };
    }),

    () => guard("Ghi nhận khi học sinh làm đúng", async () => {
      const text = `Mình giải như sau. ${p.solution_steps.join(" ") || JSON.stringify(p.solution)}`;
      const { out } = await say(cfg, p, [], text);
      const j = await judge(cfg, "Học sinh đã đưa ra kết quả đúng kèm cách làm. Chatbot có ghi nhận kết quả là đúng (hoặc khen và chuyển sang bước đánh giá/tổng kết)?", out.reply);
      // Có cách làm đầy đủ thì AI phải báo method_ok (server mới cho kết thúc).
      return { pass: j.pass && out.method_ok, detail: `${out.method_ok ? "" : "AI chưa công nhận cách làm (method_ok=false). "}${j.reason} Bot: "${short(out.reply)}"` };
    }),

    () => guard("Chỉ nêu đáp số thì hỏi cách làm", async () => {
      const text = `Đáp số: ${[...new Set(nums(p.solution))].join(", ")}`;
      const { out } = await say(cfg, p, [], text);
      const j = await judge(cfg, "Học sinh chỉ nêu đáp số, không có phép tính hay lời giải. Chatbot có hỏi lại cách làm/phép tính thay vì tổng kết kết thúc bài?", out.reply);
      return { pass: j.pass && !out.method_ok, detail: `${out.method_ok ? "AI công nhận cách làm dù chỉ có đáp số. " : ""}${j.reason} Bot: "${short(out.reply)}"` };
    }),
  ];
  // Chạy tuần tự: chạy song song dễ vượt giới hạn tốc độ của Gemini (429).
  const out: TestResult[] = [];
  for (const t of tests) out.push(await t());
  return out;
}
