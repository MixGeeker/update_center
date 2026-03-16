export interface StableChannelState {
  currentVersion?: string
  previousVersions: string[]
  updatedAt?: string
}

export interface ListReleasesResponse {
  versions: string[]
}

export interface ReleaseDetail {
  version: string
  sizeBytes: number
  fileCount: number
  lastModifiedAt?: string
  protected: boolean
  protectedReasons: string[]
}

export interface ListReleaseDetailsResponse {
  stable: StableChannelState
  versions: ReleaseDetail[]
}

export interface GetChannelsResponse {
  stable: StableChannelState
}

export interface DesktopUploadedFile {
  fileName: string
  storedFileName: string
  sizeBytes: number
  sha256: string
  uploadedAt: string
  uploadMode?: 'single' | 'chunked'
  chunkCount?: number
}

export interface DesktopUploadChunkState {
  fileName: string
  storedFileName: string
  tempStoredFileName: string
  totalChunks: number
  nextChunkIndex: number
  receivedBytes: number
  totalSizeBytes?: number
  updatedAt: string
}

export interface DesktopUploadSessionRecord {
  schemaVersion: 1
  sessionId: string
  version: string
  createdAt: string
  files: Record<string, DesktopUploadedFile>
  chunkUploads?: Record<string, DesktopUploadChunkState>
}
