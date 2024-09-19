import type { ShikiTransformer } from 'shiki'

interface MetaWithSkip {
  [key: symbol]: number | number[] | undefined
}

export function extractSkippedLines(meta: string): number[] | null {
  if (!meta) return null
  const match = meta.match(/skip\{([\d,-]+)\}/)
  if (!match) return null

  const ranges = match[1].split(',')
  return ranges.flatMap((range) => {
    const [start, end] = range.split('-').map(Number)
    return end
      ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
      : [start]
  })
}

export function extractStartingLine(meta: string): number | null {
  if (!meta) return null
  const match = meta.match(/showLineNumbers\{(\d+)\}/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Transformer that allows skipping lines in code blocks.
 * Example meta: `skip={1-3,7-10}`
 */
export function metaSkipTransformer(): ShikiTransformer {
  const skippedLinesKey = Symbol('skipped-lines')
  const startLineKey = Symbol('starting-line')

  return {
    name: '@shikijs/transformers:meta-skip',
    preprocess(code) {
      const rawMeta = this.options.meta?.__raw
      if (rawMeta) {
        const meta = this.meta as MetaWithSkip

        const startingLine = extractStartingLine(rawMeta) ?? 1
        meta[startLineKey] = startingLine

        const skippedLines = extractSkippedLines(rawMeta)
        if (skippedLines) {
          meta[skippedLinesKey] = skippedLines
        }
      }
      return code
    },
    code(node) {
      const meta = this.meta as MetaWithSkip
      const skippedLines: number[] = (meta[skippedLinesKey] as number[]) || []
      if (!skippedLines.length) return node

      const startLine: number = (meta[startLineKey] as number) || 1
      const lines = node.children
      const resultLines: typeof node.children = []
      let isSkipping = false
      let skipRangeStart = 0

      lines.forEach((line, index) => {
        const lineNumber = Math.floor(index / 2)

        if (skippedLines.includes(lineNumber + startLine)) {
          if (!isSkipping) {
            skipRangeStart = lineNumber
            isSkipping = true
          }
          if ('tagName' in line) {
            this.addClassToHast(line, 'hidden')
          }
          resultLines.push(line)
        } else {
          if (isSkipping) {
            const skipRangeEnd = lineNumber + startLine - 1
            resultLines.push({
              type: 'element',
              tagName: 'span',
              properties: {
                class: 'skip',
                style: `counter-set: line ${skipRangeEnd}`,
              },
              children: [
                {
                  type: 'text',
                  value: `${skipRangeStart + startLine}-${skipRangeEnd}`,
                },
              ],
            })
            isSkipping = false
          }
          resultLines.push(line)
        }
      })

      node.children = resultLines
      return node
    },
  }
}
