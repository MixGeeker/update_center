import { join } from 'path'

export interface UpdateStoragePaths {
  /** UPDATE_DATA_DIR 的最终落地路径 */
  updateDataDir: string
  releasesDir: string
  channelsDir: string
  stableDir: string
  stableStateFile: string
}

/**
 * UPDATE_DATA_DIR:
 * - 服务器上用于存放更新文件的根目录
 * - 目录结构：
 *   - <UPDATE_DATA_DIR>/releases/<version>/...   (CI 上传产物)
 *   - <UPDATE_DATA_DIR>/channels/stable/...      (客户端拉取的稳定渠道入口)
 */
export function resolveUpdateStoragePaths(): UpdateStoragePaths {
  const updateDataDir = (process.env.UPDATE_DATA_DIR || '').trim() || join(process.cwd(), 'data', 'updates')

  const releasesDir = join(updateDataDir, 'releases')
  const channelsDir = join(updateDataDir, 'channels')
  const stableDir = join(channelsDir, 'stable')

  // 点文件默认不会被 express.static 暴露（dotfiles: 'ignore'）
  const stableStateFile = join(channelsDir, '.stable-state.json')

  return {
    updateDataDir,
    releasesDir,
    channelsDir,
    stableDir,
    stableStateFile
  }
}
