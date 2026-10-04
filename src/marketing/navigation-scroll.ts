export function navigationScrollState(previousY: number, scrollY: number, heldOpen: boolean) {
  const currentY = Math.max(0, scrollY);
  const scrolled = currentY > 16;
  if (heldOpen || currentY <= 80) return { scrolled, hidden: false, previousY: currentY };
  const distance = currentY - previousY;
  if (Math.abs(distance) < 8) return { scrolled, hidden: null, previousY };
  return { scrolled, hidden: currentY > 120 && distance > 0, previousY: currentY };
}
