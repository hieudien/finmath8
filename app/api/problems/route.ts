import { api, bad, requireUser } from "@/lib/auth";
import { body } from "./schema";
import { makeCtx } from "./ctx";
import { answersActions } from "./answers";
import { bulkActions } from "./bulk";
import { batchActions } from "./batch";
import { draftActions } from "./draft";
import { imageActions } from "./images";
import { storeActions } from "./store";

export const maxDuration = 60; // hàng loạt nhiều đề gọi AI theo nhóm

// Mỗi nhóm thao tác nằm ở một file cùng thư mục; nhóm nào nhận thao tác thì trả Response.
const GROUPS = [answersActions, bulkActions, batchActions, draftActions, imageActions, storeActions];

export const POST = api(async (req, tr) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  tr.action = p.data.action;
  const c = makeCtx(u);
  for (const run of GROUPS) {
    const r = await run(p.data, c);
    if (r) return r;
  }
  return bad("Thao tác không hợp lệ.");
});
