export type DownloadPlatform = 'win' | 'mac' | 'linux'

export interface PlatformLatestInfo {
  platform: DownloadPlatform
  yml: string
  available: boolean
  version?: string
  file?: string
  url?: string
  size?: number
  error?: string
}

export interface LatestDownloadsResponse {
  channel: string
  stableState?: {
    currentVersion?: string
    updatedAt?: string
  }
  platforms: Record<DownloadPlatform, PlatformLatestInfo>
}

