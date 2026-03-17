export type BackendChannel = 'testing' | 'stable'

export type BackendEnforceMode = 'none' | 'warn' | 'hard_block'

export type BackendMigrationPolicy = 'none' | 'before-deploy' | 'after-deploy'

export type BackendUploadSlot = 'image' | 'checksums'

export type BackendDeploymentStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'blocked'
  | 'succeeded'
  | 'failed'
  | 'rolled_back'

export type BackendDeploymentTriggerMode = 'manual' | 'auto' | 'rescue'

export type BackendDeploymentResult = string | Record<string, unknown>

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
  uploadMode?: 'single' | 'chunked'
  chunkCount?: number
}

export interface BackendUploadChunkState {
  slot: BackendUploadSlot
  fileName: string
  storedFileName: string
  tempStoredFileName: string
  totalChunks: number
  nextChunkIndex: number
  receivedBytes: number
  totalSizeBytes?: number
  updatedAt: string
}

export interface BackendUploadSessionRecord {
  schemaVersion: 1
  sessionId: string
  version: string
  createdAt: string
  files: Partial<Record<BackendUploadSlot, BackendUploadedFile>>
  chunkUploads?: Partial<Record<BackendUploadSlot, BackendUploadChunkState>>
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
  artifactBasePath?: string
  downloadUrl?: string
  imageDownloadUrl?: string
  manifestDownloadUrl?: string
  checksumsDownloadUrl?: string
  manifest?: BackendReleaseManifest
}

export interface BackendEnvironmentWindow {
  start: string
  end: string
}

export interface BackendEnvironmentAutoUpdatePolicy {
  enabled: boolean
  dailyWindows: BackendEnvironmentWindow[]
}

export interface BackendEnvironmentManualPolicy {
  allowForce: boolean
}

export interface BackendEnvironmentRecord {
  schemaVersion: 1
  environmentId: string
  hostRole?: string
  agentBaseUrl?: string
  releaseChannel: BackendChannel
  pinnedVersion?: string
  currentVersion?: string
  desiredVersion?: string
  services: string[]
  autoUpdate: BackendEnvironmentAutoUpdatePolicy
  manualPolicy: BackendEnvironmentManualPolicy
  updatedAt: string
  updatedBy?: string
}

export interface BackendEnvironmentResolvedRecord extends BackendEnvironmentRecord {
  channelCurrentVersion?: string
  resolvedDesiredVersion?: string
}

export interface BackendDeploymentRecord {
  schemaVersion: 1
  deploymentId: string
  environmentId: string
  channel: BackendChannel
  requestedVersion: string
  status: BackendDeploymentStatus
  triggerMode: BackendDeploymentTriggerMode
  createdAt: string
  updatedAt: string
  notes?: string
  force?: boolean
  requestedBy?: string
  claimedBy?: string
  step?: string
  blockReasons?: string[]
  startedAt?: string
  finishedAt?: string
  currentVersion?: string
  desiredVersion?: string
  result?: BackendDeploymentResult
  artifactBasePath?: string
  imageDownloadUrl?: string
  manifestDownloadUrl?: string
  checksumsDownloadUrl?: string
  compatibility?: BackendCompatibilityPolicy
}



