import { promises as fs } from 'fs'
import { resolveUpdateStoragePaths } from './update-paths'

export async function ensureUpdateStorage(): Promise<void> {
  const { updateDataDir, releasesDir, channelsDir, stableDir } = resolveUpdateStoragePaths()

  // 逐级创建，避免目录不存在导致静态服务/管理接口报错
  await fs.mkdir(updateDataDir, { recursive: true })
  await fs.mkdir(releasesDir, { recursive: true })
  await fs.mkdir(channelsDir, { recursive: true })
  await fs.mkdir(stableDir, { recursive: true })
}
