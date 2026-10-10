import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { stat } from 'node:fs/promises';
import { MediaStorageService } from './media-storage.service';

@Controller('/api/media')
export class MediaController {
  constructor(@Inject(MediaStorageService) private readonly storage: MediaStorageService) {}

  @Get('/:filename')
  async image(@Param('filename') filename: string, @Res() response: Response): Promise<void> {
    const fullPath = this.storage.getPath(filename);
    if (!fullPath) throw new NotFoundException('الصورة غير موجودة.');
    try {
      const details = await stat(fullPath);
      if (!details.isFile()) throw new Error('Not a file');
    } catch {
      throw new NotFoundException('الصورة غير موجودة.');
    }
    const extension = filename.split('.').pop();
    const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', String((await stat(fullPath)).size));
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.sendFile(fullPath);
  }
}
