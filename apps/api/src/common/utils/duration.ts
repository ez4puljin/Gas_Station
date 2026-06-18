/** "15m", "30d", "3600" гэх мэт TTL-ийг секунд болгоно. */
export function durationToSeconds(input: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!match) {
    const asNumber = Number(input);
    if (Number.isFinite(asNumber)) return asNumber;
    throw new Error(`Буруу хугацааны формат: "${input}"`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return value * multiplier;
}
