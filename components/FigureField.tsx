"use client";
import { useRef, useState } from "react";
import { AiButton, Button, post, toast } from "@/components/ui";
import MathTextArea from "@/components/MathTextArea";
import { figureUrl, type Box, type Figure } from "@/lib/figure";

// Ảnh chờ cắt: toàn bộ ảnh đề (đã thu nhỏ) kèm khung AI khoanh được (null = giáo viên tự khoanh) và mô tả AI đã viết (nếu có).
export type FigureOffer = { src: string; box: Box | null; desc: string };

const FULL: Box = [0, 0, 1000, 1000];
const MAX_SIDE = 1000;

function load(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("img")); i.src = src; });
}

// Thu ảnh về cạnh dài tối đa `max`, nền trắng, JPEG.
export async function shrink(file: Blob, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

// Cắt theo khung (thang 0..1000), cạnh dài tối đa MAX_SIDE; giảm chất lượng cho tới khi dưới ~900KB (server nhận tối đa 1MB).
async function crop(src: string, [y0, x0, y1, x1]: Box): Promise<string> {
  const img = await load(src);
  const sx = (x0 / 1000) * img.width, sy = (y0 / 1000) * img.height, sw = ((x1 - x0) / 1000) * img.width, sh = ((y1 - y0) / 1000) * img.height;
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  for (const q of [0.9, 0.8, 0.65, 0.5]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 1_200_000) return d; }
  return c.toDataURL("image/jpeg", 0.4);
}

// Khung kéo chọn: bấm giữ rồi kéo trên ảnh để khoanh lại vùng hình. Dùng được bằng chuột và cảm ứng.
function Cropper({ src, box, onBox }: { src: string; box: Box; onBox: (b: Box) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<[number, number] | null>(null);
  const at = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, ((e.clientX - r.left) / r.width) * 1000)), Math.max(0, Math.min(1000, ((e.clientY - r.top) / r.height) * 1000))];
  };
  const upd = (e: React.PointerEvent) => {
    if (!start.current) return;
    const [x, y] = at(e), [sx, sy] = start.current;
    onBox([Math.round(Math.min(y, sy)), Math.round(Math.min(x, sx)), Math.round(Math.max(y, sy)), Math.round(Math.max(x, sx))]);
  };
  return (
    <div ref={ref} className="relative inline-block max-w-full cursor-crosshair select-none touch-none self-start" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = at(e); }} onPointerMove={upd} onPointerUp={(e) => { upd(e); start.current = null; }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Ảnh đề, kéo chuột để khoanh vùng hình vẽ" draggable={false} className="block max-h-[60vh] max-w-full" />
      <div className="pointer-events-none absolute inset-0 bg-black/40" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${box[1] / 10}% ${box[0] / 10}%,${box[1] / 10}% ${box[2] / 10}%,${box[3] / 10}% ${box[2] / 10}%,${box[3] / 10}% ${box[0] / 10}%,${box[1] / 10}% ${box[0] / 10}%)` }} />
      <div className="pointer-events-none absolute border-2 border-primary" style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }} />
    </div>
  );
}

async function dataUrlOf(url: string): Promise<string> {
  const b = await (await fetch(url)).blob();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
}

export default function FigureField({ value, onChange, offer, onOfferDone }: { value: Figure | null; onChange: (f: Figure | null) => void; offer: FigureOffer | null; onOfferDone: () => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState("");
  const [seen, setSeen] = useState<FigureOffer | null>(null);
  if (offer !== seen) { setSeen(offer); setBox(offer ? (offer.box ?? FULL) : null); } // ảnh mới tới: khung khởi đầu là khung AI khoanh, không có thì cả ảnh

  async function addFile(f: File) {
    try { const src = await shrink(f); onOfferFrom({ src, box: null, desc: "" }); } catch { toast("danger", "Không mở được ảnh này."); }
  }
  const [own, setOwn] = useState<FigureOffer | null>(null);
  const onOfferFrom = (o: FigureOffer) => { setOwn(o); setBox(FULL); };
  const cur = offer ?? own;

  async function describe(dataUrl: string): Promise<string> {
    const { ok, data } = await post<{ desc?: string }>("/api/problems", { action: "describe_figure", image: dataUrl });
    if (!ok) { toast("warning", data.error ?? "AI chưa mô tả được hình. Hãy tự nhập mô tả."); return ""; }
    return data.desc ?? "";
  }

  async function accept() {
    if (!cur || !box) return;
    setBusy("Đang lưu hình...");
    try {
      const img = await crop(cur.src, box);
      const { ok, data } = await post<{ path?: string }>("/api/problems", { action: "upload_figure", image: img });
      if (!ok || !data.path) return toast("danger", data.error ?? "Không lưu được hình. Thử lại.");
      // Mô tả AI viết từ ảnh đề chỉ dùng được khi khung giữ nguyên; giáo viên khoanh lại thì cho AI mô tả lại đúng phần vừa cắt.
      const same = cur.box && box.every((v, i) => Math.abs(v - cur.box![i]) < 15);
      let desc = same ? cur.desc : "";
      if (!desc.trim()) { setBusy("AI đang mô tả hình..."); desc = await describe(img); }
      onChange({ path: data.path, desc });
      setOwn(null); onOfferDone();
    } catch { toast("danger", "Không cắt được ảnh này."); } finally { setBusy(""); }
  }

  async function redescribe() {
    if (!value) return;
    setBusy("AI đang mô tả hình...");
    try { const d = await describe(await dataUrlOf(figureUrl(value.path))); if (d) onChange({ ...value, desc: d }); } catch { toast("danger", "Không tải được hình để mô tả."); } finally { setBusy(""); }
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border p-3">
      <div className="font-medium">Hình vẽ của đề (đề hình học)</div>
      {cur && box && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-muted">{cur.box ? "AI đã khoanh vùng hình vẽ. Kéo chuột trên ảnh để khoanh lại nếu chưa đúng." : "Kéo chuột trên ảnh để khoanh vùng hình vẽ."} Chỉ vùng được khoanh được lưu, phần chữ đề không lưu.</p>
          <Cropper src={cur.src} box={box} onBox={setBox} />
          <div className="flex flex-wrap gap-2">
            <Button block={false} onClick={accept} pending={busy || undefined}>Cắt và dùng hình này</Button>
            <Button variant="ghost" block={false} onClick={() => setBox(FULL)}>Lấy cả ảnh</Button>
            <Button variant="ghost" block={false} onClick={() => { setOwn(null); onOfferDone(); }}>Bỏ qua</Button>
          </div>
        </div>
      )}
      {!cur && value && (
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={figureUrl(value.path)} alt={value.desc || "Hình vẽ của đề"} className="max-h-64 max-w-full self-start rounded-sm border border-border bg-white" />
          <MathTextArea label="Mô tả hình bằng chữ (AI đọc phần này, học sinh không thấy)" rows={3} value={value.desc} onChange={(d) => onChange({ ...value, desc: d })} hint="Ghi đủ điểm, đoạn thẳng, góc, quan hệ vuông góc/song song và mọi số đo trên hình. AI chỉ biết dữ kiện qua mô tả này, nên hãy đối chiếu với hình." />
          <div className="flex flex-wrap gap-2">
            <AiButton variant="secondary" block={false} onClick={redescribe} pending={busy || undefined}>AI mô tả lại</AiButton>
            <Button variant="ghost" block={false} onClick={() => onChange(null)}>Xóa hình</Button>
          </div>
        </div>
      )}
      {!cur && !value && (
        <label className="inline-flex min-h-11 w-fit cursor-pointer items-center text-sm text-primary underline">Thêm hình vẽ từ máy
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addFile(f); }} />
        </label>
      )}
      {!cur && !value && <p className="text-sm text-text-muted">Hoặc dán ảnh đề có cả hình vào ô Đề bài ở trên: AI tách chữ vào ô Đề bài và khoanh riêng hình vẽ.</p>}
    </div>
  );
}
