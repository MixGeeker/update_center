import { promises as fs } from 'fs'
import { join } from 'path'
import { resolveUpdateStoragePaths } from './update-paths'

export async function ensureUpdateStorage(): Promise<void> {
  const paths = resolveUpdateStoragePaths()
  const subjects = [paths.desktopSubject, paths.edgeBackendSubject, paths.edgeFarmerWorkerSubject]

  // 逐级创建，避免目录不存在导致静态服务/管理接口报错
  await fs.mkdir(paths.updateDataDir, { recursive: true })
  await fs.mkdir(paths.subjectsDir, { recursive: true })

  for (const subject of subjects) {
    await fs.mkdir(subject.rootDir, { recursive: true })
    await fs.mkdir(subject.releasesDir, { recursive: true })
    await fs.mkdir(subject.channelsDir, { recursive: true })
    await fs.mkdir(subject.testingDir, { recursive: true })
    await fs.mkdir(subject.stableDir, { recursive: true })
    await fs.mkdir(subject.runtimeDir, { recursive: true })
    await fs.mkdir(subject.uploadSessionsDir, { recursive: true })
    await fs.mkdir(subject.compatibilityDir, { recursive: true })
    await fs.mkdir(subject.deploymentsDir, { recursive: true })
    await fs.mkdir(subject.environmentsDir, { recursive: true })
  }

  const edgeBackendEnvironmentFile = join(paths.edgeBackendSubject.environmentsDir, 'mac-prod.json')

  try {
    await fs.access(edgeBackendEnvironmentFile)
  } catch {
    const now = new Date().toISOString()
    await fs.writeFile(
      edgeBackendEnvironmentFile,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          environmentId: 'mac-prod',
          hostRole: 'mac-mini-m4',
          agentBaseUrl: 'http://127.0.0.1:3901',
          releaseChannel: 'stable',
          services: ['edge_backend'],
          autoUpdate: {
            enabled: false,
            dailyWindows: []
          },
          manualPolicy: {
            allowForce: true
          },
          updatedAt: now
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
  }
}
