import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { bad } from "@/lib/auth";
import { askJson, askText } from "@/lib/llm";
import { llmCfg } from "@/lib/teacher";
import { log } from "@/lib/log";
import { reportError } from "@/lib/errors";
import { tidyLine, tidyStatement } from "@/lib/repair";
import { readExamImage, normalizeText, DESCRIBE_FIGURE, type ImageResult } from "@/lib/read-image";
import { FIGURE_BUCKET } from "@/lib/figure";
import type { Body } from "./schema";
import { NO_KEY, type Ctx } from "./ctx";

export async function imageActions(b: Body, c: Ctx): Promise<Response | undefined> {
  const { u } = c;
  if (b.action === "read_image") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const [head, b64] = b.image.split(",");
    const mime = head.slice(5, head.indexOf(";"));
    const legacy = async (deadlineMs: number): Promise<ImageResult> => {
    const out = await askJson(cfg, 'Đây là ảnh chụp một đề Toán. Đọc và PHÂN LOẠI nội dung trong ảnh, chép NGUYÊN VĂN, không tự giải, bỏ qua hình vẽ. Chỉ trả JSON {"statement": string, "answers": [{"name": string, "value": string}], "solution_steps": [string]}:\n- statement: CHỈ đề bài (giả thiết, câu hỏi). KHÔNG chứa đáp án, lời giải, "Giải", "ĐS", "Đáp số", "Hướng dẫn".\n- answers: đáp án cuối nếu ảnh có ghi đáp số hoặc có kết luận cuối lời giải (chép lại, KHÔNG tự tính). Mỗi đáp án một phần tử: x = 3 là {"name":"x","value":"3"}; nhiều nghiệm đặt tên x1, x2; đáp án chữ hoặc vô nghiệm là {"name":"ket_luan","value":"vô nghiệm"} viết ngắn gọn. Ảnh không có đáp án thì [].\n- solution_steps: các bước cách giải nếu ảnh có ghi, mỗi bước một mục, bỏ chữ "Bước N:". Ảnh không có cách giải thì [].\nẢnh nhiều đề thì chỉ lấy đề đầu. Trình bày rõ ràng: đề nhiều ý thì xuống dòng giữa các ý, mỗi ý bắt đầu bằng a), b), c) (hoặc 1), 2)), dòng đầu là phần dẫn chung; hệ phương trình nằm trên dòng riêng. TUYỆT ĐỐI KHÔNG xuống dòng bên trong một cặp $...$ (cả hệ cases phải nằm trên một dòng, các hàng cách nhau bằng ¦¦); chép đúng dấu chấm phẩy của đề. Chỗ xuống dòng là xuống dòng thật; TUYỆT ĐỐI không dùng dấu gạch chéo ngược hay ký tự ¦ để ngắt dòng ở NGOÀI công thức. MỌI biểu thức toán (kể cả đơn giản như $2x + 3 = 11$, $x^2$, $\\frac{1}{2}$) đều đặt trong $...$ theo LaTeX; hệ phương trình dùng cases, mỗi phương trình một hàng, các hàng cách nhau bằng 2 dấu ¦¦. QUAN TRỌNG: trong công thức, thay MỌI dấu gạch chéo ngược của LaTeX bằng ký tự ¦ (ví dụ ¦begin{cases}, ¦frac{1}{2}, ¦Delta), KHÔNG dùng dấu gạch chéo ngược.', [{ role: "user", text: "Đọc đề trong ảnh.", image: { mime, b64 } }], z.object({ statement: z.string(), answers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).default([]), solution_steps: z.array(z.string()).default([]) }), { deadlineMs, attemptMs: 20_000, use: "read_image" });
    // Model hay viết sai dấu \ trong JSON (\begin thành ký tự điều khiển, \\ thành \), nên prompt bảo dùng ¦ thay \ rồi đổi lại ở đây.
    const fix = (s: string) => s.replaceAll("¦", "\\");
    // Dạng mảng {name,value}: khung JSON của Gemini bỏ additionalProperties nên đối tượng tự do hay bị trả rỗng.
    const solution = Object.fromEntries(out.answers.map((a) => [a.name, /^-?\d+(\.\d+)?$/.test(a.value.trim()) ? Number(a.value) : fix(a.value)]));
    // Chữ ngoài $...$: ¦ đứng trước chữ cái là dấu \ của lệnh LaTeX quên bọc $, còn lại là dấu ngắt dòng lạc nên bỏ.
    const fixText = (s: string) => s.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g, (x) => fix(x)).replace(/¦(?=[A-Za-z])/g, "\\").replaceAll("¦", "");
    out.statement = tidyStatement(fixText(out.statement));
    out.solution_steps = out.solution_steps.map((s) => tidyLine(fixText(s))).filter((s) => s.trim());
    return { statement: out.statement, solution, solution_steps: out.solution_steps };
    };
    // Cách mới: model trả văn bản có thẻ, tự kiểm và đọc lại khi lỗi; không tách được thẻ thì rơi về cách cũ (legacy, JSON) ở trên.
    const out = await readExamImage(cfg, { mime, b64 }, legacy);
    if (!out.statement.trim()) { await reportError(new Error(`Đọc đề từ ảnh trả rỗng (${mime}, ${b64.length} ký tự)`), "đọc đề từ ảnh", { teacherId: u.id, actor: "teacher", kind: "format" }); return bad("Không thấy đề bài trong ảnh. Thử ảnh rõ hơn."); }
    await log({ actor: "teacher", action: "problem_image_read", teacherId: u.id, meta: { chars: out.statement.length, answer: !!Object.keys(out.solution).length, steps: out.solution_steps.length, attempts: out.attempts, warnings: out.warnings.length } });
    return Response.json({ ok: true, statement: out.statement.trim(), solution: out.solution, solution_steps: out.solution_steps, warnings: out.warnings, figure: out.figure ?? null });
  }

  // Hình vẽ của đề: client đã cắt và nén; server lưu vào bucket công khai, đường dẫn bắt đầu bằng id giáo viên để chỉ xóa được hình của mình.
  if (b.action === "upload_figure") {
    const [head, b64] = b.image.split(",");
    const mime = head.slice(5, head.indexOf(";"));
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 1_000_000) return bad("Ảnh hình quá lớn (tối đa 1MB).");
    const path = `${u.id}/${crypto.randomUUID()}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
    const { error } = await admin().storage.from(FIGURE_BUCKET).upload(path, buf, { contentType: mime, upsert: false });
    if (error) throw new Error("Lỗi lưu hình: " + error.message);
    await log({ actor: "teacher", action: "figure_uploaded", teacherId: u.id, meta: { bytes: buf.length } });
    return Response.json({ ok: true, path });
  }

  // Mô tả hình bằng chữ cho AI (khi giáo viên tự thêm hình, hoặc muốn AI mô tả lại): chỉ nhìn hình, không giải.
  if (b.action === "describe_figure") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const [head, b64] = b.image.split(",");
    const text = await askText(cfg, DESCRIBE_FIGURE, [{ role: "user", text: "Mô tả hình vẽ này.", image: { mime: head.slice(5, head.indexOf(";")), b64 } }], { deadlineMs: 40_000, use: "read_image" });
    const desc = normalizeText(text.replaceAll("```", "")).trim();
    if (!desc) return bad("AI chưa mô tả được hình. Thử lại hoặc tự nhập mô tả.");
    return Response.json({ ok: true, desc });
  }
  return undefined;
}
