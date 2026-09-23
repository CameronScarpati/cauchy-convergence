export interface Heap {
  /* Backing array in heap order. Mutated in place by the helpers below;
     state stays explicit so callers own it and tests stay deterministic. */
  items: number[]
  compare: (a: number, b: number) => number
}

export function createHeap(compare: (a: number, b: number) => number): Heap {
  return { items: [], compare }
}

export function heapSize(heap: Heap): number {
  return heap.items.length
}

export function heapPeek(heap: Heap): number | undefined {
  return heap.items[0]
}

export function heapPush(heap: Heap, value: number): void {
  /* NaN has no place in a numeric order: a - b style comparators return
     NaN for it, which the sift-up loop reads as smaller and the sift-down
     loop as not smaller, so entries around it land out of order. Reject
     it before touching the array. */
  if (Number.isNaN(value)) throw new RangeError('Heap cannot order NaN')
  const { items, compare } = heap
  items.push(value)
  let i = items.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (compare(slot(items, i), slot(items, parent)) >= 0) break
    swap(items, i, parent)
    i = parent
  }
}

export function heapPop(heap: Heap): number | undefined {
  const { items, compare } = heap
  if (items.length === 0) return undefined
  const top = items[0]
  const last = items.pop() as number
  if (items.length === 0) return top
  items[0] = last
  const size = items.length
  let i = 0
  for (;;) {
    const left = 2 * i + 1
    const right = left + 1
    let smallest = i
    if (left < size && compare(slot(items, left), slot(items, smallest)) < 0) smallest = left
    if (right < size && compare(slot(items, right), slot(items, smallest)) < 0) smallest = right
    if (smallest === i) break
    swap(items, i, smallest)
    i = smallest
  }
  return top
}

/* Every index passed here is already bounded by items.length, so a missing
   value means the backing array was corrupted; fail loudly instead of
   letting undefined flow into compare and scramble the heap order. */
function slot(items: number[], index: number): number {
  const value = items[index]
  if (value === undefined) {
    throw new Error(`Heap slot ${index} of ${items.length} is empty`)
  }
  return value
}

function swap(items: number[], a: number, b: number): void {
  const held = slot(items, a)
  items[a] = slot(items, b)
  items[b] = held
}
