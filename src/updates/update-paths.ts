import { join } from 'path'

export interface SubjectStoragePaths {
  subjectId: string
  rootDir: string
  releasesDir: string
  channelsDir: string
  runtimeDir: string
  uploadSessionsDir: string
  stableDir: string
  stableStateFile: string
  testingDir: string
  testingStateFile: string
  compatibilityDir: string
  deploymentsDir: string
  environmentsDir: string
}

export interface UpdateStoragePaths {
  updateDataDir: string
  subjectsDir: string
  desktopSubject: SubjectStoragePaths
  edgeBackendSubject: SubjectStoragePaths
  edgeFarmerWorkerSubject: SubjectStoragePaths
}

export function resolveUpdateDataDir(): string {
  return (process.env.UPDATE_DATA_DIR || '').trim() || join(process.cwd(), 'data', 'updates')
}

export function resolveSubjectStoragePaths(
  subjectId: string,
  updateDataDirInput?: string
): SubjectStoragePaths {
  const updateDataDir = updateDataDirInput || resolveUpdateDataDir()
  const rootDir = join(updateDataDir, 'subjects', subjectId)
  const releasesDir = join(rootDir, 'releases')
  const channelsDir = join(rootDir, 'channels')
  const runtimeDir = join(rootDir, 'runtime')
  const uploadSessionsDir = join(runtimeDir, 'upload-sessions')
  const stableDir = join(channelsDir, 'stable')
  const stableStateFile = join(channelsDir, '.stable-state.json')
  const testingDir = join(channelsDir, 'testing')
  const testingStateFile = join(channelsDir, '.testing-state.json')
  const compatibilityDir = join(runtimeDir, 'compatibility')
  const deploymentsDir = join(runtimeDir, 'deployments')
  const environmentsDir = join(runtimeDir, 'environments')

  return {
    subjectId,
    rootDir,
    releasesDir,
    channelsDir,
    runtimeDir,
    uploadSessionsDir,
    stableDir,
    stableStateFile,
    testingDir,
    testingStateFile,
    compatibilityDir,
    deploymentsDir,
    environmentsDir
  }
}

/**
 * UPDATE_DATA_DIR:
 * - 服务器上用于存放更新文件的根目录
 * - 目录结构：
 *   - <UPDATE_DATA_DIR>/subjects/desktop_app/...       (桌面端更新)
 *   - <UPDATE_DATA_DIR>/subjects/edge_backend/...      (Edge Backend 发布)
 *   - <UPDATE_DATA_DIR>/subjects/edge_farmer_worker/... (Edge Farmer Worker 发布)
 *
 * 返回内建 subject 的统一存储路径，不再保留旧 desktop/backend 专用字段别名。
 */
export function resolveUpdateStoragePaths(): UpdateStoragePaths {
  const updateDataDir = resolveUpdateDataDir()
  const subjectsDir = join(updateDataDir, 'subjects')

  const desktopSubject = resolveSubjectStoragePaths('desktop_app', updateDataDir)
  const edgeBackendSubject = resolveSubjectStoragePaths('edge_backend', updateDataDir)
  const edgeFarmerWorkerSubject = resolveSubjectStoragePaths('edge_farmer_worker', updateDataDir)

  return {
    updateDataDir,
    subjectsDir,
    desktopSubject,
    edgeBackendSubject,
    edgeFarmerWorkerSubject
  }
}
