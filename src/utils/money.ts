const numberFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  maximumFractionDigits: 2,
})

export const money = (value: number): string => {
  const numericValue = Number(value)
  return `RWF ${numberFormatter.format(Number.isFinite(numericValue) ? numericValue : 0)}`
}
