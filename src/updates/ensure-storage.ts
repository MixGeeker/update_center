import { promises as fs } from 'fs'
import { resolveUpdateStoragePaths } from './update-paths'

export async function ensureUpdateStorage(): Promise<void> {
  const paths = resolveUpdateStoragePaths()

  // 逐级创建，避免目录不存在导致静态服务/管理接口报错
  await fs.mkdir(paths.updateDataDir, { recursive: true })
  await fs.mkdir(paths.releasesDir, { recursive: true })
  await fs.mkdir(paths.channelsDir, { recursive: true })
  await fs.mkdir(paths.stableDir, { recursive: true })
  await fs.mkdir(paths.desktopRuntimeDir, { recursive: true })
  await fs.mkdir(paths.desktopUploadSessionsDir, { recursive: true })

  await fs.mkdir(paths.backendRootDir, { recursive: true })
  await fs.mkdir(paths.backendReleasesDir, { recursive: true })
  await fs.mkdir(paths.backendChannelsDir, { recursive: true })
  await fs.mkdir(paths.backendTestingDir, { recursive: true })
  await fs.mkdir(paths.backendStableDir, { recursive: true })
  await fs.mkdir(paths.backendRuntimeDir, { recursive: true })
  await fs.mkdir(paths.backendUploadSessionsDir, { recursive: true })
  await fs.mkdir(paths.backendCompatibilityDir, { recursive: true })
  await fs.mkdir(paths.backendDeploymentsDir, { recursive: true })
  await fs.mkdir(paths.backendEnvironmentsDir, { recursive: true })

  try {
    await fs.access(paths.backendDefaultEnvironmentFile)
  } catch {
    const now = new Date().toISOString()
    await fs.writeFile(
      paths.backendDefaultEnvironmentFile,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          environmentId: 'mac-prod',
          hostRole: 'mac-mini-m4',
          agentBaseUrl: 'http://127.0.0.1:3901',
          releaseChannel: 'stable',
          services: ['update_center', 'local_server'],
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
