export function calcMarketValue(
  baseValue: number,
  form: number,
  morale: number,
  activeBoosts = 0,
): number {
  const formFactor = 1 + (form - 60) * 0.005
  const moraleFactor = 1 + (morale - 60) * 0.002
  const boostFactor = 1 + activeBoosts * 0.05
  return Math.max(100_000, Math.round(baseValue * formFactor * moraleFactor * boostFactor))
}
