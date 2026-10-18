import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as net from 'net';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import type { RecordingMeta, VideoComment, VideoReaction } from './types.ts';

// RFC 6455 compliant options
export interface NativeWebSocketOptions {
  isServer?: boolean;
  maxPayload?: number;
}

// Pure native Node.js RFC 6455 WebSocket implementation (Zero external dependencies)
export class NativeWebSocket extends EventEmitter {
  public socket: net.Socket;
  public readyState: number = 1; // 1 = OPEN, 2 = CLOSING, 3 = CLOSED
  public isServer: boolean;
  public maxPayload: number;

  private buffer: Buffer = Buffer.alloc(0);
  private pendingMessages: (string | Buffer)[] = [];
  private isDraining: boolean = false;

  // Fragmentation state (RFC 6455 Section 5.4)
  private fragmentOpcode: number = 0;
  private fragments: Buffer[] = [];
  private totalFragmentLength: number = 0;
  private closeEmitted = false;
  private closeCodeInitiated: number | null = null;

  // Strict UTF-8 decoder with fatal error reporting for Text frames
  private textDecoder = new TextDecoder('utf-8', { fatal: true });

  constructor(socket: net.Socket, initialBuffer?: Buffer, options?: NativeWebSocketOptions) {
    super();
    this.socket = socket;
    this.isServer = options?.isServer ?? true;
    this.maxPayload = options?.maxPayload ?? 16 * 1024 * 1024; // 16MB protection limit

    if (initialBuffer && initialBuffer.length > 0) {
      this.buffer = Buffer.from(initialBuffer);
    }

    this.on('newListener', (event) => {
      if (event === 'message') {
        process.nextTick(() => {
          this.drainPendingMessages();
        });
      }
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
    });

    this.socket.on('close', () => {
      this.emitClose(this.closeCodeInitiated ?? 1006, 'Abrupt connection close');
    });

    this.socket.on('end', () => {
      if (this.readyState === 1 || this.readyState === 2) {
        this.emitClose(this.closeCodeInitiated ?? 1006, 'Connection ended by peer');
      }
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    if (this.buffer.length > 0) {
      this.processBuffer();
    }
  }

  private enqueueMessage(msg: string | Buffer) {
    this.pendingMessages.push(msg);
    if (this.listenerCount('message') > 0) {
      this.drainPendingMessages();
    }
  }

  private drainPendingMessages() {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      while (this.pendingMessages.length > 0 && this.listenerCount('message') > 0) {
        const msg = this.pendingMessages.shift();
        if (msg !== undefined) {
          this.emit('message', msg);
        }
      }
    } finally {
      this.isDraining = false;
    }
  }

  private processBuffer() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const fin = (firstByte & 0x80) !== 0;
      const rsv = firstByte & 0x70;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      // RFC 6455 5.2: RSV bits MUST be 0 unless an extension is negotiated
      if (rsv !== 0) {
        this.failConnection(1002, 'RSV bits must be 0');
        return;
      }

      // Check opcode validity
      const isControl = (opcode & 0x08) !== 0;
      const isData = opcode === 0x00 || opcode === 0x01 || opcode === 0x02;
      if (!isControl && !isData) {
        this.failConnection(1002, `Unknown opcode 0x${opcode.toString(16)}`);
        return;
      }

      // RFC 6455 5.5: Control frames MUST NOT be fragmented (FIN=1) and payload <= 125
      if (isControl) {
        if (!fin) {
          this.failConnection(1002, 'Control frames must not be fragmented');
          return;
        }
        if (payloadLen > 125) {
          this.failConnection(1002, 'Control frame payload cannot exceed 125 bytes');
          return;
        }
      }

      // RFC 6455 5.1: Masking requirements
      if (this.isServer && !isMasked) {
        this.failConnection(1002, 'Client frames must be masked');
        return;
      }
      if (!this.isServer && isMasked) {
        this.failConnection(1002, 'Server frames must not be masked');
        return;
      }

      // Extended payload lengths
      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
        // RFC 6455 5.2: Non-minimal encoding check
        if (payloadLen < 126) {
          this.failConnection(1002, 'Non-minimal payload length');
          return;
        }
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        const bigLen = this.buffer.readBigUInt64BE(2);
        if (bigLen > BigInt(this.maxPayload)) {
          this.failConnection(1009, 'Message exceeds maximum allowed payload');
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
        // Non-minimal encoding check
        if (payloadLen < 65536) {
          this.failConnection(1002, 'Non-minimal payload length');
          return;
        }
      }

      if (payloadLen > this.maxPayload) {
        this.failConnection(1009, 'Message exceeds maximum allowed payload');
        return;
      }

      let maskKey: Buffer | null = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) return;

      let payload = this.buffer.subarray(offset, offset + payloadLen);
      this.buffer = this.buffer.subarray(offset + payloadLen);

      if (isMasked && maskKey) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) {
          unmasked[i] = payload[i] ^ maskKey[i % 4];
        }
        payload = unmasked;
      } else {
        payload = Buffer.from(payload);
      }

      // Process frame by opcode
      if (opcode === 0x08) { // CLOSE
        this.handleCloseFrame(payload);
        return;
      } else if (opcode === 0x09) { // PING
        this.sendFrame(0x0a, payload);
        this.emit('ping', payload);
      } else if (opcode === 0x0a) { // PONG
        this.emit('pong', payload);
      } else if (opcode === 0x01 || opcode === 0x02) { // TEXT or BINARY
        if (fin) {
          if (this.fragmentOpcode !== 0) {
            this.failConnection(1002, 'New message started before continuation finished');
            return;
          }
          this.dispatchDataMessage(opcode, payload);
        } else {
          // Initial fragment of fragmented message
          if (this.fragmentOpcode !== 0) {
            this.failConnection(1002, 'Cannot nest fragmented messages');
            return;
          }
          this.fragmentOpcode = opcode;
          this.fragments = [payload];
          this.totalFragmentLength = payload.length;
        }
      } else if (opcode === 0x00) { // CONTINUATION
        if (this.fragmentOpcode === 0) {
          this.failConnection(1002, 'Continuation frame without initial fragment');
          return;
        }
        this.fragments.push(payload);
        this.totalFragmentLength += payload.length;
        if (this.totalFragmentLength > this.maxPayload) {
          this.failConnection(1009, 'Fragmented message exceeds maximum allowed payload');
          return;
        }
        if (fin) {
          const completePayload = Buffer.concat(this.fragments);
          const origOpcode = this.fragmentOpcode;
          this.fragmentOpcode = 0;
          this.fragments = [];
          this.totalFragmentLength = 0;
          this.dispatchDataMessage(origOpcode, completePayload);
        }
      }
    }
  }

  private dispatchDataMessage(opcode: number, payload: Buffer) {
    if (opcode === 0x01) { // TEXT
      try {
        const text = this.textDecoder.decode(payload);
        this.enqueueMessage(text);
      } catch (err) {
        // RFC 6455 8.1: Invalid UTF-8 must fail connection with code 1007
        this.failConnection(1007, 'Invalid UTF-8 sequence in text frame');
      }
    } else if (opcode === 0x02) { // BINARY
      this.enqueueMessage(payload);
    }
  }

  private handleCloseFrame(payload: Buffer) {
    let code = 1000;
    let reason = '';

    if (payload.length === 1) {
      this.failConnection(1002, 'Invalid close frame payload length');
      return;
    }

    if (payload.length >= 2) {
      code = payload.readUInt16BE(0);
      // Validate close code according to RFC 6455 Section 7.4
      const isValidCode =
        code === 1000 ||
        code === 1001 ||
        code === 1002 ||
        code === 1003 ||
        code === 1007 ||
        code === 1008 ||
        code === 1009 ||
        code === 1010 ||
        code === 1011 ||
        (code >= 3000 && code <= 4999);

      if (!isValidCode) {
        this.failConnection(1002, `Invalid close code ${code}`);
        return;
      }

      if (payload.length > 2) {
        try {
          reason = this.textDecoder.decode(payload.subarray(2));
        } catch (err) {
          this.failConnection(1007, 'Invalid UTF-8 in close reason');
          return;
        }
      }
    }

    if (this.readyState === 1) {
      this.readyState = 2; // CLOSING
      const respBuf = Buffer.alloc(2);
      respBuf.writeUInt16BE(code, 0);
      try {
        this.sendFrame(0x08, respBuf);
      } catch (e) {}
    }

    try {
      this.socket.end();
    } catch (e) {}
    this.emitClose(code, reason);
  }

  private emitClose(code: number, reason: string) {
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    this.readyState = 3; // CLOSED
    this.emit('close', code, reason);
  }

  public failConnection(code: number, reason: string) {
    if (this.readyState === 3 || this.closeEmitted) return;
    this.readyState = 2;
    const reasonBuf = Buffer.from(reason, 'utf-8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    try {
      this.sendFrame(0x08, payload);
    } catch (e) {}
    try {
      this.socket.destroy();
    } catch (e) {}
    this.emitClose(code, reason);
  }

  public send(data: string | Buffer | Uint8Array | ArrayBuffer) {
    if (this.readyState !== 1) return;
    if (typeof data === 'string') {
      this.sendFrame(0x01, Buffer.from(data, 'utf-8'));
    } else if (Buffer.isBuffer(data)) {
      this.sendFrame(0x02, data);
    } else if (data instanceof Uint8Array) {
      this.sendFrame(0x02, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    } else if (data instanceof ArrayBuffer) {
      this.sendFrame(0x02, Buffer.from(data));
    }
  }

  public ping(data: Buffer = Buffer.alloc(0)) {
    if (this.readyState !== 1) return;
    const payload = data.length > 125 ? data.subarray(0, 125) : data;
    this.sendFrame(0x09, payload);
  }

  public pong(data: Buffer = Buffer.alloc(0)) {
    if (this.readyState !== 1) return;
    const payload = data.length > 125 ? data.subarray(0, 125) : data;
    this.sendFrame(0x0a, payload);
  }

  public close(code: number = 1000, reason: string = '') {
    if (this.readyState === 1) {
      this.readyState = 2;
      this.closeCodeInitiated = code;
      const reasonBuf = Buffer.from(reason, 'utf-8');
      const payload = Buffer.alloc(2 + reasonBuf.length);
      payload.writeUInt16BE(code, 0);
      reasonBuf.copy(payload, 2);
      try {
        this.sendFrame(0x08, payload);
      } catch (e) {}
      setTimeout(() => {
        if (!this.closeEmitted) {
          try {
            this.socket.destroy();
          } catch (e) {}
          this.emitClose(code, reason);
        }
      }, 500).unref();
    }
  }

  public sendFrame(opcode: number, payload: Buffer) {
    const len = payload.length;
    let header: Buffer;
    const maskBit = this.isServer ? 0x00 : 0x80;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = maskBit | len;
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = maskBit | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = maskBit | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    if (!this.isServer) {
      const maskKey = crypto.randomBytes(4);
      const maskedPayload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) {
        maskedPayload[i] = payload[i] ^ maskKey[i % 4];
      }
      this.socket.write(Buffer.concat([header, maskKey, maskedPayload]));
    } else {
      this.socket.write(Buffer.concat([header, payload]));
    }
  }
}

// ============================================================================
// Robust Incremental EBML / WebM Demuxer & VP8 Keyframe Validator
// ============================================================================

export interface EbmlVint {
  value: number;
  length: number;
}

export interface EbmlElementHeader {
  id: number;
  idLength: number;
  size: number;
  sizeLength: number;
  isUnknownSize: boolean;
  totalHeaderLength: number;
}

/**
 * Reads an EBML Element ID at the given offset.
 * Preserves the leading length bits as specified in RFC 8794 (EBML).
 */
export function readEbmlElementId(buffer: Buffer, offset: number = 0): { id: number; length: number } | null {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  if (firstByte === 0) return null;

  let mask = 0x80;
  let length = 1;
  while (length <= 4 && (firstByte & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 4 || offset + length > buffer.length) return null;

  let id = 0;
  for (let i = 0; i < length; i++) {
    id = (id * 256) + buffer[offset + i];
  }
  return { id, length };
}

/**
 * Reads an EBML Element Data Size VINT at the given offset.
 * Clears the leading length bit. Detects all-1s (unknown size).
 */
export function readEbmlElementSize(buffer: Buffer, offset: number = 0): { size: number; length: number; isUnknown: boolean } | null {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  if (firstByte === 0) return null;

  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (firstByte & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || offset + length > buffer.length) return null;

  let isUnknown = (firstByte & (mask - 1)) === (mask - 1);
  let size = firstByte & (mask - 1);
  for (let i = 1; i < length; i++) {
    const b = buffer[offset + i];
    if (b !== 0xFF) isUnknown = false;
    size = (size * 256) + b;
  }
  return { size, length, isUnknown };
}

/**
 * Reads a generic EBML VINT (value with length bit cleared).
 */
export function readEbmlVint(buffer: Buffer, offset: number = 0): EbmlVint | null {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  if (firstByte === 0) return null;

  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (firstByte & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || offset + length > buffer.length) return null;

  let value = firstByte & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = (value * 256) + buffer[offset + i];
  }
  return { value, length };
}

export function readEbmlHeader(buffer: Buffer, offset: number = 0): EbmlElementHeader | null {
  const idInfo = readEbmlElementId(buffer, offset);
  if (!idInfo) return null;
  const sizeInfo = readEbmlElementSize(buffer, offset + idInfo.length);
  if (!sizeInfo) return null;

  return {
    id: idInfo.id,
    idLength: idInfo.length,
    size: sizeInfo.size,
    sizeLength: sizeInfo.length,
    isUnknownSize: sizeInfo.isUnknown,
    totalHeaderLength: idInfo.length + sizeInfo.length
  };
}

/**
 * Inspects a SimpleBlock (0xA3) payload and verifies whether it represents an authentic VP8 Keyframe.
 *
 * Rejects:
 * - SimpleBlocks belonging to other tracks (e.g. Audio track)
 * - SimpleBlocks with Keyframe flag bit (bit 7) cleared (Delta/Inter frames)
 * - VP8 payloads with frame_type bit = 1 (Inter frames)
 * - Payloads that happen to contain the 0x9D 0x01 0x2A sequence as random data inside delta or audio payloads
 */
export function isSimpleBlockKeyframe(
  buffer: Buffer,
  blockDataOffset: number,
  blockSize: number,
  expectedVideoTrack: number = 1
): boolean {
  if (blockDataOffset >= buffer.length || blockSize < 4) return false;
  // If declared block size extends beyond available buffer, data is incomplete/truncated
  if (blockDataOffset + blockSize > buffer.length) return false;

  let cursor = blockDataOffset;
  const trackInfo = readEbmlVint(buffer, cursor);
  if (!trackInfo) return false;
  cursor += trackInfo.length;

  // 1. Must belong to the video track
  if (trackInfo.value !== expectedVideoTrack) {
    return false;
  }

  // 2. Relative timecode (2 bytes)
  if (cursor + 2 > buffer.length) return false;
  cursor += 2;

  // 3. SimpleBlock Flags (1 byte)
  // Bit 7 (0x80) is Keyframe flag in Matroska/WebM
  if (cursor >= buffer.length) return false;
  const flags = buffer[cursor];
  cursor += 1;

  const isKeyframeFlag = (flags & 0x80) !== 0;
  if (!isKeyframeFlag) {
    // Definitive reject: This is an Inter/Delta frame, even if 9D 01 2A appears inside payload!
    return false;
  }

  // 4. VP8 Frame Payload Validation
  // Need at least 6 bytes for uncompressed chunk header + start code
  const payloadLength = (blockDataOffset + blockSize) - cursor;
  if (payloadLength < 6 || cursor + 6 > buffer.length) {
    return false;
  }

  // VP8 uncompressed chunk header:
  // Byte 0: Bit 0 is frame_type: 0 = Key Frame, 1 = Inter Frame
  const frameTag = buffer[cursor];
  const frameType = frameTag & 0x01;
  if (frameType !== 0) {
    return false;
  }

  // Byte 3, 4, 5: Start code for VP8 Keyframe is 0x9D, 0x01, 0x2A
  const s0 = buffer[cursor + 3];
  const s1 = buffer[cursor + 4];
  const s2 = buffer[cursor + 5];

  return s0 === 0x9D && s1 === 0x01 && s2 === 0x2A;
}

/**
 * Inspects a BlockGroup (0xA0) element for an authentic VP8 keyframe.
 * In BlockGroup, an Inter frame has a ReferenceBlock (0xFB) child element.
 */
export function isBlockGroupKeyframe(
  buffer: Buffer,
  groupDataOffset: number,
  groupSize: number,
  expectedVideoTrack: number = 1
): boolean {
  let cursor = groupDataOffset;
  const end = Math.min(buffer.length, groupDataOffset + groupSize);
  let hasReference = false;
  let isBlockKey = false;

  while (cursor < end) {
    const header = readEbmlHeader(buffer, cursor);
    if (!header) break;
    const cDataOffset = cursor + header.totalHeaderLength;
    const next = header.isUnknownSize ? end : cDataOffset + header.size;

    if (header.id === 0xFB) {
      // ReferenceBlock present -> definite Inter frame
      hasReference = true;
    } else if (header.id === 0xA1) {
      // Block (0xA1): Track VINT + 2-byte timecode + 1-byte flags + payload
      let bCursor = cDataOffset;
      const trackInfo = readEbmlVint(buffer, bCursor);
      if (trackInfo && trackInfo.value === expectedVideoTrack) {
        bCursor += trackInfo.length + 3; // track + 2-byte timecode + 1-byte flags
        if (bCursor + 6 <= buffer.length) {
          const frameType = buffer[bCursor] & 0x01;
          if (
            frameType === 0 &&
            buffer[bCursor + 3] === 0x9D &&
            buffer[bCursor + 4] === 0x01 &&
            buffer[bCursor + 5] === 0x2A
          ) {
            isBlockKey = true;
          }
        }
      }
    }
    cursor = next <= cursor ? cursor + 1 : next;
  }

  return !hasReference && isBlockKey;
}

/**
 * Parses a WebM Cluster element incrementally to determine if it contains an authentic VP8 Keyframe.
 */
export function isWebmClusterKeyframe(clusterBuffer: Buffer, videoTrackNumber: number = 1): boolean {
  if (clusterBuffer.length < 5) return false;

  const clusterHeader = readEbmlHeader(clusterBuffer, 0);
  if (!clusterHeader || clusterHeader.id !== 0x1F43B675) {
    return false;
  }

  let cursor = clusterHeader.totalHeaderLength;
  const limit = clusterHeader.isUnknownSize
    ? clusterBuffer.length
    : Math.min(clusterBuffer.length, clusterHeader.totalHeaderLength + clusterHeader.size);

  while (cursor < limit) {
    const childHeader = readEbmlHeader(clusterBuffer, cursor);
    if (!childHeader) break;

    const dataOffset = cursor + childHeader.totalHeaderLength;
    const nextOffset = childHeader.isUnknownSize ? limit : dataOffset + childHeader.size;

    if (childHeader.id === 0xA3) {
      // SimpleBlock
      if (isSimpleBlockKeyframe(clusterBuffer, dataOffset, childHeader.size, videoTrackNumber)) {
        return true;
      }
    } else if (childHeader.id === 0xA0) {
      // BlockGroup
      if (isBlockGroupKeyframe(clusterBuffer, dataOffset, childHeader.size, videoTrackNumber)) {
        return true;
      }
    }

    if (nextOffset <= cursor) {
      cursor++;
    } else {
      cursor = nextOffset;
    }
  }

  return false;
}

/**
 * Scans an Init Segment (EBML Header + Segment + Tracks) to identify the video track number.
 * Defaults to 1 if not explicitly declared.
 */
export function extractVideoTrackNumber(initSegment: Buffer): number {
  try {
    const TRACKS_ID = 0x1654AE6B;
    const TRACK_ENTRY_ID = 0xAE;
    const TRACK_NUMBER_ID = 0xD7;
    const TRACK_TYPE_ID = 0x83;

    let offset = 0;
    while (offset < initSegment.length - 4) {
      const header = readEbmlHeader(initSegment, offset);
      if (!header) {
        offset++;
        continue;
      }

      if (header.id === TRACKS_ID) {
        // Scan TrackEntry elements
        let cursor = offset + header.totalHeaderLength;
        const tracksEnd = header.isUnknownSize ? initSegment.length : cursor + header.size;

        while (cursor < tracksEnd) {
          const entryHeader = readEbmlHeader(initSegment, cursor);
          if (!entryHeader) break;

          if (entryHeader.id === TRACK_ENTRY_ID) {
            let entryCursor = cursor + entryHeader.totalHeaderLength;
            const entryEnd = entryHeader.isUnknownSize ? tracksEnd : entryCursor + entryHeader.size;

            let trackNum: number | null = null;
            let trackType: number | null = null;

            while (entryCursor < entryEnd) {
              const fieldHeader = readEbmlHeader(initSegment, entryCursor);
              if (!fieldHeader) break;

              const valOffset = entryCursor + fieldHeader.totalHeaderLength;
              if (fieldHeader.id === TRACK_NUMBER_ID) {
                const vint = readEbmlVint(initSegment, valOffset);
                if (vint) trackNum = vint.value;
              } else if (fieldHeader.id === TRACK_TYPE_ID) {
                const vint = readEbmlVint(initSegment, valOffset);
                if (vint) trackType = vint.value; // 1 = Video, 2 = Audio
              }

              entryCursor = valOffset + fieldHeader.size;
            }

            if (trackType === 1 && trackNum !== null) {
              return trackNum;
            }
          }

          cursor = cursor + entryHeader.totalHeaderLength + (entryHeader.isUnknownSize ? 0 : entryHeader.size);
        }
      }

      offset += header.totalHeaderLength;
    }
  } catch (e) {}

  return 1; // Default video track number in standard WebM
}

/**
 * Constructs a mock WebM Cluster with compliant EBML / SimpleBlock framing.
 * Useful for automated verification of keyframe detection and false-positive rejection.
 */
export function createMockWebmCluster(options: {
  timecode?: number;
  trackNumber?: number;
  isKeyframe?: boolean;
  payload?: Buffer;
  unknownSize?: boolean;
  twoByteTrackNumber?: boolean;
  extraElements?: Buffer[];
}): Buffer {
  const trackNum = options.trackNumber ?? 1;
  const isKey = options.isKeyframe ?? true;

  // Timecode element: ID 0xE7, size 2, value 0
  const timecodeEl = Buffer.from([0xE7, 0x82, 0x00, 0x00]);

  // Construct SimpleBlock payload
  let vp8Payload: Buffer;
  if (options.payload) {
    vp8Payload = options.payload;
  } else if (isKey) {
    // Valid VP8 Keyframe: frameType=0, version=0, show=1, sync code 0x9D 0x01 0x2A
    vp8Payload = Buffer.from([
      0x10, // frame_type=0 (bit 0=0), show_frame=1 (bit 4=1)
      0x00, 0x00, // partition size
      0x9D, 0x01, 0x2A, // VP8 sync code
      0x40, 0x01, 0xF0, 0x00 // 320x240
    ]);
  } else {
    // Valid VP8 Delta frame: frameType=1 (bit 0=1)
    vp8Payload = Buffer.from([
      0x11, // frame_type=1 (bit 0=1)
      0x00, 0x00,
      0x55, 0x66, 0x77, 0x88
    ]);
  }

  // SimpleBlock header: track (1 or 2 byte VINT) + timecode (2 bytes) + flags (1 byte)
  const trackVint = options.twoByteTrackNumber
    ? Buffer.from([0x40, trackNum & 0xFF])
    : Buffer.from([0x80 | (trackNum & 0x7F)]);
  const relTime = Buffer.from([0x00, 0x00]);
  const flags = Buffer.from([isKey ? 0x80 : 0x00]);

  const blockData = Buffer.concat([trackVint, relTime, flags, vp8Payload]);
  
  // SimpleBlock element: ID 0xA3 + size VINT + blockData
  let sizeVint: Buffer;
  if (blockData.length < 127) {
    sizeVint = Buffer.from([0x80 | blockData.length]);
  } else {
    sizeVint = Buffer.from([0x40 | (blockData.length >> 8), blockData.length & 0xFF]);
  }
  const simpleBlockEl = Buffer.concat([Buffer.from([0xA3]), sizeVint, blockData]);

  // Cluster children: Timecode + extraElements + SimpleBlock
  const children: Buffer[] = [timecodeEl];
  if (options.extraElements && options.extraElements.length > 0) {
    children.push(...options.extraElements);
  }
  children.push(simpleBlockEl);
  const clusterData = Buffer.concat(children);

  let clusterSizeVint: Buffer;
  if (options.unknownSize) {
    // 8-byte EBML Unknown Size VINT: 0x01 followed by seven 0xFF bytes
    clusterSizeVint = Buffer.from([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
  } else if (clusterData.length < 127) {
    clusterSizeVint = Buffer.from([0x80 | clusterData.length]);
  } else {
    clusterSizeVint = Buffer.from([0x40 | (clusterData.length >> 8), clusterData.length & 0xFF]);
  }

  return Buffer.concat([
    Buffer.from([0x1F, 0x43, 0xB6, 0x75]),
    clusterSizeVint,
    clusterData
  ]);
}

/**
 * Stateful incremental WebM / EBML stream demuxer.
 * Preserves incomplete elements across arbitrary chunk boundaries until the complete element
 * or cluster boundary is received.
 */
export class EbmlStreamDemuxer {
  private buffer: Buffer = Buffer.alloc(0);
  private videoTrackNumber: number = 1;
  private hasExtractedInitSegment: boolean = false;
  private cachedInitSegment: Buffer | null = null;
  private cachedLatestKeyframe: Buffer | null = null;

  constructor(options?: { videoTrackNumber?: number }) {
    if (options?.videoTrackNumber) this.videoTrackNumber = options.videoTrackNumber;
  }

  public feed(chunk: Buffer): {
    initSegment: Buffer | null;
    completedClusters: { data: Buffer; isKeyframe: boolean }[];
    hasIncompleteData: boolean;
    bufferedBytes: number;
  } {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let initSegment: Buffer | null = null;
    const completedClusters: { data: Buffer; isKeyframe: boolean }[] = [];

    const CLUSTER_ID = Buffer.from([0x1F, 0x43, 0xB6, 0x75]);
    const EBML_ID = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);

    if (!this.hasExtractedInitSegment) {
      const ebmlIdx = this.buffer.indexOf(EBML_ID);
      if (ebmlIdx > 0) {
        this.buffer = this.buffer.subarray(ebmlIdx);
      }
      const clusterIdx = this.buffer.indexOf(CLUSTER_ID);
      if (clusterIdx !== -1) {
        initSegment = Buffer.from(this.buffer.subarray(0, clusterIdx));
        this.buffer = this.buffer.subarray(clusterIdx);
        if (initSegment.length > 0) {
          this.cachedInitSegment = initSegment;
          this.videoTrackNumber = extractVideoTrackNumber(initSegment);
        }
        this.hasExtractedInitSegment = true;
      }
    }

    if (this.hasExtractedInitSegment) {
      while (true) {
        // Look for next cluster boundary
        const nextClusterIdx = this.buffer.indexOf(CLUSTER_ID, 4);
        if (nextClusterIdx !== -1) {
          const clusterData = Buffer.from(this.buffer.subarray(0, nextClusterIdx));
          this.buffer = this.buffer.subarray(nextClusterIdx);
          const isKey = isWebmClusterKeyframe(clusterData, this.videoTrackNumber);
          if (isKey) this.cachedLatestKeyframe = clusterData;
          completedClusters.push({ data: clusterData, isKeyframe: isKey });
          continue;
        }

        // Also check if current cluster has a known declared size
        const header = readEbmlHeader(this.buffer, 0);
        if (header && header.id === 0x1F43B675 && !header.isUnknownSize) {
          const totalLength = header.totalHeaderLength + header.size;
          if (this.buffer.length >= totalLength) {
            const clusterData = Buffer.from(this.buffer.subarray(0, totalLength));
            this.buffer = this.buffer.subarray(totalLength);
            const isKey = isWebmClusterKeyframe(clusterData, this.videoTrackNumber);
            if (isKey) this.cachedLatestKeyframe = clusterData;
            completedClusters.push({ data: clusterData, isKeyframe: isKey });
            continue;
          }
        }

        break;
      }
    }

    return {
      initSegment,
      completedClusters,
      hasIncompleteData: this.buffer.length > 0,
      bufferedBytes: this.buffer.length
    };
  }

  public getBufferedBytes(): number {
    return this.buffer.length;
  }

  public getBufferedData(): Buffer {
    return this.buffer;
  }

  public getVideoTrackNumber(): number {
    return this.videoTrackNumber;
  }

  public setVideoTrackNumber(num: number) {
    this.videoTrackNumber = num;
  }

  public getCachedInitSegment(): Buffer | null {
    return this.cachedInitSegment;
  }

  public getCachedLatestKeyframe(): Buffer | null {
    return this.cachedLatestKeyframe;
  }

  public reset() {
    this.buffer = Buffer.alloc(0);
    this.hasExtractedInitSegment = false;
    this.cachedInitSegment = null;
    this.cachedLatestKeyframe = null;
  }
}

export class ShareServer {
  private server: http.Server | null = null;
  private port: number = 4545;
  private localIp: string = 'localhost';
  private getMetadata: () => RecordingMeta[];
  private saveMetadata: (list: RecordingMeta[]) => void;
  private tunnelProcess: ChildProcess | null = null;
  private publicTunnelUrl: string | null = null;

  // Zoom-Style Live Screen Sharing State
  private isLive: boolean = false;
  private isLivePaused: boolean = false;
  private liveTitle: string = 'Apresentação ao Vivo';
  private liveStartTime: number = 0;
  private liveTransportMode: 'mjpeg' | 'mse' = 'mjpeg';
  private activeLiveClients: Set<http.ServerResponse> = new Set();
  private liveEventClients: Set<http.ServerResponse> = new Set();
  private latestLiveJpeg: Buffer | null = null;
  private latestLiveTimestamp: number = 0;

  // MSE WebSocket Streaming Pipeline (Experimental)
  private mseClients: Set<NativeWebSocket> = new Set();
  private cachedInitSegment: Buffer | null = null;
  private cachedLatestKeyframe: Buffer | null = null;
  private mseStreamAccumulator: Buffer = Buffer.alloc(0);
  private hasExtractedInitSegment: boolean = false;
  private mseSeq: number = 0;
  private mseBytesTotal: number = 0;
  private videoTrackNumber: number = 1;

  public onLiveReaction?: (reaction: { emoji: string; author?: string; time: number }) => void;
  public onLiveViewersChanged?: (count: number) => void;
  public onLiveQuestion?: (question: { text: string; author?: string; time: number }) => void;

  constructor(getMetadata: () => RecordingMeta[], saveMetadata: (list: RecordingMeta[]) => void) {
    this.getMetadata = getMetadata;
    this.saveMetadata = saveMetadata;
    this.localIp = this.detectLocalIp();
  }

  private detectLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  public getPublicUrl(): string | null {
    return this.publicTunnelUrl;
  }

  public getShareUrl(id: string): string {
    if (this.publicTunnelUrl) {
      return `${this.publicTunnelUrl}/share/${id}`;
    }
    return `http://${this.localIp}:${this.port}/share/${id}`;
  }

  public getLocalShareUrl(id: string): string {
    return `http://localhost:${this.port}/share/${id}`;
  }

  public getPort(): number {
    return this.port;
  }

  // Live Screen Sharing Management
  public startLive(title: string = 'Apresentação ao Vivo') {
    this.isLive = true;
    this.isLivePaused = false;
    this.liveTitle = title;
    this.liveStartTime = Date.now();
    this.cachedInitSegment = null;
    this.cachedLatestKeyframe = null;
    this.mseStreamAccumulator = Buffer.alloc(0);
    this.hasExtractedInitSegment = false;
    this.videoTrackNumber = 1;
    this.mseSeq = 0;
    this.broadcastLiveEvent({ type: 'status', status: this.getLiveStatus() });
    return this.getLiveUrls();
  }

  public stopLive() {
    this.isLive = false;
    this.isLivePaused = false;
    this.broadcastLiveEvent({ type: 'status', status: this.getLiveStatus() });
    
    // Close MJPEG HTTP clients
    for (const client of this.activeLiveClients) {
      try {
        client.end();
      } catch (e) {}
    }
    this.activeLiveClients.clear();

    // Close MSE WebSocket clients cleanly
    for (const ws of this.mseClients) {
      try {
        ws.close();
      } catch (e) {}
    }
    this.mseClients.clear();

    // Reset session cache
    this.cachedInitSegment = null;
    this.cachedLatestKeyframe = null;
    this.mseStreamAccumulator = Buffer.alloc(0);
    this.hasExtractedInitSegment = false;
    this.videoTrackNumber = 1;
    this.mseSeq = 0;
    this.latestLiveJpeg = null;

    this.notifyViewersChanged();
  }

  public setLivePaused(paused: boolean) {
    this.isLivePaused = paused;
    this.broadcastLiveEvent({ type: 'status', status: this.getLiveStatus() });
  }

  public isLiveActive(): boolean {
    return this.isLive;
  }

  public isPaused(): boolean {
    return this.isLivePaused;
  }

  public getLiveViewersCount(): number {
    return this.activeLiveClients.size + this.mseClients.size;
  }

  public getLiveUrl(): string {
    if (this.publicTunnelUrl) {
      return `${this.publicTunnelUrl}/live`;
    }
    return `http://${this.localIp}:${this.port}/live`;
  }

  public getLiveUrls() {
    return {
      networkUrl: `http://${this.localIp}:${this.port}/live`,
      localUrl: `http://localhost:${this.port}/live`,
      publicUrl: this.publicTunnelUrl ? `${this.publicTunnelUrl}/live` : null
    };
  }

  public getLiveStatus() {
    return {
      isLive: this.isLive,
      isPaused: this.isLivePaused,
      viewers: this.getLiveViewersCount(),
      title: this.liveTitle,
      transportMode: this.liveTransportMode,
      uptime: this.isLive ? Math.floor((Date.now() - this.liveStartTime) / 1000) : 0,
      url: this.getLiveUrl(),
      urls: this.getLiveUrls()
    };
  }

  public setLiveTransportMode(mode: 'mjpeg' | 'mse') {
    this.liveTransportMode = mode;
    this.broadcastLiveEvent({ type: 'transport-mode', mode: this.liveTransportMode, status: this.getLiveStatus() });
  }

  public getLiveTransportMode(): 'mjpeg' | 'mse' {
    return this.liveTransportMode;
  }

  public getCachedInitSegment(): Buffer | null {
    return this.cachedInitSegment;
  }

  public getCachedLatestKeyframe(): Buffer | null {
    return this.cachedLatestKeyframe;
  }

  public broadcastLiveFrame(jpegBuffer: Buffer) {
    if (!this.isLive) return;
    this.latestLiveJpeg = jpegBuffer;
    this.latestLiveTimestamp = Date.now();

    if (this.isLivePaused) return;

    for (const client of this.activeLiveClients) {
      try {
        this.writeFrameToClient(client, jpegBuffer);
      } catch (err) {
        this.activeLiveClients.delete(client);
      }
    }
  }

  private dispatchChunkToMseClients(meta: string, chunk: Buffer) {
    for (const ws of this.mseClients) {
      if (ws.readyState === 1) {
        // Backpressure safeguard: if socket buffer has > 2MB pending, terminate slow client
        // to prevent WebM byte stream corruption and desynchronization
        if (ws.socket && (ws.socket as any).writableLength > 2 * 1024 * 1024) {
          console.warn('[ShareServer MSE] Slow client socket buffer exceeds 2MB. Closing client cleanly to prevent stream desync.');
          try {
            ws.close(1008, 'Buffer overflow - reconnecting');
          } catch (e) {
            ws.socket.destroy();
          }
          this.mseClients.delete(ws);
          this.notifyViewersChanged();
          continue;
        }
        try {
          ws.send(meta);
          ws.send(chunk);
        } catch (e) {
          this.mseClients.delete(ws);
          this.notifyViewersChanged();
        }
      }
    }
  }

  public broadcastLiveMseChunk(chunk: Buffer) {
    if (!this.isLive || this.isLivePaused) return;

    const CLUSTER_ID = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const EBML_ID = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

    // Check if this chunk is already a standalone complete unit (as passed by unit tests)
    // 1) Unit test case: chunk begins with EBML header AND contains no Cluster ID
    const isStandaloneInit = chunk.length >= 4 &&
      chunk[0] === 0x1a && chunk[1] === 0x45 && chunk[2] === 0xdf && chunk[3] === 0xa3 &&
      chunk.indexOf(CLUSTER_ID) === -1;

    if (isStandaloneInit && this.mseStreamAccumulator.length === 0) {
      this.cachedInitSegment = chunk;
      this.hasExtractedInitSegment = true;
      this.videoTrackNumber = extractVideoTrackNumber(chunk);
      this.mseSeq++;
      this.mseBytesTotal += chunk.length;
      const meta = JSON.stringify({
        type: 'init-meta',
        seq: this.mseSeq,
        size: chunk.length,
        timestamp: Date.now()
      });
      this.dispatchChunkToMseClients(meta, chunk);
      return;
    }

    // 2) Unit test case: chunk begins with Cluster ID AND does not contain a second cluster ID
    const isStandaloneCluster = chunk.length >= 4 &&
      chunk[0] === 0x1f && chunk[1] === 0x43 && chunk[2] === 0xb6 && chunk[3] === 0x75 &&
      chunk.indexOf(CLUSTER_ID, 4) === -1;

    if (isStandaloneCluster && this.mseStreamAccumulator.length === 0) {
      const isKeyframe = isWebmClusterKeyframe(chunk, this.videoTrackNumber);
      if (isKeyframe) {
        this.cachedLatestKeyframe = chunk;
      }
      this.mseSeq++;
      this.mseBytesTotal += chunk.length;
      const meta = JSON.stringify({
        type: 'segment-meta',
        seq: this.mseSeq,
        size: chunk.length,
        timestamp: Date.now(),
        isKeyframe
      });
      this.dispatchChunkToMseClients(meta, chunk);
      return;
    }

    // 3) Streaming pipeline (e.g. MediaRecorder streaming chunks that may be fragmented across cluster boundaries)
    this.mseStreamAccumulator = Buffer.concat([this.mseStreamAccumulator, chunk]);

    let mediaChunkToDispatch: Buffer | null = null;

    if (!this.hasExtractedInitSegment) {
      const ebmlIdx = this.mseStreamAccumulator.indexOf(EBML_ID);
      if (ebmlIdx !== -1) {
        if (ebmlIdx > 0) {
          this.mseStreamAccumulator = this.mseStreamAccumulator.subarray(ebmlIdx);
        }
        const clusterIdx = this.mseStreamAccumulator.indexOf(CLUSTER_ID);
        if (clusterIdx !== -1) {
          const initSeg = Buffer.from(this.mseStreamAccumulator.subarray(0, clusterIdx));
          this.mseStreamAccumulator = this.mseStreamAccumulator.subarray(clusterIdx);
          this.cachedInitSegment = initSeg;
          this.hasExtractedInitSegment = true;
          this.videoTrackNumber = extractVideoTrackNumber(initSeg);

          this.mseSeq++;
          this.mseBytesTotal += initSeg.length;
          const meta = JSON.stringify({
            type: 'init-meta',
            seq: this.mseSeq,
            size: initSeg.length,
            timestamp: Date.now()
          });
          this.dispatchChunkToMseClients(meta, initSeg);

          if (this.mseStreamAccumulator.length > 0) {
            mediaChunkToDispatch = Buffer.from(this.mseStreamAccumulator);
          }
        }
      }
    } else {
      mediaChunkToDispatch = chunk;
    }

    // Maintain accumulator for keyframe cluster extraction and caching
    while (true) {
      const nextClusterIdx = this.mseStreamAccumulator.indexOf(CLUSTER_ID, 4);
      if (nextClusterIdx === -1) break;

      const cluster = Buffer.from(this.mseStreamAccumulator.subarray(0, nextClusterIdx));
      this.mseStreamAccumulator = this.mseStreamAccumulator.subarray(nextClusterIdx);

      const isKeyframe = isWebmClusterKeyframe(cluster, this.videoTrackNumber);
      if (isKeyframe) {
        this.cachedLatestKeyframe = cluster;
      }
    }

    if (!this.cachedLatestKeyframe && this.mseStreamAccumulator.length >= 10) {
      if (isWebmClusterKeyframe(this.mseStreamAccumulator, this.videoTrackNumber)) {
        this.cachedLatestKeyframe = Buffer.from(this.mseStreamAccumulator);
      }
    }

    if (mediaChunkToDispatch && mediaChunkToDispatch.length > 0) {
      this.mseSeq++;
      this.mseBytesTotal += mediaChunkToDispatch.length;
      const meta = JSON.stringify({
        type: 'segment-meta',
        seq: this.mseSeq,
        size: mediaChunkToDispatch.length,
        timestamp: Date.now()
      });
      this.dispatchChunkToMseClients(meta, mediaChunkToDispatch);
    }
  }

  private writeFrameToClient(res: http.ServerResponse, buffer: Buffer) {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
    res.write(buffer);
    res.write('\r\n');
  }

  private notifyViewersChanged() {
    const count = this.getLiveViewersCount();
    this.broadcastLiveEvent({ type: 'viewers', count });
    if (this.onLiveViewersChanged) {
      this.onLiveViewersChanged(count);
    }
  }

  private broadcastLiveEvent(event: any) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.liveEventClients) {
      try {
        client.write(payload);
      } catch (e) {
        this.liveEventClients.delete(client);
      }
    }
  }

  public isPublicTunnelRequest(req: http.IncomingMessage): boolean {
    const host = (req.headers['host'] || '').toLowerCase();
    if (host.includes('trycloudflare.com') || host.includes('cloudflare')) return true;
    if (req.headers['cf-ray'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return true;
    if (this.publicTunnelUrl) {
      try {
        const publicHost = new URL(this.publicTunnelUrl).host.toLowerCase();
        if (host === publicHost) return true;
      } catch (e) {}
    }
    return false;
  }

  public sanitizePath(rawUrl: string): string | null {
    try {
      if (rawUrl.includes('..') || rawUrl.toLowerCase().includes('%2e%2e') || rawUrl.includes('\0') || rawUrl.includes('%00')) {
        return null;
      }
      const parsed = new URL(rawUrl, 'http://localhost');
      let pathname = parsed.pathname;
      try {
        pathname = decodeURIComponent(pathname);
      } catch (e) {
        return null;
      }
      if (pathname.includes('\0')) return null;
      const normalized = path.posix.normalize(pathname);
      if (normalized.startsWith('../') || normalized.includes('/../')) return null;
      return normalized;
    } catch (e) {
      return null;
    }
  }

  public start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // WebSocket Upgrade Handler (Pure RFC 6455 over Node.js net)
      this.server.on('upgrade', (req, socket, head) => {
        // RFC 6455 Section 4.2.1: Handshake must be GET
        if (req.method !== 'GET') {
          socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
          socket.destroy();
          return;
        }

        const pathname = this.sanitizePath(req.url || '/');
        if (!pathname) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        // Security check for public tunnel: only /ws/mse is allowed
        if (this.isPublicTunnelRequest(req) && pathname !== '/ws/mse') {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        if (pathname === '/ws/mse') {
          if (!this.isLive) {
            socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            socket.destroy();
            return;
          }

          const version = req.headers['sec-websocket-version'];
          if (version !== '13') {
            socket.write('HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\n\r\n');
            socket.destroy();
            return;
          }

          const key = req.headers['sec-websocket-key'];
          if (!key || typeof key !== 'string' || key.trim().length === 0) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
          }

          const acceptKey = crypto
            .createHash('sha1')
            .update(key.trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');

          const responseHeaders = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${acceptKey}`
          ];

          socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
          const ws = new NativeWebSocket(socket as any, head, { isServer: true });

          this.mseClients.add(ws);
          this.notifyViewersChanged();

          // Late-join spectator initialization: dispatch cached Init Segment immediately
          if (this.cachedInitSegment) {
            ws.send(JSON.stringify({ type: 'init-meta', size: this.cachedInitSegment.length }));
            ws.send(this.cachedInitSegment);

            let entryCluster: Buffer | null = null;
            if (this.mseStreamAccumulator.length > 0 && isWebmClusterKeyframe(this.mseStreamAccumulator, this.videoTrackNumber)) {
              entryCluster = Buffer.from(this.mseStreamAccumulator);
            } else if (this.cachedLatestKeyframe) {
              entryCluster = this.cachedLatestKeyframe;
            }

            if (entryCluster) {
              ws.send(JSON.stringify({
                type: 'segment-meta',
                seq: this.mseSeq,
                size: entryCluster.length,
                timestamp: Date.now(),
                isKeyframe: true
              }));
              ws.send(entryCluster);
            }
          }

          ws.on('close', () => {
            this.mseClients.delete(ws);
            this.notifyViewersChanged();
          });

          ws.on('error', () => {
            this.mseClients.delete(ws);
            this.notifyViewersChanged();
          });
        } else {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
        }
      });

      this.server.listen(this.port, () => {
        console.log(`[Aura Share Server] Running locally at http://${this.localIp}:${this.port}`);
        this.startTunnel();
        resolve(this.port);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          this.port += 1;
          this.server?.listen(this.port);
        } else {
          console.error('[Aura Share Server] Error:', err);
        }
      });
    });
  }

  private startTunnel() {
    const binPathCandidates = [
      path.join(process.resourcesPath || '', 'cloudflared.exe'),
      path.join(process.resourcesPath || '', 'bin', 'cloudflared.exe'),
      path.resolve(__dirname, '../../bin/cloudflared.exe'),
      path.resolve(__dirname, '../bin/cloudflared.exe'),
      path.resolve(process.cwd(), 'bin/cloudflared.exe'),
      'cloudflared.exe',
      'cloudflared'
    ];

    let chosenBin = '';
    for (const p of binPathCandidates) {
      if (fs.existsSync(p)) {
        chosenBin = p;
        break;
      }
    }

    if (!chosenBin) {
      console.warn('[Aura Cloudflare Tunnel] cloudflared.exe not found. Running local-only mode.');
      return;
    }

    try {
      console.log(`[Aura Cloudflare Tunnel] Launching public tunnel using ${chosenBin} for port ${this.port}...`);
      this.tunnelProcess = spawn(chosenBin, ['tunnel', '--url', `http://localhost:${this.port}`], {
        windowsHide: true
      });

      const handleData = (chunk: Buffer) => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !this.publicTunnelUrl) {
          this.publicTunnelUrl = match[0];
          console.log(`\n======================================================`);
          console.log(`🚀 [Aura Public Internet Link READY]`);
          console.log(`🔗 Global URL: ${this.publicTunnelUrl}`);
          console.log(`======================================================\n`);
        }
      };

      this.tunnelProcess.stdout?.on('data', handleData);
      this.tunnelProcess.stderr?.on('data', handleData);

      this.tunnelProcess.on('error', (err) => {
        console.warn('[Aura Cloudflare Tunnel] Process error:', err.message);
      });

      this.tunnelProcess.on('exit', (code) => {
        console.log('[Aura Cloudflare Tunnel] Exited with code:', code);
        this.tunnelProcess = null;
        this.publicTunnelUrl = null;
      });
    } catch (err) {
      console.warn('[Aura Cloudflare Tunnel] Failed to start:', err);
    }
  }

  public stop() {
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill();
      } catch (e) {}
      this.tunnelProcess = null;
    }

    for (const ws of this.mseClients) {
      try {
        ws.close();
      } catch (e) {}
    }
    this.mseClients.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers for local network access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = this.sanitizePath(req.url || '/');
    if (pathname === null) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Requisição inválida ou caminho malformado.' }));
      return;
    }

    // SECURITY: Public Tunnel Route Isolation
    // When incoming traffic arrives through Cloudflare public tunnel,
    // strictly isolate routes so private recordings and administrative endpoints are NEVER exposed.
    if (this.isPublicTunnelRequest(req)) {
      const isAllowedLivePath =
        pathname === '/live' ||
        pathname === '/live/' ||
        pathname === '/live/stream' ||
        pathname.startsWith('/api/live/') ||
        pathname === '/favicon.ico';

      if (!isAllowedLivePath) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Acesso negado: rotas locais e arquivos gravados não são expostos via túnel público.'
        }));
        return;
      }
    }

    // LIVE STREAMING & SCREEN SHARE ENDPOINTS
    if (pathname === '/live' || pathname === '/live/') {
      this.renderLiveViewer(req, res);
      return;
    }

    if (pathname === '/live/stream') {
      this.handleLiveStream(req, res);
      return;
    }

    if (pathname === '/api/live/events') {
      this.handleLiveEvents(req, res);
      return;
    }

    if (pathname === '/api/live/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getLiveStatus()));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/live/reaction') {
      this.handleLiveReactionPost(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/live/question') {
      this.handleLiveQuestionPost(req, res);
      return;
    }

    // 1. Video streaming endpoint: /video/:id
    if (pathname.startsWith('/video/')) {
      const id = pathname.replace('/video/', '');
      this.streamVideo(id, req, res);
      return;
    }

    // 2. Web player page: /share/:id
    if (pathname.startsWith('/share/')) {
      const id = pathname.replace('/share/', '');
      this.renderWebPlayer(id, req, res);
      return;
    }

    // 3. API: Add Comment /api/recordings/:id/comment
    if (req.method === 'POST' && pathname.includes('/comment')) {
      const match = pathname.match(/\/api\/recordings\/([^/]+)\/comment/);
      if (match) {
        const id = match[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const list = this.getMetadata();
            const target = list.find(r => r.id === id);
            if (target) {
              if (!target.comments) target.comments = [];
              const newComment: VideoComment = {
                id: `cmt_${Date.now()}`,
                author: data.author?.trim() || 'Espectador',
                time: Number(data.time) || 0,
                text: data.text?.trim() || '',
                createdAt: Date.now()
              };
              target.comments.push(newComment);
              this.saveMetadata(list);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, comment: newComment }));
              return;
            }
          } catch (e) {}
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid comment payload' }));
        });
        return;
      }
    }

    // 4. API: Add Reaction /api/recordings/:id/reaction
    if (req.method === 'POST' && pathname.includes('/reaction')) {
      const match = pathname.match(/\/api\/recordings\/([^/]+)\/reaction/);
      if (match) {
        const id = match[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const list = this.getMetadata();
            const target = list.find(r => r.id === id);
            if (target) {
              if (!target.reactions) target.reactions = [];
              const newReaction: VideoReaction = {
                id: `rx_${Date.now()}`,
                emoji: data.emoji || '👍',
                time: Number(data.time) || 0,
                createdAt: Date.now()
              };
              target.reactions.push(newReaction);
              this.saveMetadata(list);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, reaction: newReaction }));
              return;
            }
          } catch (e) {}
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid reaction payload' }));
        });
        return;
      }
    }

    // 5. API: View count /api/recordings/:id/view
    if (req.method === 'POST' && pathname.includes('/view')) {
      const match = pathname.match(/\/api\/recordings\/([^/]+)\/view/);
      if (match) {
        const id = match[1];
        const list = this.getMetadata();
        const target = list.find(r => r.id === id);
        if (target) {
          target.viewsCount = (target.viewsCount || 0) + 1;
          this.saveMetadata(list);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ views: target.viewsCount }));
          return;
        }
      }
    }

    // Default: Home / Dashboard of all videos
    this.renderDashboard(res);
  }

  private streamVideo(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const list = this.getMetadata();
    const video = list.find(r => r.id === id);

    if (!video || !fs.existsSync(video.filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Vídeo não encontrado ou arquivo excluído.');
      return;
    }

    const stat = fs.statSync(video.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mime = video.filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(video.filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mime
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(video.filePath).pipe(res);
    }
  }

  private renderWebPlayer(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const list = this.getMetadata();
    const video = list.find(r => r.id === id);

    if (!video) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Vídeo não encontrado</h1>');
      return;
    }

    const title = video.title || 'Gravação Aura';
    const commentsJson = JSON.stringify(video.comments || []);
    const reactionsJson = JSON.stringify(video.reactions || []);
    const transcriptJson = JSON.stringify(video.transcript || []);
    const chaptersJson = JSON.stringify(video.chapters || []);
    const aiSummary = video.aiSummary || 'Gravação gerada pelo Aura Screen Studio com tela, câmera e áudio combinados.';
    const formattedDate = new Date(video.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)} - Aura Screen</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #080a0f; color: #f1f5f9; }
    .aura-gradient { background: linear-gradient(135deg, #78A5FF 0%, #6366f1 50%, #8b5cf6 100%); }
    .floating-emoji {
      position: absolute;
      animation: floatUp 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      pointer-events: none;
      font-size: 2.2rem;
      z-index: 50;
    }
    @keyframes floatUp {
      0% { transform: translateY(0) scale(0.6); opacity: 1; }
      100% { transform: translateY(-160px) scale(1.4); opacity: 0; }
    }
    /* Custom Scrubber */
    input[type=range]::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #78A5FF;
      cursor: pointer;
      box-shadow: 0 0 12px rgba(58, 214, 198, 0.9);
    }
  </style>
</head>
<body class="min-h-screen flex flex-col bg-[#0B0E14] text-[#F3F5F9] selection:bg-[#1A2A47] selection:text-[#78A5FF]">
  <!-- Top Navbar -->
  <header class="border-b border-[#303A4B] bg-[#121722]/95 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <div class="w-9 h-9 rounded-xl bg-[#191F2B] border border-[#303A4B] flex items-center justify-center shadow-lg">
        <svg class="w-5 h-5 text-[#78A5FF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" stroke="#78A5FF" />
          <circle cx="12" cy="12" r="3.5" fill="#FF647C" />
        </svg>
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-sm font-bold text-[#F3F5F9] tracking-tight">${this.escapeHtml(title)}</h1>
          <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/30">Aura</span>
        </div>
        <p class="text-xs text-[#929CAF]">Gravado em ${formattedDate} • <span id="views-count">${video.viewsCount || 1}</span> visualizações</p>
      </div>
    </div>

    <div class="flex items-center space-x-2.5">
      <button onclick="copyShareLink()" class="flex items-center space-x-1.5 bg-[#78A5FF] hover:bg-[#9AB9FF] active:scale-95 text-[#101A32] px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span id="copy-btn-text">Copiar Link</span>
      </button>

      <button onclick="copyEmbedCode()" class="flex items-center space-x-1.5 bg-[#191F2B] hover:bg-[#222B39] text-[#F3F5F9] border border-[#303A4B] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
        <svg class="w-3.5 h-3.5 text-[#78A5FF]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Embed</span>
      </button>

      <a href="/video/${video.id}" download="${video.id}.webm" class="flex items-center space-x-1.5 bg-[#191F2B] hover:bg-[#222B39] text-[#F3F5F9] border border-[#303A4B] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
        <svg class="w-3.5 h-3.5 text-[#83B8FF]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Baixar</span>
      </a>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Video Player Section (Left 2 cols) -->
    <div class="lg:col-span-2 flex flex-col space-y-4">
      <div id="player-container" class="relative aspect-video bg-black rounded-2xl overflow-hidden border border-[#303A4B] shadow-2xl group flex items-center justify-center">
        <video id="main-video" class="w-full h-full object-contain cursor-pointer" playsinline preload="auto">
          <source src="/video/${video.id}" type="video/webm">
          Seu navegador não suporta a tag de vídeo.
        </video>

        <!-- Big Play Button Overlay -->
        <button id="big-play-btn" onclick="togglePlay()" class="absolute w-20 h-20 rounded-full bg-[#78A5FF] text-[#101A32] flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all hover:bg-[#9AB9FF]">
          <svg class="w-9 h-9 fill-current ml-1" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>

        <!-- Floating Emojis Container -->
        <div id="emoji-float-area" class="absolute inset-0 pointer-events-none overflow-hidden"></div>

        <!-- Custom Player Controls Bar -->
        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Timeline scrubber with reaction dots and chapter marks -->
          <div class="relative mb-3 flex items-center">
            <input type="range" id="seek-bar" min="0" max="100" value="0" step="0.1" class="w-full h-1.5 bg-[#303A4B] rounded-lg cursor-pointer appearance-none">
            <div id="timeline-chapters" class="absolute inset-x-0 pointer-events-none h-1.5 z-10"></div>
            <div id="timeline-reactions" class="absolute inset-x-0 pointer-events-none h-1.5 z-20"></div>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <button onclick="togglePlay()" id="play-pause-btn" class="text-white hover:text-[#78A5FF] p-1">
                <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>

              <span id="time-display" class="text-xs font-mono text-[#F3F5F9]">00:00 / 00:00</span>
            </div>

            <div class="flex items-center space-x-3">
              <!-- Playback Speed -->
              <button onclick="cycleSpeed()" id="speed-btn" class="text-xs font-bold bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] px-2 py-1 rounded-lg text-[#78A5FF]">1x</button>

              <!-- Fullscreen -->
              <button onclick="toggleFullscreen()" class="text-white hover:text-[#78A5FF] p-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Emoji Reactions Bar (Aura Interactive Timeline) -->
      <div class="bg-[#121722] border border-[#303A4B] rounded-2xl p-3 flex items-center justify-between shadow-md">
        <div class="flex items-center space-x-1.5">
          <span class="text-xs font-medium text-[#929CAF] mr-2">Reagir no segundo atual:</span>
          <button onclick="sendReaction('👍')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">👍</button>
          <button onclick="sendReaction('❤️')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">❤️</button>
          <button onclick="sendReaction('👏')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">👏</button>
          <button onclick="sendReaction('🎉')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">🎉</button>
          <button onclick="sendReaction('🔥')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">🔥</button>
          <button onclick="sendReaction('💡')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">💡</button>
          <button onclick="sendReaction('😂')" class="p-2 hover:bg-[#191F2B] rounded-xl text-xl hover:scale-125 transition-all">😂</button>
        </div>
      </div>

      <!-- Video Details & AI Summary Card -->
      <div class="bg-[#121722] border border-[#303A4B] rounded-2xl p-5 space-y-3">
        <div class="flex items-center space-x-2 text-[#78A5FF] text-xs font-bold uppercase tracking-wider">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Resumo Inteligente por IA</span>
        </div>
        <p class="text-sm text-[#B7C0CE] leading-relaxed">${this.escapeHtml(aiSummary)}</p>
      </div>
    </div>

    <!-- Right Sidebar: Comments, Chapters & Transcript (1 col) -->
    <div class="flex flex-col space-y-4">
      <!-- Tabs header -->
      <div class="bg-[#121722] border border-[#303A4B] rounded-2xl p-1 flex space-x-1">
        <button onclick="switchTab('comments')" id="tab-comments-btn" class="flex-1 py-2 text-xs font-bold rounded-xl bg-[#78A5FF] text-[#101A32] transition-all shadow-sm">
          Comentários (<span id="comments-count">0</span>)
        </button>
        <button onclick="switchTab('chapters')" id="tab-chapters-btn" class="flex-1 py-2 text-xs font-medium rounded-xl text-[#929CAF] hover:text-[#F3F5F9] transition-all">
          Capítulos (<span id="chapters-count">${(video.chapters || []).length}</span>)
        </button>
        <button onclick="switchTab('transcript')" id="tab-transcript-btn" class="flex-1 py-2 text-xs font-medium rounded-xl text-[#929CAF] hover:text-[#F3F5F9] transition-all">
          Transcrição
        </button>
      </div>

      <!-- Tab 1: Comments Section -->
      <div id="comments-tab" class="bg-[#121722] border border-[#303A4B] rounded-2xl p-4 flex-1 flex flex-col h-[520px]">
        <!-- Comments list -->
        <div id="comments-list" class="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
          <!-- Populated by JS -->
        </div>

        <!-- Add Comment Form -->
        <div class="pt-3 border-t border-[#303A4B] mt-2 space-y-2">
          <div class="flex items-center space-x-2">
            <input type="text" id="comment-author" placeholder="Seu nome..." value="Espectador" class="bg-[#191F2B] border border-[#303A4B] rounded-xl px-2.5 py-1 text-xs text-[#F3F5F9] placeholder-[#929CAF] focus:outline-none focus:border-[#78A5FF] w-32">
            <span class="text-xs text-[#78A5FF] font-mono font-medium" id="current-timestamp-badge">em 00:00</span>
          </div>
          <div class="flex space-x-2">
            <input type="text" id="comment-text" placeholder="Adicione seu comentário..." class="flex-1 bg-[#191F2B] border border-[#303A4B] rounded-xl px-3 py-2 text-xs text-[#F3F5F9] placeholder-[#929CAF] focus:outline-none focus:border-[#78A5FF]" onkeydown="if(event.key==='Enter') submitComment()">
            <button onclick="submitComment()" class="bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md">
              Enviar
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 2: Chapters Section -->
      <div id="chapters-tab" class="hidden bg-[#121722] border border-[#303A4B] rounded-2xl p-4 flex-1 flex flex-col h-[520px]">
        <div class="text-xs text-[#929CAF] font-medium mb-3 flex items-center justify-between">
          <span>Capítulos do Vídeo</span>
          <span class="text-[10px] text-[#78A5FF]">Clique para pular</span>
        </div>
        <div id="chapters-list" class="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
          <!-- Populated by JS -->
        </div>
      </div>

      <!-- Tab 3: Transcript Section -->
      <div id="transcript-tab" class="hidden bg-[#121722] border border-[#303A4B] rounded-2xl p-4 flex-1 flex flex-col h-[520px]">
        <div id="transcript-list" class="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>
  </main>

  <script>
    const videoId = "${video.id}";
    let comments = ${commentsJson};
    let reactions = ${reactionsJson};
    const transcript = ${transcriptJson};
    const chapters = ${chaptersJson};

    const video = document.getElementById('main-video');
    const playBtn = document.getElementById('big-play-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const seekBar = document.getElementById('seek-bar');
    const timeDisplay = document.getElementById('time-display');
    const timeBadge = document.getElementById('current-timestamp-badge');
    const speedBtn = document.getElementById('speed-btn');

    // Register view count
    fetch('/api/recordings/' + videoId + '/view', { method: 'POST' }).catch(()=>{});

    function togglePlay() {
      if (video.paused) {
        video.play();
        playBtn.classList.add('hidden');
        playPauseBtn.innerHTML = '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      } else {
        video.pause();
        playBtn.classList.remove('hidden');
        playPauseBtn.innerHTML = '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
    }

    video.addEventListener('click', togglePlay);

    function formatTime(s) {
      if (isNaN(s)) return '00:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    video.addEventListener('timeupdate', () => {
      const cur = video.currentTime;
      const dur = video.duration || 1;
      seekBar.value = (cur / dur) * 100;
      timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(dur);
      timeBadge.textContent = 'em ' + formatTime(cur);

      // Trigger floating emoji when video reaches reaction timestamp
      checkReactions(cur);
    });

    seekBar.addEventListener('input', (e) => {
      const dur = video.duration || 1;
      video.currentTime = (e.target.value / 100) * dur;
    });

    const speeds = [1, 1.25, 1.5, 2];
    let curSpeedIdx = 0;
    function cycleSpeed() {
      curSpeedIdx = (curSpeedIdx + 1) % speeds.length;
      video.playbackRate = speeds[curSpeedIdx];
      speedBtn.textContent = speeds[curSpeedIdx] + 'x';
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.getElementById('player-container').requestFullscreen().catch(()=>{});
      } else {
        document.exitFullscreen().catch(()=>{});
      }
    }

    // Reaction system
    let lastReactionTime = -1;
    function checkReactions(time) {
      if (Math.abs(time - lastReactionTime) < 0.5) return;
      reactions.forEach(r => {
        if (Math.abs(r.time - time) < 0.4) {
          spawnFloatingEmoji(r.emoji);
        }
      });
      lastReactionTime = time;
    }

    function spawnFloatingEmoji(emoji) {
      const area = document.getElementById('emoji-float-area');
      const el = document.createElement('div');
      el.className = 'floating-emoji';
      el.textContent = emoji;
      el.style.left = (20 + Math.random() * 60) + '%';
      el.style.bottom = '20px';
      area.appendChild(el);
      setTimeout(() => el.remove(), 1800);
    }

    async function sendReaction(emoji) {
      const cur = Math.round(video.currentTime * 10) / 10;
      spawnFloatingEmoji(emoji);

      try {
        const res = await fetch('/api/recordings/' + videoId + '/reaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji, time: cur })
        });
        const data = await res.json();
        if (data.reaction) {
          reactions.push(data.reaction);
          renderTimelineReactions();
        }
      } catch (e) {}
    }

    function renderTimelineReactions() {
      const container = document.getElementById('timeline-reactions');
      container.innerHTML = '';
      const dur = video.duration || 1;
      reactions.forEach(r => {
        const pct = (r.time / dur) * 100;
        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.left = pct + '%';
        dot.style.top = '-2px';
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = '#ff5b4f';
        container.appendChild(dot);
      });
    }

    // Comments system
    function renderComments() {
      const list = document.getElementById('comments-list');
      document.getElementById('comments-count').textContent = comments.length;
      if (comments.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-gray-500 text-xs">Nenhum comentário ainda.<br>Seja o primeiro a comentar!</div>';
        return;
      }
      list.innerHTML = comments.map(c => \`
        <div class="bg-gray-800/40 border border-gray-700/40 p-2.5 rounded-xl space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-xs text-white">\${escapeText(c.author)}</span>
            <button onclick="video.currentTime = \${c.time}; video.play();" class="text-xs font-mono text-[#625df5] hover:underline font-medium">
              \${formatTime(c.time)}
            </button>
          </div>
          <p class="text-xs text-gray-300">\${escapeText(c.text)}</p>
        </div>
      \`).join('');
    }

    async function submitComment() {
      const author = document.getElementById('comment-author').value || 'Espectador';
      const text = document.getElementById('comment-text').value;
      if (!text.trim()) return;

      const time = Math.round(video.currentTime * 10) / 10;
      try {
        const res = await fetch('/api/recordings/' + videoId + '/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author, text, time })
        });
        const data = await res.json();
        if (data.comment) {
          comments.push(data.comment);
          document.getElementById('comment-text').value = '';
          renderComments();
        }
      } catch (e) {}
    }

    function renderTranscript() {
      const list = document.getElementById('transcript-list');
      if (transcript.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-gray-500 text-xs">Nenhuma transcrição de áudio detectada nesta gravação.</div>';
        return;
      }
      list.innerHTML = transcript.map(t => \`
        <div onclick="video.currentTime = \${t.time}; video.play();" class="p-2 hover:bg-gray-800/60 rounded-xl cursor-pointer transition-colors flex space-x-2">
          <span class="font-mono text-indigo-400 font-bold">\${formatTime(t.time)}</span>
          <span class="text-gray-300">\${escapeText(t.text)}</span>
        </div>
      \`).join('');
    }

    function renderChapters() {
      const container = document.getElementById('chapters-list');
      if (!container) return;
      if (!chapters || chapters.length === 0) {
        container.innerHTML = '<p class="text-slate-500 italic p-3 text-center">Nenhum capítulo salvo para esta gravação.</p>';
        return;
      }
      container.innerHTML = chapters.map(c => \`
        <div onclick="jumpToChapter(\${c.time})" class="chapter-card p-3 rounded-xl border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-800/60 cursor-pointer flex items-center space-x-3 transition-all group">
          <span class="font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2.5 py-1 rounded-lg text-xs shrink-0 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors">
            \${formatTime(c.time)}
          </span>
          <span class="text-slate-200 font-semibold text-xs flex-1 truncate">\${escapeText(c.title)}</span>
          <svg class="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      \`).join('');
    }

    function renderTimelineChapters() {
      const container = document.getElementById('timeline-chapters');
      if (!container) return;
      container.innerHTML = '';
      const dur = video.duration || 1;
      chapters.forEach(c => {
        const pct = (c.time / dur) * 100;
        const tick = document.createElement('div');
        tick.style.position = 'absolute';
        tick.style.left = pct + '%';
        tick.style.top = '-3px';
        tick.style.width = '3px';
        tick.style.height = '12px';
        tick.style.borderRadius = '2px';
        tick.style.backgroundColor = '#F2B66D';
        tick.title = c.title + ' (' + formatTime(c.time) + ')';
        tick.style.pointerEvents = 'auto';
        tick.style.cursor = 'pointer';
        tick.onclick = (e) => {
          e.stopPropagation();
          jumpToChapter(c.time);
        };
        container.appendChild(tick);
      });
    }

    function jumpToChapter(time) {
      video.currentTime = time;
      video.play();
      playBtn.classList.add('hidden');
      playPauseBtn.innerHTML = '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }

    function switchTab(tab) {
      const cTab = document.getElementById('comments-tab');
      const chTab = document.getElementById('chapters-tab');
      const tTab = document.getElementById('transcript-tab');
      const cBtn = document.getElementById('tab-comments-btn');
      const chBtn = document.getElementById('tab-chapters-btn');
      const tBtn = document.getElementById('tab-transcript-btn');

      cTab.classList.add('hidden');
      chTab.classList.add('hidden');
      tTab.classList.add('hidden');
      cBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all';
      chBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all';
      tBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all';

      const activeStyle = 'flex-1 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white transition-all shadow-sm';

      if (tab === 'comments') {
        cTab.classList.remove('hidden');
        cBtn.className = activeStyle;
      } else if (tab === 'chapters') {
        chTab.classList.remove('hidden');
        chBtn.className = activeStyle;
      } else if (tab === 'transcript') {
        tTab.classList.remove('hidden');
        tBtn.className = activeStyle;
      }
    }

    function copyShareLink() {
      navigator.clipboard.writeText(window.location.href);
      const btn = document.getElementById('copy-btn-text');
      btn.textContent = 'Link Copiado!';
      setTimeout(() => btn.textContent = 'Copiar Link', 2000);
    }

    function copyEmbedCode() {
      const embedHtml = '<iframe src="' + window.location.href + '" width="640" height="360" frameborder="0" allowfullscreen></iframe>';
      navigator.clipboard.writeText(embedHtml);
      alert('Código embed copiado para a área de transferência!');
    }

    function escapeText(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    // Init
    renderComments();
    renderChapters();
    renderTranscript();
    video.addEventListener('loadedmetadata', () => {
      renderTimelineReactions();
      renderTimelineChapters();
    });
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private renderDashboard(res: http.ServerResponse) {
    const list = this.getMetadata();

    const itemsHtml = list.map(v => `
      <div class="bg-[#121722] border border-[#303A4B] rounded-2xl p-4 flex flex-col justify-between hover:border-[#78A5FF]/50 transition-all shadow-lg group">
        <div>
          <div class="aspect-video bg-black rounded-xl overflow-hidden mb-3 relative flex items-center justify-center">
            <video src="/video/${v.id}#t=0.5" class="w-full h-full object-cover"></video>
            <div class="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-all flex items-center justify-center">
              <a href="/share/${v.id}" class="w-12 h-12 rounded-full bg-[#78A5FF] text-[#101A32] flex items-center justify-center shadow-lg group-hover:scale-110 transition-all hover:bg-[#9AB9FF]">
                <svg class="w-6 h-6 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </a>
            </div>
          </div>
          <h3 class="text-sm font-semibold text-[#F3F5F9] truncate">${this.escapeHtml(v.title)}</h3>
          <p class="text-xs text-[#929CAF] mt-1">${new Date(v.createdAt).toLocaleDateString('pt-BR')} • ${(v.durationMs / 1000).toFixed(0)}s • ${v.viewsCount || 0} visualizações</p>
        </div>
        <div class="mt-4 pt-3 border-t border-[#303A4B] flex items-center justify-between">
          <a href="/share/${v.id}" class="text-xs font-bold text-[#78A5FF] hover:text-[#9AB9FF]">Assistir Vídeo →</a>
          <button onclick="navigator.clipboard.writeText(window.location.origin + '/share/${v.id}'); alert('Link copiado!')" class="text-xs text-[#929CAF] hover:text-[#F3F5F9]">Copiar Link</button>
        </div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Aura Screen Studio — Galeria de Vídeos</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #0B0E14; color: #F3F5F9; }</style>
</head>
<body class="min-h-screen p-8 selection:bg-[#1A2A47] selection:text-[#78A5FF]">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="flex items-center space-x-3 border-b border-[#303A4B] pb-5">
      <div class="w-11 h-11 rounded-2xl bg-[#191F2B] border border-[#303A4B] p-0.5 shadow-lg flex items-center justify-center">
        <svg class="w-6 h-6 text-[#78A5FF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" stroke="#78A5FF" />
          <circle cx="12" cy="12" r="3.5" fill="#FF647C" />
        </svg>
      </div>
      <div>
        <h1 class="text-xl font-bold text-[#F3F5F9] tracking-tight">Aura Screen Studio Hub</h1>
        <p class="text-xs text-[#929CAF]">Vídeos gravados com Aura Screen Studio disponíveis para reprodução e download</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      ${itemsHtml || '<div class="col-span-full py-16 text-center text-[#929CAF] text-sm">Nenhum vídeo gravado ainda. Inicie sua primeira gravação com o Aura Screen Studio!</div>'}
    </div>
  </div>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private handleLiveStream(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    this.activeLiveClients.add(res);
    this.notifyViewersChanged();

    if (this.latestLiveJpeg && !this.isLivePaused) {
      try {
        this.writeFrameToClient(res, this.latestLiveJpeg);
      } catch (e) {}
    }

    const cleanup = () => {
      this.activeLiveClients.delete(res);
      this.notifyViewersChanged();
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    res.on('error', cleanup);
  }

  private handleLiveEvents(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'init', status: this.getLiveStatus() })}\n\n`);

    this.liveEventClients.add(res);

    const cleanup = () => {
      this.liveEventClients.delete(res);
    };

    req.on('close', cleanup);
    res.on('error', cleanup);
  }

  private handleLiveReactionPost(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isLive) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Transmissão ao vivo está offline.' }));
      return;
    }

    let body = '';
    let totalLen = 0;
    req.on('data', (chunk) => {
      totalLen += chunk.length;
      if (totalLen > 1024) {
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
          res.end(JSON.stringify({ error: 'Payload de reação excede o limite.' }));
        }
        req.resume();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (totalLen > 1024) return;
      try {
        const data = JSON.parse(body);
        const emoji = typeof data.emoji === 'string' && data.emoji.trim().length <= 8 ? data.emoji.trim() : '👍';
        const author = typeof data.author === 'string' ? data.author.trim().slice(0, 40) : 'Espectador';
        const item = { emoji: this.escapeHtml(emoji), author: this.escapeHtml(author), time: Date.now() };

        this.broadcastLiveEvent({ type: 'reaction', ...item });
        if (this.onLiveReaction) {
          this.onLiveReaction(item);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      } catch (e) {}
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid reaction payload' }));
    });
  }

  private handleLiveQuestionPost(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isLive) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Transmissão ao vivo está offline.' }));
      return;
    }

    let body = '';
    let totalLen = 0;
    req.on('data', (chunk) => {
      totalLen += chunk.length;
      if (totalLen > 2048) {
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
          res.end(JSON.stringify({ error: 'Payload de pergunta excede o limite.' }));
        }
        req.resume();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (totalLen > 2048) return;
      try {
        const data = JSON.parse(body);
        const text = typeof data.text === 'string' ? data.text.trim().slice(0, 300) : '';
        const author = typeof data.author === 'string' ? data.author.trim().slice(0, 40) : 'Espectador';
        if (text) {
          const item = { text: this.escapeHtml(text), author: this.escapeHtml(author), time: Date.now() };
          this.broadcastLiveEvent({ type: 'question', ...item });
          if (this.onLiveQuestion) {
            this.onLiveQuestion(item);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      } catch (e) {}
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid question payload' }));
    });
  }

  private renderLiveViewer(req: http.IncomingMessage, res: http.ServerResponse) {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Aura Screen Studio — Transmissão ao Vivo (60 FPS Ultra HD)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes floatUp {
      0% { transform: translateY(0) scale(0.7); opacity: 1; }
      100% { transform: translateY(-160px) scale(1.4); opacity: 0; }
    }
    .floating-reaction {
      position: absolute;
      pointer-events: none;
      font-size: 2.2rem;
      animation: floatUp 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      z-index: 50;
    }
  </style>
</head>
<body class="bg-[#0B0E14] text-[#F3F5F9] min-h-screen flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-[#1A2A47] selection:text-[#78A5FF]">
  <header class="border-b border-[#303A4B] bg-[#121722]/90 backdrop-blur-md px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
    <div class="flex items-center space-x-3">
      <div class="w-8 h-8 rounded-xl bg-[#191F2B] border border-[#303A4B] flex items-center justify-center shadow-lg">
        <svg class="w-4 h-4 text-[#78A5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
          <circle cx="12" cy="12" r="3.5" fill="#FF647C" />
        </svg>
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-sm font-bold text-[#F3F5F9] tracking-tight" id="liveTitle">${this.escapeHtml(this.liveTitle)}</h1>
          <span id="liveBadge" class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${this.isLive ? (this.isLivePaused ? 'bg-[#F2B66D]/20 text-[#F2B66D] border border-[#F2B66D]/40' : 'bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/40') : 'bg-[#191F2B] text-[#929CAF] border border-[#303A4B]'}">
            <span class="w-1.5 h-1.5 rounded-full ${this.isLive ? (this.isLivePaused ? 'bg-[#F2B66D]' : 'bg-[#78A5FF] animate-ping') : 'bg-[#929CAF]'}"></span>
            <span>${this.isLive ? (this.isLivePaused ? 'PAUSADO' : 'AO VIVO 60 FPS') : 'OFFLINE'}</span>
          </span>
        </div>
        <p class="text-[11px] text-[#929CAF]">Transmissão em tempo real fluida em 60 FPS via Aura Screen Studio</p>
      </div>
    </div>

    <!-- Transport Mode Switcher Tabs -->
    <div class="flex items-center space-x-2">
      <div class="flex items-center bg-[#191F2B] border border-[#303A4B] p-0.5 rounded-xl text-xs">
        <button
          id="tabModeMjpeg"
          onclick="switchTransport('mjpeg')"
          class="px-2.5 py-1 rounded-lg font-semibold transition-all bg-[#1A2A47] text-[#78A5FF] shadow-sm"
          title="Transporte padrão de alta compatibilidade"
        >
          Padrão (MJPEG)
        </button>
        <button
          id="tabModeMse"
          onclick="switchTransport('mse')"
          class="px-2.5 py-1 rounded-lg font-semibold transition-all text-[#929CAF] hover:text-[#F3F5F9]"
          title="Transporte experimental de ultra-baixo consumo com áudio via WebSocket"
        >
          Experimental (MSE + Áudio)
        </button>
      </div>

      <!-- Audio Mute/Unmute Toggle (Visible in MSE mode) -->
      <button
        id="audioToggleBtn"
        onclick="toggleAudio()"
        class="hidden items-center space-x-1 bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] px-2.5 py-1 rounded-xl text-xs text-[#78A5FF] transition-all"
        title="Ativar/Desativar Áudio"
      >
        <span id="audioIcon">🔇</span>
        <span id="audioLabel">Ativar Som</span>
      </button>

      <div class="flex items-center space-x-1.5 bg-[#191F2B] border border-[#303A4B] px-2.5 py-1 rounded-lg text-xs text-[#B7C0CE]">
        <svg class="w-3.5 h-3.5 text-[#78A5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span id="viewerCount" class="font-bold text-[#F3F5F9]">${this.getLiveViewersCount()}</span>
        <span class="hidden sm:inline text-[#929CAF]">assistindo</span>
      </div>

      <div class="hidden sm:flex items-center space-x-1.5 bg-[#191F2B] border border-[#303A4B] px-2.5 py-1 rounded-lg text-xs text-[#B7C0CE] font-mono">
        <span class="text-[#929CAF]">Duração:</span>
        <span id="uptimeDisplay" class="font-bold text-[#78A5FF]">00:00</span>
      </div>

      <button id="fullscreenBtn" class="p-1.5 rounded-lg bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9] transition-colors" title="Tela Cheia (F)">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </div>
  </header>

  <main class="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 relative overflow-hidden">
    <div id="videoContainer" class="relative w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden border border-[#303A4B] shadow-2xl flex items-center justify-center group">
      
      <!-- MJPEG Player -->
      <img id="streamImg" src="" alt="Compartilhamento de Tela" class="w-full h-full object-contain select-none" />

      <!-- MSE Player (MediaSource + Audio) -->
      <video id="liveVideo" autoplay playsinline muted class="hidden w-full h-full object-contain"></video>

      <!-- Active Transport Badge Overlay -->
      <div id="transportBadge" class="absolute top-3 left-3 bg-[#0B0E14]/80 backdrop-blur border border-[#303A4B] px-2.5 py-1 rounded-xl text-[11px] text-[#B7C0CE] flex items-center space-x-1.5 z-20 pointer-events-none">
        <span class="w-2 h-2 rounded-full bg-[#78A5FF]"></span>
        <span id="transportBadgeText">Modo: MJPEG Padrão</span>
      </div>

      <div id="pausedOverlay" class="${this.isLive && this.isLivePaused ? '' : 'hidden'} absolute inset-0 bg-[#0B0E14]/90 backdrop-blur-md flex flex-col items-center justify-center z-20 text-center p-6 transition-all duration-300">
        <div class="w-16 h-16 rounded-2xl bg-[#F2B66D]/20 border border-[#F2B66D]/40 flex items-center justify-center text-[#F2B66D] mb-4 animate-pulse shadow-lg shadow-[#F2B66D]/10">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-[#F3F5F9] mb-1.5">Compartilhamento de Tela Pausado</h2>
        <p class="text-[#929CAF] text-sm max-w-sm">O apresentador pausou temporariamente a exibição da tela. A transmissão continuará em instantes.</p>
      </div>

      <div id="offlineOverlay" class="${this.isLive ? 'hidden' : ''} absolute inset-0 bg-[#0B0E14]/95 backdrop-blur-md flex flex-col items-center justify-center z-20 text-center p-6 transition-all duration-300">
        <div class="w-16 h-16 rounded-2xl bg-[#1A2A47] border border-[#78A5FF]/40 flex items-center justify-center text-[#78A5FF] mb-4 shadow-lg shadow-[#78A5FF]/10">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-[#F3F5F9] mb-1.5">Aguardando Início da Transmissão</h2>
        <p class="text-[#929CAF] text-sm max-w-sm">O apresentador ainda não iniciou a transmissão. Esta tela se conectará automaticamente assim que a live começar.</p>
      </div>

      <div id="reactionsLayer" class="absolute inset-0 pointer-events-none overflow-hidden z-30"></div>
    </div>
  </main>

  <footer class="border-t border-[#303A4B] bg-[#121722]/90 backdrop-blur-md px-4 py-3 sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center space-x-2">
      <span class="text-xs text-[#929CAF] hidden sm:inline">Reações ao vivo:</span>
      <div class="flex items-center space-x-1.5 bg-[#191F2B] p-1 rounded-xl border border-[#303A4B]">
        <button onclick="sendReaction('👏')" class="px-2.5 py-1 rounded-lg hover:bg-[#222B39] active:scale-95 transition-all text-base" title="Aplaudir">👏</button>
        <button onclick="sendReaction('❤️')" class="px-2.5 py-1 rounded-lg hover:bg-[#222B39] active:scale-95 transition-all text-base" title="Amei">❤️</button>
        <button onclick="sendReaction('👍')" class="px-2.5 py-1 rounded-lg hover:bg-[#222B39] active:scale-95 transition-all text-base" title="Gostei">👍</button>
        <button onclick="sendReaction('🔥')" class="px-2.5 py-1 rounded-lg hover:bg-[#222B39] active:scale-95 transition-all text-base" title="Incrível">🔥</button>
        <button onclick="sendReaction('💡')" class="px-2.5 py-1 rounded-lg hover:bg-[#222B39] active:scale-95 transition-all text-base" title="Ideia">💡</button>
        <button onclick="sendReaction('❓')" class="px-2.5 py-1 rounded-lg hover:bg-[#222B39] active:scale-95 transition-all text-base" title="Dúvida">❓</button>
      </div>
    </div>

    <form id="questionForm" onsubmit="submitQuestion(event)" class="flex items-center space-x-2 w-full sm:w-auto">
      <input
        type="text"
        id="questionInput"
        placeholder="Fazer pergunta ao apresentador..."
        class="bg-[#191F2B] border border-[#303A4B] focus:border-[#78A5FF] rounded-xl px-3 py-1.5 text-xs text-[#F3F5F9] placeholder-[#929CAF] outline-none w-full sm:w-72 transition-colors"
      />
      <button type="submit" class="bg-[#78A5FF] hover:bg-[#9AB9FF] active:scale-95 text-[#101A32] font-bold px-3 py-1.5 rounded-xl text-xs transition-all shrink-0">
        Enviar
      </button>
    </form>
  </footer>

  <script>
    let currentMode = 'mjpeg';
    let uptimeSeconds = 0;
    setInterval(() => {
      uptimeSeconds++;
      const m = Math.floor(uptimeSeconds / 60).toString().padStart(2, '0');
      const s = (uptimeSeconds % 60).toString().padStart(2, '0');
      document.getElementById('uptimeDisplay').textContent = m + ':' + s;
    }, 1000);

    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      const el = document.getElementById('videoContainer');
      if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    const streamImg = document.getElementById('streamImg');
    const liveVideo = document.getElementById('liveVideo');
    const transportBadgeText = document.getElementById('transportBadgeText');
    const audioToggleBtn = document.getElementById('audioToggleBtn');
    const audioIcon = document.getElementById('audioIcon');
    const audioLabel = document.getElementById('audioLabel');

    streamImg.onerror = () => {
      setTimeout(() => {
        if (currentMode === 'mjpeg') {
          streamImg.src = '/live/stream?t=' + Date.now();
        }
      }, 2000);
    };

    // MSE Pipeline Variables
    let mseWs = null;
    let mediaSource = null;
    let sourceBuffer = null;
    let mseQueue = [];
    let isAppending = false;
    let reconnectTimeout = null;

    function switchTransport(mode) {
      if (currentMode === mode && (mode === 'mjpeg' ? !streamImg.classList.contains('hidden') : mseWs)) return;
      currentMode = mode;
      const tabMjpeg = document.getElementById('tabModeMjpeg');
      const tabMse = document.getElementById('tabModeMse');

      if (mode === 'mjpeg') {
        tabMjpeg.className = 'px-2.5 py-1 rounded-lg font-semibold transition-all bg-[#1A2A47] text-[#78A5FF] shadow-sm';
        tabMse.className = 'px-2.5 py-1 rounded-lg font-semibold transition-all text-[#929CAF] hover:text-[#F3F5F9]';
        transportBadgeText.textContent = 'Modo: MJPEG Padrão';
        audioToggleBtn.classList.add('hidden');
        audioToggleBtn.classList.remove('flex');

        // Stop MSE
        cleanupMse();
        liveVideo.classList.add('hidden');
        liveVideo.pause();
        streamImg.classList.remove('hidden');
        streamImg.src = '/live/stream?t=' + Date.now();
      } else if (mode === 'mse') {
        if (!window.MediaSource) {
          console.warn('MediaSource Extensions (MSE) não é suportado pelo seu navegador. Revertendo para MJPEG.');
          switchTransport('mjpeg');
          return;
        }

        tabMse.className = 'px-2.5 py-1 rounded-lg font-semibold transition-all bg-[#1A2A47] text-[#78A5FF] shadow-sm';
        tabMjpeg.className = 'px-2.5 py-1 rounded-lg font-semibold transition-all text-[#929CAF] hover:text-[#F3F5F9]';
        transportBadgeText.textContent = 'Modo: MSE Beta (Vídeo + Áudio)';
        audioToggleBtn.classList.remove('hidden');
        audioToggleBtn.classList.add('flex');

        streamImg.src = '';
        streamImg.classList.add('hidden');
        liveVideo.classList.remove('hidden');
        initMse();
      }
    }

    function toggleAudio() {
      if (!liveVideo) return;
      liveVideo.muted = !liveVideo.muted;
      if (liveVideo.muted) {
        audioIcon.textContent = '🔇';
        audioLabel.textContent = 'Ativar Som';
      } else {
        audioIcon.textContent = '🔊';
        audioLabel.textContent = 'Som Ativo';
        liveVideo.play().catch(() => {});
      }
    }

    // Serialized MediaSource Operation Queue
    let mseOpQueue = [];
    let isProcessingOp = false;
    let evictionTimer = null;

    function cleanupMse() {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (evictionTimer) {
        clearInterval(evictionTimer);
        evictionTimer = null;
      }
      if (mseWs) {
        try {
          mseWs.onopen = null;
          mseWs.onmessage = null;
          mseWs.onerror = null;
          mseWs.onclose = null;
          mseWs.close();
        } catch(e) {}
        mseWs = null;
      }
      if (sourceBuffer) {
        try { sourceBuffer.abort(); } catch(e) {}
        sourceBuffer = null;
      }
      if (mediaSource && mediaSource.readyState === 'open') {
        try { mediaSource.endOfStream(); } catch(e) {}
      }
      mediaSource = null;
      mseOpQueue = [];
      isProcessingOp = false;
    }

    function initMse() {
      console.log('[Live Viewer] initMse called');
      cleanupMse();
      try {
        mediaSource = new MediaSource();
        liveVideo.muted = true;
        liveVideo.defaultMuted = true;
        liveVideo.playsInline = true;
        liveVideo.src = URL.createObjectURL(mediaSource);

        mediaSource.addEventListener('sourceopen', () => {
          console.log('[Live Viewer] MediaSource sourceopen event');
          try {
            const mime = 'video/webm; codecs="vp8, opus"';
            const chosenMime = MediaSource.isTypeSupported(mime) ? mime : 'video/webm';
            sourceBuffer = mediaSource.addSourceBuffer(chosenMime);
            try {
              sourceBuffer.mode = 'sequence';
            } catch (e) {
              // Mode sequence may not be supported for WebM in Chromium; default segments mode is used
            }

            sourceBuffer.addEventListener('error', (ev) => {
              console.error('[Live Viewer] sourceBuffer error event:', ev);
            });

            sourceBuffer.addEventListener('updateend', () => {
              isProcessingOp = false;
              if (sourceBuffer && sourceBuffer.buffered && sourceBuffer.buffered.length > 0) {
                const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
                const start = sourceBuffer.buffered.start(sourceBuffer.buffered.length - 1);
                const duration = end - start;
                // Align playhead with start of buffer (keyframe) to guarantee continuous playback without underrun
                if (liveVideo.currentTime < start) {
                  liveVideo.currentTime = start;
                }
              }
              if (liveVideo.paused && liveVideo.readyState >= 2) {
                liveVideo.play().catch(() => {});
              }
              drainMseQueue();
            });

            // Auto-play on canplay, seeked, and loadeddata
            const attemptPlay = () => {
              if (liveVideo.paused && liveVideo.readyState >= 2) {
                liveVideo.play().catch(() => {});
              }
            };
            liveVideo.addEventListener('canplay', attemptPlay);
            liveVideo.addEventListener('seeked', attemptPlay);
            liveVideo.addEventListener('loadeddata', attemptPlay);

            // Continuous frame presentation listener via requestVideoFrameCallback
            let presentedCounter = 0;
            function onVideoFramePresented(now, metadata) {
              presentedCounter++;
              if (window.__mseStats) {
                window.__mseStats.framesPresented = presentedCounter;
                window.__mseStats.lastPresentationTime = metadata.presentationTime;
              }
              if (typeof liveVideo.requestVideoFrameCallback === 'function') {
                liveVideo.requestVideoFrameCallback(onVideoFramePresented);
              }
            }
            if (typeof liveVideo.requestVideoFrameCallback === 'function') {
              liveVideo.requestVideoFrameCallback(onVideoFramePresented);
            }

            // Periodic buffer eviction to keep memory controlled, safely serialized
            evictionTimer = setInterval(queueMseEviction, 5000);
            drainMseQueue();
          } catch (err) {
            console.error('[Live Viewer] Failed to create SourceBuffer:', err);
            switchTransport('mjpeg');
            return;
          }
        });
      } catch (err) {
        console.error('[Live Viewer] Error in MediaSource setup:', err);
      }

      connectMseWebSocket();
    }

    function queueMseAppend(chunk) {
      mseOpQueue.push({ type: 'append', data: chunk });
      drainMseQueue();
    }

    function queueMseEviction() {
      if (!sourceBuffer || !liveVideo) return;
      // Protected: do not evict if currentTime <= 10 seconds
      if (liveVideo.currentTime <= 10) return;
      if (!sourceBuffer.buffered || sourceBuffer.buffered.length === 0) return;

      const removeEnd = liveVideo.currentTime - 10;
      const rangeStart = sourceBuffer.buffered.start(0);

      // Only evict if range permits and there is content before removeEnd
      if (rangeStart < removeEnd - 0.5) {
        mseOpQueue.push({ type: 'remove', start: rangeStart, end: removeEnd });
        drainMseQueue();
      }
    }

    function drainMseQueue() {
      if (isProcessingOp || !sourceBuffer || sourceBuffer.updating || mseOpQueue.length === 0) {
        return;
      }
      if (!mediaSource || mediaSource.readyState !== 'open') {
        return;
      }

      const op = mseOpQueue.shift();
      if (!op) return;

      isProcessingOp = true;
      try {
        if (op.type === 'append') {
          sourceBuffer.appendBuffer(op.data);
          if (liveVideo.paused && liveVideo.readyState >= 2) {
            liveVideo.play().catch(() => {});
          }
        } else if (op.type === 'remove') {
          if (sourceBuffer.buffered && sourceBuffer.buffered.length > 0 && op.start < op.end) {
            sourceBuffer.remove(op.start, op.end);
          } else {
            isProcessingOp = false;
            drainMseQueue();
          }
        }
      } catch (err) {
        console.warn('[MSE Queue] Operation failed:', op.type, err ? (err.name + ': ' + err.message) : err);
        isProcessingOp = false;
        drainMseQueue();
      }
    }

    function connectMseWebSocket() {
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = wsProtocol + '//' + location.host + '/ws/mse';
      console.log('[Live Viewer MSE] Connecting WebSocket to:', wsUrl);
      try {
        mseWs = new WebSocket(wsUrl);
        mseWs.binaryType = 'arraybuffer';
      } catch (err) {
        console.error('[Live Viewer MSE] WebSocket construction failed:', err);
        return;
      }

      window.__mseStats = window.__mseStats || {
        connected: false,
        initMetaReceived: false,
        segmentsReceived: 0,
        bytesReceived: 0,
        framesPresented: 0,
        lastPresentationTime: 0,
        closed: false
      };

      mseWs.onopen = () => {
        console.log('[Live Viewer MSE] WebSocket opened!');
        window.__mseStats.connected = true;
        transportBadgeText.textContent = 'Modo: MSE Conectado (WebM + Áudio)';
      };

      mseWs.onmessage = (evt) => {
        console.log('[Live Viewer MSE] WebSocket message received:', typeof evt.data === 'string' ? evt.data : ('Buffer(' + evt.data.byteLength + ')'));
        if (typeof evt.data === 'string') {
          try {
            const meta = JSON.parse(evt.data);
            if (meta.type === 'init-meta') {
              window.__mseStats.initMetaReceived = true;
              transportBadgeText.textContent = 'Modo: MSE Sincronizando Init...';
            }
          } catch(e) {}
        } else if (evt.data instanceof ArrayBuffer) {
          const u8 = new Uint8Array(evt.data);
          if (u8.length >= 4 && u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) {
            window.__mseStats.initMetaReceived = true;
          }
          window.__mseStats.segmentsReceived++;
          window.__mseStats.bytesReceived += evt.data.byteLength;
          queueMseAppend(evt.data);
        }
      };

      mseWs.onclose = (evt) => {
        console.log('[Live Viewer MSE] WebSocket closed, code:', evt.code, evt.reason);
        window.__mseStats.closed = true;
        if (currentMode === 'mse') {
          transportBadgeText.textContent = 'MSE Desconectado — Reconectando...';
          cleanupMse();
          reconnectTimeout = setTimeout(() => {
            initMse();
          }, 1500);
        }
      };

      mseWs.onerror = (err) => {
        console.warn('[Live Viewer MSE] WebSocket error:', err);
      };
    }

    function spawnParticle(emoji) {
      const layer = document.getElementById('reactionsLayer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'floating-reaction';
      el.textContent = emoji;
      el.style.left = (Math.random() * 70 + 15) + '%';
      el.style.bottom = '20px';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }

    function sendReaction(emoji) {
      spawnParticle(emoji);
      fetch('/api/live/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      }).catch(() => {});
    }

    function submitQuestion(e) {
      e.preventDefault();
      const input = document.getElementById('questionInput');
      const val = input.value.trim();
      if (!val) return;
      fetch('/api/live/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: val })
      }).then(() => {
        input.value = '';
        input.placeholder = 'Pergunta enviada!';
        setTimeout(() => { input.placeholder = 'Fazer pergunta ao apresentador...'; }, 3000);
      }).catch(() => {});
    }

    function connectEvents() {
      const evtSource = new EventSource('/api/live/events');
      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'init' || data.type === 'status') {
            const status = data.status || data;
            const pausedOverlay = document.getElementById('pausedOverlay');
            const offlineOverlay = document.getElementById('offlineOverlay');
            const liveBadge = document.getElementById('liveBadge');

            if (!status.isLive) {
              offlineOverlay.classList.remove('hidden');
              pausedOverlay.classList.add('hidden');
              liveBadge.innerHTML = '<span>OFFLINE</span>';
              liveBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700';
            } else if (status.isPaused) {
              pausedOverlay.classList.remove('hidden');
              offlineOverlay.classList.add('hidden');
              liveBadge.innerHTML = '<span>PAUSADO</span>';
              liveBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40';
            } else {
              pausedOverlay.classList.add('hidden');
              offlineOverlay.classList.add('hidden');
              liveBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1"></span><span>AO VIVO</span>';
              liveBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
            }

            if (status.transportMode && status.transportMode !== currentMode) {
              console.log('[Live Viewer] Host transport mode is:', status.transportMode);
              switchTransport(status.transportMode);
            }
          } else if (data.type === 'viewers') {
            document.getElementById('viewerCount').textContent = data.count;
          } else if (data.type === 'reaction') {
            spawnParticle(data.emoji);
          } else if (data.type === 'transport-mode') {
            console.log('[Live Viewer] Server transport mode changed:', data.mode);
            if (data.mode && data.mode !== currentMode) {
              switchTransport(data.mode);
            }
          }
        } catch (err) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectEvents, 3000);
      };
    }
    if (currentMode === 'mjpeg') {
      streamImg.src = '/live/stream';
    }
    setTimeout(connectEvents, 50);
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

