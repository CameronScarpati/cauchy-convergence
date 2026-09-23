import { createHeap, heapPeek, heapPop, heapPush, heapSize, type Heap } from './heap.ts'

/* Two-heap running median: a max-heap holds the lower half, a min-heap the
   upper half, and their sizes never differ by more than one. */
export interface RunningMedian {
  lower: Heap
  upper: Heap
  /* Set once a NaN is pushed. The median of a sample containing NaN is
     NaN from then on, the same way the running mean propagates it, and
     the heaps never see the value because they cannot order it. */
  sawNaN: boolean
}

export function createRunningMedian(): RunningMedian {
  return {
    lower: createHeap((a, b) => b - a),
    upper: createHeap((a, b) => a - b),
    sawNaN: false,
  }
}

export function medianPush(state: RunningMedian, value: number): void {
  if (Number.isNaN(value)) {
    state.sawNaN = true
    return
  }
  const lowerTop = heapPeek(state.lower)
  if (lowerTop === undefined || value <= lowerTop) {
    heapPush(state.lower, value)
  } else {
    heapPush(state.upper, value)
  }
  if (heapSize(state.lower) > heapSize(state.upper) + 1) {
    heapPush(state.upper, heapPop(state.lower) as number)
  } else if (heapSize(state.upper) > heapSize(state.lower) + 1) {
    heapPush(state.lower, heapPop(state.upper) as number)
  }
}

export function median(state: RunningMedian): number {
  if (state.sawNaN) return NaN
  const lowerCount = heapSize(state.lower)
  const upperCount = heapSize(state.upper)
  if (lowerCount + upperCount === 0) return NaN
  if (lowerCount === upperCount) {
    return midpoint(heapPeek(state.lower) as number, heapPeek(state.upper) as number)
  }
  return lowerCount > upperCount
    ? (heapPeek(state.lower) as number)
    : (heapPeek(state.upper) as number)
}

/* (a + b) / 2 overflows to an infinity when both middle values have the
   same sign and sit near the edge of the double range. Only values that
   large can overflow the sum, and halving them is exact, so the fallback
   still rounds the true midpoint once. Infinite inputs keep the plain
   sum, which already gives the IEEE answer. */
function midpoint(a: number, b: number): number {
  const sum = a + b
  const overflowed = !Number.isFinite(sum) && Number.isFinite(a) && Number.isFinite(b)
  return overflowed ? a / 2 + b / 2 : sum / 2
}

/* Incremental mean update instead of a raw sum: single Cauchy draws can be
   astronomically large, and the increment form avoids overflowing the
   intermediate total. */
export interface RunningMean {
  count: number
  mean: number
}

export function createRunningMean(): RunningMean {
  return { count: 0, mean: 0 }
}

export function meanPush(state: RunningMean, value: number): void {
  state.count += 1
  state.mean += (value - state.mean) / state.count
}

export function mean(state: RunningMean): number {
  return state.count === 0 ? NaN : state.mean
}
