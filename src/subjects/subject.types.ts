export type SubjectChannel = 'testing' | 'stable'

export type SubjectDeploymentStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'blocked'
  | 'succeeded'
  | 'failed'
  | 'rolled_back'

export type SubjectDeploymentTriggerMode = 'manual' | 'auto' | 'rescue'

export interface SubjectCapabilities {
  supportsChannels: boolean
  supportsCompatibility: boolean
  supportsEnvironmentControl: boolean
  supportsDeployments: boolean
  supportsStaticDownloads: boolean
}

export interface SubjectDescriptor {
  subjectId: string
  displayName: string
  kind: 'desktop' | 'service' | 'agent'
  capabilities: SubjectCapabilities
  uploadSlots: string[]
}
