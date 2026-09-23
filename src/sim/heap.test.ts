import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createHeap, heapPeek, heapPop, heapPush, heapSize } from './heap.ts'
import { mulberry32 } from './prng.ts'

describe('binary heap', () => {
  it('pops in ascending order as a min-heap', () => {
    const heap = createHeap((a, b) => a - b)
    const rng = mulberry32(11)
    const values = Array.from({ length: 500 }, () => Math.floor(rng() * 100))
    for (const v of values) heapPush(heap, v)
    const popped: number[] = []
    for (let v = heapPop(heap); v !== undefined; v = heapPop(heap)) popped.push(v)
    expect(popped).toEqual([...values].sort((a, b) => a - b))
  })

  it('pops in descending order as a max-heap', () => {
    const heap = createHeap((a, b) => b - a)
    for (const v of [3, -7, 12, 0, 5, 5]) heapPush(heap, v)
    const popped: number[] = []
    for (let v = heapPop(heap); v !== undefined; v = heapPop(heap)) popped.push(v)
    expect(popped).toEqual([12, 5, 5, 3, 0, -7])
  })

  it('peeks without removing and tracks size', () => {
    const heap = createHeap((a, b) => a - b)
    expect(heapPeek(heap)).toBeUndefined()
    expect(heapPop(heap)).toBeUndefined()
    heapPush(heap, 4)
    heapPush(heap, 1)
    expect(heapPeek(heap)).toBe(1)
    expect(heapSize(heap)).toBe(2)
    expect(heapPop(heap)).toBe(1)
    expect(heapSize(heap)).toBe(1)
  })

  it('throws on a backing array with empty slots instead of sifting undefined', () => {
    const pushed = createHeap((a, b) => a - b)
    pushed.items.length = 3
    expect(() => heapPush(pushed, 1)).toThrow('Heap slot 1 of 4 is empty')

    const popped = createHeap((a, b) => a - b)
    popped.items.length = 4
    popped.items[0] = 5
    popped.items[3] = 2
    expect(() => heapPop(popped)).toThrow('Heap slot 1 of 3 is empty')
  })

  it('rejects NaN without changing the heap', () => {
    const heap = createHeap((a, b) => a - b)
    for (const v of [5, 1, 3]) heapPush(heap, v)
    expect(() => heapPush(heap, NaN)).toThrow(RangeError)
    expect(heap.items).toEqual([1, 5, 3])
    const popped: number[] = []
    for (let v = heapPop(heap); v !== undefined; v = heapPop(heap)) popped.push(v)
    expect(popped).toEqual([1, 3, 5])
  })

  it('agrees with a sorted-array model on arbitrary push and pop sequences', () => {
    // null is a pop. === lets the tied zeros -0 and +0 come out in either order.
    // NaN pushes must throw and leave both the heap and the model unchanged.
    const value = fc.oneof(fc.double(), fc.constantFrom(-0, 0, Infinity, -Infinity, NaN))
    const ops = fc.array(fc.option(value, { nil: null, freq: 3 }), { maxLength: 100, size: 'max' })
    fc.assert(
      fc.property(ops, (sequence) => {
        const heap = createHeap((a, b) => a - b)
        const model: number[] = []
        for (const op of sequence) {
          if (op === null) {
            expect(heapPop(heap) === model.shift()).toBe(true)
          } else if (Number.isNaN(op)) {
            expect(() => heapPush(heap, op)).toThrow(RangeError)
          } else {
            heapPush(heap, op)
            model.push(op)
            model.sort((a, b) => a - b)
          }
          expect(heapSize(heap)).toBe(model.length)
          expect(heapPeek(heap) === model[0]).toBe(true)
        }
      }),
      { seed: 42 },
    )
  })

  it('only hands the comparator values that are stored in the heap', () => {
    // Reading past the end of the array must never reach the comparator:
    // slot() throws on it, and without that check a - b would hide the
    // undefined as NaN where a keyed or bitwise comparator would not. Popping
    // from sizes 3 and 2 leaves 2 and 1 entries, so the root's right and then
    // left child index lands exactly on the array length.
    const stored = [4, 9, 1, 7, 3]
    const seen: number[] = []
    const heap = createHeap((a, b) => {
      seen.push(a, b)
      return a - b
    })
    for (const v of stored) heapPush(heap, v)
    const popped: number[] = []
    for (let v = heapPop(heap); v !== undefined; v = heapPop(heap)) popped.push(v)
    expect(popped).toEqual([1, 3, 4, 7, 9])
    expect(seen.filter((v) => !stored.includes(v))).toEqual([])
  })

  it('never swaps entries whose priorities tie', () => {
    // Ordering by integer part makes 1.1 to 1.4 all tie, so neither sift
    // ever finds a strict improvement: pushes keep insertion order and each
    // pop returns the root and moves the last entry into its place.
    // Array states: [1.1, 1.2, 1.3, 1.4] -> [1.4, 1.2, 1.3] -> [1.3, 1.2] -> [1.2].
    const heap = createHeap((a, b) => Math.floor(a) - Math.floor(b))
    for (const v of [1.1, 1.2, 1.3, 1.4]) {
      heapPush(heap, v)
      expect(heapPeek(heap)).toBe(1.1)
    }
    const popped: number[] = []
    for (let v = heapPop(heap); v !== undefined; v = heapPop(heap)) popped.push(v)
    expect(popped).toEqual([1.1, 1.4, 1.3, 1.2])
  })
})
