import { execFile } from 'node:child_process'
import type { PreviewProvider } from '@filejam/plugin-api'

function run(executable: string, args: string[], signal: AbortSignal) {
  return new Promise<Buffer>((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        signal,
        timeout: 20000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        encoding: 'buffer',
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    )
  })
}

const provider: PreviewProvider = {
  async generate(request, { executables, signal }) {
    const probe = JSON.parse(
      (
        await run(
          executables.ffprobe,
          [
            '-v',
            'error',
            '-protocol_whitelist',
            'file,pipe',
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            request.source.path,
          ],
          signal,
        )
      ).toString(),
    ) as {
      streams?: {
        index: number
        codec_type?: string
        duration?: string
        nb_frames?: string
        disposition?: { attached_pic?: number; default?: number }
      }[]
      format?: { duration?: string }
    }

    const streams =
      probe.streams?.filter(
        (s) => s.codec_type === 'video' && !s.disposition?.attached_pic,
      ) ?? []

    const stream = streams.find((s) => s.disposition?.default) ?? streams[0]

    if (!stream) {
      return { status: 'unsupported' }
    }

    const streamDuration = Number(stream.duration)

    const duration =
      Number.isFinite(streamDuration) && streamDuration > 0
        ? streamDuration
        : Number(probe.format?.duration)

    if (!Number.isFinite(duration) || duration <= 0) {
      return { status: 'error', message: 'Video duration is unavailable' }
    }

    const timestamp = stream.nb_frames === '1' ? 0 : duration / 3

    const bytes = await run(
      executables.ffmpeg,
      [
        '-v',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-threads',
        '1',
        '-ss',
        String(timestamp),
        '-i',
        request.source.path,
        '-map',
        `0:${stream.index}`,
        '-frames:v',
        '1',
        '-an',
        '-sn',
        '-dn',
        '-vf',
        `scale=w='max(1,round(min(${request.width},${request.height}*dar)))':h='max(1,round(min(${request.height},${request.width}/dar)))',setsar=1`,
        '-threads',
        '1',
        '-c:v',
        'png',
        '-f',
        'image2pipe',
        'pipe:1',
      ],
      signal,
    )

    if (!bytes.length) {
      return { status: 'error', message: 'No frame at requested timestamp' }
    }

    return {
      status: 'success',
      bytes,
      mimeType: 'image/png',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      metadata: { timestamp, duration },
    }
  },
}

export default provider
