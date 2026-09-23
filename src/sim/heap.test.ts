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
})
