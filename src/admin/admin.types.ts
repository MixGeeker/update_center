export interface StableChannelState {
  currentVersion?: string
  previousVersions: string[]
  updatedAt?: string
}

export interface ListReleasesResponse {
  versions: string[]
}

export interface GetChannelsResponse {
  stable: StableChannelState
}
