export function timingSafeEqual(left: string, right: string): boolean {
  const a = String(left);
  const b = String(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const ca = index < a.length ? a.charCodeAt(index) : 0;
    const cb = index < b.length ? b.charCodeAt(index) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0 && a.length > 0;
}
