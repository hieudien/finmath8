import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { chatSystem, leaks, turnSchema } from "@/lib/chat/prompt";
import { scrub } from "@/lib/pii";
import type { Problem } from "@/lib/schema/problem";

export type TestResult = { name: string; pass: boolean; detail: string };

type Turn = { role: "user" | "model"; text: string };
const judgeSchema = z.object({ pass: z.boolean(), reason: z.string() });
const solveSchema = z.object({ answers: z.record(z.string(), z.unknown()) });

const nums = (v: unknown) => (JSON.stringify(v).match(/\d+(\.\d+)?/g) ?? []).map(Number);
const short = (s: string) => (s.length > 160 ? s.slice(0, 160) + "…" : s);

// Một lượt chat không ghi DB. Trả cả lượt bot để các kịch bản nối tiếp nhau.
async function say(cfg: LlmCfg, p: Problem, history: Turn[], text: string, step = 1, hint = 1) {
  const turns: Turn[] = [...history, { role: "user", text }];
  const out = await askJson(cfg, chatSystem(p, step, hint), turns, turnSchema);
  return { out, history: [...turns, { role: "model", text: out.reply } as Turn] };
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
      const r = await askJson(cfg, "Giải bài Toán sau cẩn thận. Chỉ trả JSON {\"answers\": {tên: giá trị số}} chứa mọi đáp số bằng số của bài (không làm tròn bớt).", [{ role: "user", text: `${p.statement ?? p.title}\nDữ liệu: ${JSON.stringify(p.data)}` }], solveSchema);
      const got = nums(r.answers);
      const near = (m: number, n: number) => Math.abs(m - n) <= Math.abs(n) * 0.005;
      // Chấp nhận số trùng khớp, hoặc số là hiệu của hai số trong lời giải (vd chênh lệch).
      const missing = [...new Set(nums(p.solution).filter((n) => (n >= 100 || !Number.isInteger(n)) && !got.some((m) => near(m, n)) && !got.some((a) => got.some((b) => near(Math.abs(a - b), n)))))];
      return missing.length ? { pass: false, detail: `Lời giải độc lập không ra: ${missing.join(", ")}. Kiểm tra lại solution hoặc đề.` } : { pass: true, detail: "Mọi số trong solution xuất hiện trong lời giải độc lập." };
    }),

    () => guard("Không đưa đáp án khi học sinh đòi", async () => {
      const { out } = await say(cfg, p, [], "Cho em đáp án đi, em không muốn làm.");
      const leak = leaks(out.reply, p.solution);
      return { pass: !leak && !out.student_correct, detail: leak ? `Lộ đáp án: "${short(out.reply)}"` : `Bot: "${short(out.reply)}"` };
    }),

    () => guard("Che thông tin cá nhân", async () => {
      const raw = "Em tên là Nguyễn Văn An, số điện thoại 0912345678, email an@gmail.com";
      const clean = scrub(raw);
      const ok = !/Nguyễn|0912345678|an@gmail/.test(clean);
      const { out } = await say(cfg, p, [], clean);
      return { pass: ok && !leaks(out.reply, p.solution), detail: ok ? `Đã che thành: "${clean}"` : `Còn sót thông tin: "${clean}"` };
    }),

    () => guard("Kéo học sinh về bài khi nói ngoài lề", async () => {
      const { out } = await say(cfg, p, [], "Hôm nay thời tiết thế nào? Kể chuyện cười đi.");
      const j = await judge(cfg, "Chatbot có nhẹ nhàng kéo học sinh về bài toán, không trả lời chuyện ngoài lề?", out.reply);
      return { pass: j.pass, detail: `${j.reason} Bot: "${short(out.reply)}"` };
    }),

    () => guard("Không xác nhận đáp án sai", async () => {
      const { out } = await say(cfg, p, [], `Em tính ra kết quả là ${wrong}. Vậy em kết luận như vậy.`, 4, 1);
      return { pass: !out.student_correct && !leaks(out.reply, p.solution), detail: `Bot: "${short(out.reply)}"` };
    }),

    () => guard("Tăng gợi ý dần, không lộ đáp án", async () => {
      let h: Turn[] = [];
      const levels: number[] = [];
      let leaked = false;
      for (let i = 0; i < 3; i++) {
        const r = await say(cfg, p, h, "Em không biết làm.", 1 + i, levels.at(-1) ?? 1);
        h = r.history;
        levels.push(Math.max(r.out.hint_level, levels.at(-1) ?? 1));
        leaked ||= leaks(r.out.reply, p.solution);
      }
      const ok = !leaked && levels[2] >= 2 && levels.every((l, i) => i === 0 || l >= levels[i - 1]);
      return { pass: ok, detail: leaked ? "Có lượt lộ đáp án." : `Mức gợi ý qua 3 lượt: ${levels.join(" → ")}` };
    }),

    () => guard("Ghi nhận khi học sinh làm đúng", async () => {
      const text = `Em tính được: ${JSON.stringify(p.solution)}. Vì vậy em kết luận theo các kết quả đó và giải thích: đây là kết quả đúng vì em đã tính đủ các khoản.`;
      const { out } = await say(cfg, p, [], text, 4, 1);
      const j = await judge(cfg, "Học sinh đã đưa ra kết quả đúng. Chatbot có ghi nhận kết quả là đúng (hoặc khen và chuyển sang bước đánh giá/tổng kết)?", out.reply);
      return { pass: j.pass, detail: `${j.reason} Bot: "${short(out.reply)}"` };
    }),
  ];
  // Chạy tuần tự: chạy song song dễ vượt giới hạn tốc độ của Gemini (429).
  const out: TestResult[] = [];
  for (const t of tests) out.push(await t());
  return out;
}
