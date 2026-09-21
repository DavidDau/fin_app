import { describe, expect, it } from 'vitest'
import { money } from './money'

describe('money', () => {
  it('formats grouped Rwandan franc amounts', () => {
    expect(money(500000)).toBe('RWF 500,000')
    expect(money(1250000.5)).toBe('RWF 1,250,000.5')
  })

  it('renders invalid values safely', () => {
    expect(money(Number.NaN)).toBe('RWF 0')
    expect(money(Number.POSITIVE_INFINITY)).toBe('RWF 0')
  })
})
