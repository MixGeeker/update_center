import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'fs'
import { join, normalize, resolve, sep } from 'path'
import { resolveUpdateStoragePaths } from '../updates/update-paths'
import type { DownloadPlatform, LatestDownloadsResponse, PlatformLatestInfo } from './downloads.types'

type AutoPlatform = DownloadPlatform | 'auto'

const PLATFORM_TO_YML: Record<DownloadPlatform, string> = {
  win: 'latest.yml',
  mac: 'latest-mac.yml',
  linux: 'latest-linux.yml'
}

function normalizeChannel(input: string): string {
  const channel = input.trim().toLowerCase()
  if (!channel) throw new BadRequestException('channel is required')
  if (!/^[a-z0-9_-]+$/.test(channel)) {
    throw new BadRequestException('invalid channel')
  }
  return channel
}

function normalizePlatform(input: string): AutoPlatform {
  const raw = input.trim().toLowerCase()
  if (!raw) throw new BadRequestException('platform is required')

  if (raw === 'auto') return 'auto'

  if (raw === 'win' || raw === 'windows' || raw === 'win32') return 'win'
  if (raw === 'mac' || raw === 'macos' || raw === 'darwin' || raw === 'osx') return 'mac'
  if (raw === 'linux') return 'linux'

  throw new BadRequestException('invalid platform')
}

function detectPlatformFromUserAgent(ua: string | undefined): DownloadPlatform {
  const agent = (ua || '').toLowerCase()
  if (agent.includes('windows')) return 'win'
  if (agent.includes('mac os') || agent.includes('macos') || agent.includes('darwin')) return 'mac'
  if (agent.includes('linux')) return 'linux'
  throw new BadRequestException('cannot detect platform from user-agent; please specify platform')
}

function tryParseTopLevelScalar(yml: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm')
  const m = yml.match(re)
  if (!m) return undefined

  let value = (m[1] || '').trim()
  if (!value) return undefined

  // strip inline comments (best-effort)
  const hashIndex = value.indexOf('#')
  if (hashIndex >= 0) value = value.slice(0, hashIndex).trim()

  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1)
  }

  return value.trim() || undefined
}

function sanitizeRelativeFilePath(input: string): string {
  const raw = input.trim().replace(/\\/g, '/')
  if (!raw) throw new BadRequestException('invalid yml path')
  if (raw.includes('\0')) throw new BadRequestException('invalid yml path')
  if (raw.startsWith('/') || raw.startsWith('\\')) throw new BadRequestException('invalid yml path')
  if (/^[a-zA-Z]:[\\/]/.test(raw)) throw new BadRequestException('invalid yml path')

  const normalized = normalize(raw).replace(/\\/g, '/')
  if (normalized === '..' || normalized.startsWith('../')) throw new BadRequestException('invalid yml path')

  return normalized
}

function encodeUrlPathSegments(pathname: string): string {
  return pathname
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

@Injectable()
export class DownloadsService {
  private readonly desktopPaths = resolveUpdateStoragePaths().desktopSubject

  private async readStableState(): Promise<{ currentVersion?: string; updatedAt?: string } | undefined> {
    try {
      const raw = await fs.readFile(this.desktopPaths.stableStateFile, 'utf-8')
      const parsed = JSON.parse(raw) as { currentVersion?: unknown; updatedAt?: unknown } | undefined
      return {
        currentVersion: typeof parsed?.currentVersion === 'string' ? parsed.currentVersion : undefined,
        updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : undefined
      }
    } catch {
      return undefined
    }
  }

  private getChannelDir(channelInput: string): { channel: string; channelDir: string } {
    const channel = normalizeChannel(channelInput)
    const channelDir = join(this.desktopPaths.channelsDir, channel)
    return { channel, channelDir }
  }

  private async getLatestForPlatform(
    channelDir: string,
    channel: string,
    platform: DownloadPlatform
  ): Promise<PlatformLatestInfo> {
    const yml = PLATFORM_TO_YML[platform]
    const ymlPath = join(channelDir, yml)

    if (!(await pathExists(ymlPath))) {
      return {
        platform,
        yml,
        available: false,
        error: 'latest yml not found'
      }
    }

    const raw = await fs.readFile(ymlPath, 'utf-8')
    const version = tryParseTopLevelScalar(raw, 'version')
    const pathFromYml = tryParseTopLevelScalar(raw, 'path')

    if (!pathFromYml) {
      return {
        platform,
        yml,
        available: false,
        version,
        error: 'missing `path` in latest yml'
      }
    }

    const safeRel = sanitizeRelativeFilePath(pathFromYml)

    const channelRoot = resolve(channelDir)
    const absFile = resolve(channelRoot, safeRel)
    if (!absFile.startsWith(channelRoot + sep)) {
      throw new BadRequestException('invalid yml path')
    }

    if (!(await pathExists(absFile))) {
      return {
        platform,
        yml,
        available: false,
        version,
        file: safeRel,
        url: `/updates/${channel}/${encodeUrlPathSegments(safeRel)}`,
        error: 'installer file not found'
      }
    }

    const stat = await fs.stat(absFile)

    return {
      platform,
      yml,
      available: true,
      version,
      file: safeRel,
      url: `/updates/${channel}/${encodeUrlPathSegments(safeRel)}`,
      size: stat.size
    }
  }

  async getLatestDownloads(channelInput: string): Promise<LatestDownloadsResponse> {
    const { channel, channelDir } = this.getChannelDir(channelInput)

    const stableState = channel === 'stable' ? await this.readStableState() : undefined

    const [win, mac, linux] = await Promise.all([
      this.getLatestForPlatform(channelDir, channel, 'win'),
      this.getLatestForPlatform(channelDir, channel, 'mac'),
      this.getLatestForPlatform(channelDir, channel, 'linux')
    ])

    return {
      channel,
      stableState,
      platforms: { win, mac, linux }
    }
  }

  async getLatestRedirectUrl(
    channelInput: string,
    platformInput: string,
    userAgent: string | undefined
  ): Promise<{ platform: DownloadPlatform; url: string }> {
    const { channel, channelDir } = this.getChannelDir(channelInput)

    const normalized = normalizePlatform(platformInput)
    const platform = normalized === 'auto' ? detectPlatformFromUserAgent(userAgent) : normalized

    const info = await this.getLatestForPlatform(channelDir, channel, platform)
    if (!info.available || !info.url) {
      throw new NotFoundException(info.error || 'latest installer not found')
    }

    return { platform, url: info.url }
  }
}
