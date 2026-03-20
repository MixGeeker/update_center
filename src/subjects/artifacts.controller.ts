import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Res
} from '@nestjs/common'
import { promises as fs } from 'fs'
import { join } from 'path'
import { sanitizeFileName, validateVersionSafe } from '../common/release-storage.utils'
import { resolveSubjectStoragePaths } from '../updates/update-paths'
import { SubjectRegistryService } from './subject-registry.service'

type FileResponse = {
  setHeader(name: string, value: string): void
  sendFile(path: string): void
}

@Controller('artifacts')
export class ArtifactsController {
  constructor(private readonly registry: SubjectRegistryService) {}

  @Get(':subjectId/releases/:version/:fileName')
  async getReleaseFile(
    @Param('subjectId') subjectId: string,
    @Param('version') versionInput: string,
    @Param('fileName') fileNameInput: string,
    @Res() res: FileResponse
  ): Promise<void> {
    this.registry.get(subjectId)
    const version = String(versionInput || '').trim()
    validateVersionSafe(version)
    const fileName = sanitizeFileName(fileNameInput)
    const filePath = join(resolveSubjectStoragePaths(subjectId).releasesDir, version, fileName)

    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) {
        throw new NotFoundException('artifact file not found')
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error
      }

      throw new NotFoundException('artifact file not found')
    }

    if (fileName.toLowerCase().endsWith('.json')) {
      res.setHeader('Cache-Control', 'no-cache')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }

    try {
      res.sendFile(filePath)
    } catch {
      throw new BadRequestException('cannot send artifact file')
    }
  }
}
