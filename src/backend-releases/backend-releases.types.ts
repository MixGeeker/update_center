export type BackendChannel = 'testing' | 'stable'

export type BackendEnforceMode = 'none' | 'warn' | 'hard_block'

export type BackendMigrationPolicy = 'none' | 'before-deploy' | 'after-deploy'

export type BackendUploadSlot = 'image' | 'checksums'

export interface BackendChannelState {
  currentVersion?: string
  previousVersions: string[]
  updatedAt?: string
}

export interface BackendUploadedFile {
  slot: BackendUploadSlot
  fileName: string
  storedFileName: string
  sizeBytes: number
  sha256: string
  uploadedAt: string
}

export interface BackendUploadSessionRecord {
  schemaVersion: 1
  sessionId: string
  version: string
  createdAt: string
  files: Partial<Record<BackendUploadSlot, BackendUploadedFile>>
}

export interface BackendCompatibilityPolicy {
  schemaVersion: 1
  backendVersion: string
  desktopMinVersion: string
  desktopRecommendedVersion: string
  desktopMaxVersion?: string
  enforceMode: BackendEnforceMode
  updatedAt: string
  notes?: string
}

export interface BackendReleaseManifest {
  schemaVersion: 1
  service: 'local_server'
  version: string
  uploadedAt: string
  channelHint: 'draft' | BackendChannel
  image: {
    fileName: string
    sha256: string
    sizeBytes: number
    tag?: string
    repository?: string
    platform: 'linux/arm64'
  }
  checksums?: {
    fileName: string
    sha256: string
    sizeBytes: number
  }
  source?: {
    gitCommit?: string
    refName?: string
    buildTime?: string
  }
  composeProfileSet: string[]
  migrationPolicy: BackendMigrationPolicy
  notes?: string
}

export interface BackendReleaseDetail {
  version: string
  sizeBytes: number
  fileCount: number
  lastModifiedAt?: string
  channels: BackendChannel[]
  protected: boolean
  protectedReasons: string[]
  hasCompatibility: boolean
  manifest?: BackendReleaseManifest
}

export interface BackendDeploymentRecord {
  schemaVersion: 1
  deploymentId: string
  environmentId: string
  channel: BackendChannel
  requestedVersion: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  createdAt: string
  updatedAt: string
  notes?: string
  compatibility?: BackendCompatibilityPolicy
}
