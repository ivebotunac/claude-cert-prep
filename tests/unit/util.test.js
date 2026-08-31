import { describe, expect, it } from 'vitest'
import {
  isCorrect, presentOptions, pct, richText, scaledScore, seedFrom, shuffle, formatClock, formatBytes,
} from '../../src/lib/util.js'

const question = {
  id: 'd1-001',
  options: [
    { key: 'A', text: 'first' },
    { key: 'B', text: 'second' },
    { key: 'C', text: 'third' },
    { key: 'D', text: 'fourth' },
  ],
  correct: ['A'],
}

describe('shuffle', () => {
  it('is deterministic for a given seed', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42)
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42)
    expect(a).toEqual(b)
  })

  it('produces a different order for a different seed', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 1)
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], 2)
    expect(a).not.toEqual(b)
  })

  it('preserves every element', () => {
    const input = Array.from({ length: 50 }, (_, i) => i)
    expect(shuffle(input, 7).sort((x, y) => x - y)).toEqual(input)
  })

  it('does not mutate its argument', () => {
    const input = [1, 2, 3]
    shuffle(input, 9)
    expect(input).toEqual([1, 2, 3])
  })
})

describe('seedFrom', () => {
  it('is stable and differs per input', () => {
    expect(seedFrom('abc')).toBe(seedFrom('abc'))
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'))
  })
})

describe('presentOptions', () => {
  it('relabels options A to D in display order', () => {
    const { options } = presentOptions(question, 'salt-1')
    expect(options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('keeps every option exactly once', () => {
    const { options } = presentOptions(question, 'salt-1')
    expect(options.map((o) => o.text).sort()).toEqual(['first', 'fourth', 'second', 'third'])
  })

  it('is stable for the same salt and varies across salts', () => {
    const a = presentOptions(question, 'x').options.map((o) => o.src).join('')
    const b = presentOptions(question, 'x').options.map((o) => o.src).join('')
    expect(a).toBe(b)

    // Across many salts the keyed answer must land on every letter, or position
    // becomes a cue no matter how the content file is written.
    const seen = new Set()
    for (let i = 0; i < 40; i++) {
      const { toShown } = presentOptions(question, `salt-${i}`)
      seen.add(toShown('A'))
    }
    expect(seen.size).toBe(4)
  })

  it('maps source keys to the letters actually shown', () => {
    const { options, toShown } = presentOptions(question, 'salt-2')
    for (const opt of options) expect(toShown(opt.src)).toBe(opt.key)
  })

  it('returns the file order untouched when disabled', () => {
    const { options, toShown } = presentOptions(question, 'salt', false)
    expect(options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D'])
    expect(options.map((o) => o.text)).toEqual(['first', 'second', 'third', 'fourth'])
    expect(toShown('C')).toBe('C')
  })
})

describe('isCorrect', () => {
  it('accepts an exact single match', () => {
    expect(isCorrect(['A'], ['A'])).toBe(true)
  })

  it('rejects a wrong single answer', () => {
    expect(isCorrect(['B'], ['A'])).toBe(false)
  })

  it('is order independent for multiple response', () => {
    expect(isCorrect(['C', 'A'], ['A', 'C'])).toBe(true)
  })

  it('is all or nothing: a partial selection fails', () => {
    expect(isCorrect(['A'], ['A', 'C'])).toBe(false)
  })

  it('rejects an over-selection', () => {
    expect(isCorrect(['A', 'B', 'C'], ['A', 'C'])).toBe(false)
  })

  it('rejects an empty selection', () => {
    expect(isCorrect([], ['A'])).toBe(false)
  })
})

describe('scaledScore', () => {
  it('puts 70 percent exactly on the cut score', () => {
    expect(scaledScore(70, 100)).toBe(720)
    expect(scaledScore(42, 60)).toBe(720)
  })

  it('maps a perfect paper to the top of the scale', () => {
    expect(scaledScore(60, 60)).toBe(1000)
  })

  it('maps an empty paper to the floor', () => {
    expect(scaledScore(0, 60)).toBe(100)
  })

  it('stays inside the published scale', () => {
    for (let c = 0; c <= 60; c++) {
      const s = scaledScore(c, 60)
      expect(s).toBeGreaterThanOrEqual(100)
      expect(s).toBeLessThanOrEqual(1000)
    }
  })

  it('is monotonic in the number of correct answers', () => {
    let prev = -1
    for (let c = 0; c <= 60; c++) {
      const s = scaledScore(c, 60)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })

  it('puts one below the pass threshold under 720', () => {
    expect(scaledScore(41, 60)).toBeLessThan(720)
  })

  it('handles a zero-length paper without dividing by zero', () => {
    expect(scaledScore(0, 0)).toBe(100)
  })
})

describe('pct', () => {
  it('rounds to whole percent', () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(2, 3)).toBe(67)
  })

  it('returns zero rather than NaN for an empty denominator', () => {
    expect(pct(0, 0)).toBe(0)
  })
})

describe('richText', () => {
  it('escapes HTML in content', () => {
    expect(richText('<script>alert(1)</script>')).not.toContain('<script>')
    expect(richText('a & b')).toContain('&amp;')
  })

  it('wraps known identifiers in code', () => {
    expect(richText('check stop_reason first')).toContain('<code>stop_reason</code>')
    expect(richText('set tool_choice to any')).toContain('<code>tool_choice</code>')
  })

  it('wraps CLI flags and config paths', () => {
    expect(richText('run with --print')).toContain('<code>--print</code>')
    expect(richText('put it in CLAUDE.md')).toContain('<code>CLAUDE.md</code>')
    expect(richText('use .claude/rules/testing.md')).toContain('<code>')
  })

  it('strips backticks from explicitly marked spans', () => {
    expect(richText('the `magic` word')).toContain('<code>magic</code>')
  })

  it('leaves ordinary prose alone', () => {
    expect(richText('a plain sentence')).toBe('a plain sentence')
  })

  it('handles null and undefined', () => {
    expect(richText(null)).toBe('')
    expect(richText(undefined)).toBe('')
  })
})

describe('formatters', () => {
  it('formats a clock as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(61_000)).toBe('01:01')
    expect(formatClock(120 * 60_000)).toBe('120:00')
  })

  it('never shows a negative clock', () => {
    expect(formatClock(-5000)).toBe('00:00')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})

describe('richText, hyphenated words', () => {
  it('does not mistake the tail of a hyphenated word for a CLI flag', () => {
    expect(richText('high-ambiguity requests')).toBe('high-ambiguity requests')
    expect(richText('first-contact resolution')).toBe('first-contact resolution')
    expect(richText('It re-litigates the request')).toBe('It re-litigates the request')
  })

  it('still marks a real flag', () => {
    expect(richText('run with --verbose')).toBe('run with <code>--verbose</code>')
    expect(richText('use --output-format json')).toBe('use <code>--output-format</code> json')
  })

  it('leaves one-letter flags to backticks', () => {
    // The pattern needs two characters after the dash, so -p on its own is not
    // marked. Authors write `-p` in the content when they want it as code.
    expect(richText('the -p flag')).toBe('the -p flag')
    expect(richText('the `-p` flag')).toBe('the <code>-p</code> flag')
  })
})
