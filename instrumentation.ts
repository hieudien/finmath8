// Ghi mọi lỗi phát sinh khi render trang (có mã digest hiện trên màn hình lỗi) vào nhật ký để admin tra cứu.
export async function onRequestError(err: unknown, request: { path: string }) {
  const { reportError } = await import("@/lib/errors");
  const digest = (err as { digest?: string })?.digest;
  const ref = await reportError(err, `render ${request.path}${digest ? ` digest=${digest}` : ""}`, { kind: "render" });
  console.error("onRequestError", ref, digest);
}
