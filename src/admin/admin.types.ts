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
