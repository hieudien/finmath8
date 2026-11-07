// Cache trong RAM có hạn dùng. Không nhớ giá trị rỗng (link/cấu hình chưa có) để vừa tạo xong là dùng được ngay.
// ponytail: mỗi instance một bản; hết hạn tối đa `ms` sau khi dữ liệu đổi. Dùng Redis nếu cần đồng bộ tức thì.
export function ttl<K, V>(ms: number, load: (k: K) => Promise<V>) {
  const m = new Map<K, { at: number; v: V }>();
  const get = async (k: K) => {
    const h = m.get(k);
    if (h && Date.now() - h.at < ms) return h.v;
    const v = await load(k);
    if (v != null) {
      if (m.size > 5000) m.clear();
      m.set(k, { at: Date.now(), v });
    }
    return v;
  };
  get.clear = () => m.clear();
  get.drop = (k: K) => void m.delete(k);
  return get;
}
