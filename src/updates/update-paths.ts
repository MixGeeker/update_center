import { join } from 'path'

export interface UpdateStoragePaths {
  /** UPDATE_DATA_DIR 的最终落地路径 */
  updateDataDir: string
  desktopReleasesDir: string
  desktopChannelsDir: string
  releasesDir: string
  channelsDir: string
  stableDir: string
  stableStateFile: string
  backendRootDir: string
  backendReleasesDir: string
  backendChannelsDir: string
  backendTestingDir: string
  backendStableDir: string
  backendTestingStateFile: string
  backendStableStateFile: string
  backendRuntimeDir: string
  backendUploadSessionsDir: string
  backendCompatibilityDir: string
  backendDeploymentsDir: string
  backendEnvironmentsDir: string
  backendDefaultEnvironmentFile: string
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

  const desktopReleasesDir = join(updateDataDir, 'releases')
  const desktopChannelsDir = join(updateDataDir, 'channels')
  const stableDir = join(desktopChannelsDir, 'stable')

  // 点文件默认不会被 express.static 暴露（dotfiles: 'ignore'）
  const stableStateFile = join(desktopChannelsDir, '.stable-state.json')

  const backendRootDir = join(updateDataDir, 'backend')
  const backendReleasesDir = join(backendRootDir, 'releases')
  const backendChannelsDir = join(backendRootDir, 'channels')
  const backendTestingDir = join(backendChannelsDir, 'testing')
  const backendStableDir = join(backendChannelsDir, 'stable')
  const backendTestingStateFile = join(backendChannelsDir, '.testing-state.json')
  const backendStableStateFile = join(backendChannelsDir, '.stable-state.json')
  const backendRuntimeDir = join(backendRootDir, 'runtime')
  const backendUploadSessionsDir = join(backendRuntimeDir, 'upload-sessions')
  const backendCompatibilityDir = join(backendRuntimeDir, 'compatibility')
  const backendDeploymentsDir = join(backendRuntimeDir, 'deployments')
  const backendEnvironmentsDir = join(backendRuntimeDir, 'environments')
  const backendDefaultEnvironmentFile = join(backendEnvironmentsDir, 'mac-prod.json')

  return {
    updateDataDir,
    desktopReleasesDir,
    desktopChannelsDir,
    releasesDir: desktopReleasesDir,
    channelsDir: desktopChannelsDir,
    stableDir,
    stableStateFile,
    backendRootDir,
    backendReleasesDir,
    backendChannelsDir,
    backendTestingDir,
    backendStableDir,
    backendTestingStateFile,
    backendStableStateFile,
    backendRuntimeDir,
    backendUploadSessionsDir,
    backendCompatibilityDir,
    backendDeploymentsDir,
    backendEnvironmentsDir,
    backendDefaultEnvironmentFile
  }
}
