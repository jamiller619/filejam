import type { ServiceEvent } from './protocol.js'
import { parseServiceEvent } from './validate.js'

const MAX_LINE_BYTES = 1_048_576
const decoder = new TextDecoder('utf-8', { fatal: true })

export class JsonLineReader {
  private fragments: Buffer[] = []
  private pendingBytes = 0

  push(chunk: Buffer): ServiceEvent[] {
    const events: ServiceEvent[] = []
    let start = 0

    for (let index = 0; index < chunk.length; index += 1) {
      if (chunk[index] !== 0x0a) {
        continue
      }

      this.append(chunk.subarray(start, index))
      let frame = Buffer.concat(this.fragments, this.pendingBytes)
      this.fragments = []
      this.pendingBytes = 0

      if (frame.length > 0 && frame[frame.length - 1] === 0x0d) {
        frame = frame.subarray(0, frame.length - 1)
      }

      if (frame.length > MAX_LINE_BYTES) {
        throw new RangeError('JSON line exceeds maximum size')
      }

      const value: unknown = JSON.parse(decoder.decode(frame))
      events.push(parseServiceEvent(value))
      start = index + 1
    }

    this.append(chunk.subarray(start))
    return events
  }

  end(): void {
    if (this.pendingBytes !== 0) {
      throw new TypeError('Unexpected end of JSON line')
    }
  }

  private append(fragment: Buffer): void {
    if (fragment.length === 0) {
      return
    }

    if (this.pendingBytes + fragment.length > MAX_LINE_BYTES + 1) {
      throw new RangeError('JSON line exceeds maximum size')
    }

    this.fragments.push(fragment)
    this.pendingBytes += fragment.length
  }
}
