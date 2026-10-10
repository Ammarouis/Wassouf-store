import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage, Options } from 'multer';
import sharp from 'sharp';

export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function getMediaRoot(): string {
  return path.resolve(process.env.MEDIA_DIR || path.resolve(__dirname, '../../uploads'));
}

export const MEDIA_ROOT = getMediaRoot();

export function createImageUploadOptions(maxFiles = 8): Options {
  return {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        try {
          const mediaRoot = getMediaRoot();
          if (!existsSync(mediaRoot)) mkdirSync(mediaRoot, { recursive: true });
          callback(null, mediaRoot);
        } catch (error) {
          callback(error as Error, getMediaRoot());
        }
      },
      filename: (_request, file, callback) => {
        const extension = IMAGE_MIME_EXTENSIONS[file.mimetype];
        callback(null, `${randomUUID()}${extension || '.bin'}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: maxFiles, fields: 20, parts: maxFiles + 20 },
    fileFilter: (_request, file, callback) => {
      if (!IMAGE_MIME_EXTENSIONS[file.mimetype]) {
        callback(new BadRequestException('يُسمح فقط بصور JPG أو PNG أو WebP أو GIF.'));
        return;
      }
      callback(null, true);
    },
  };
}

@Injectable()
export class MediaStorageService {
  getPath(filename: string): string | null {
    if (!/^[a-f\d-]{36}\.(jpg|png|webp|gif)$/.test(filename)) return null;
    const mediaRoot = getMediaRoot();
    const resolved = path.resolve(mediaRoot, filename);
    return resolved.startsWith(`${mediaRoot}${path.sep}`) ? resolved : null;
  }

  async validateUpload(file: Express.Multer.File): Promise<string> {
    const bytes = await readFile(file.path);
    const detected = this.detectMime(bytes);
    if (!detected || detected !== file.mimetype || IMAGE_MIME_EXTENSIONS[detected] !== path.extname(file.filename).toLowerCase()) {
      await this.remove(file.filename);
      throw new BadRequestException('محتوى الملف لا يطابق نوع الصورة المعلن.');
    }
    try {
      const input = sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000, animated: false });
      const metadata = await input.metadata();
      const expectedFormat = detected === 'image/jpeg' ? 'jpeg' : detected.slice('image/'.length);
      if (!metadata.width || !metadata.height || metadata.format !== expectedFormat || metadata.width * metadata.height > 40_000_000) {
        throw new Error('الصورة تالفة أو أبعادها غير مدعومة.');
      }
      const cleaned = await sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000, animated: false })
        .rotate()
        .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      if (cleaned.length > 8 * 1024 * 1024) throw new Error('حجم الصورة بعد المعالجة أكبر من الحد المسموح.');
      await writeFile(file.path, cleaned);
      file.size = cleaned.length;
      return detected;
    } catch (error) {
      await this.remove(file.filename);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'تعذر فك ترميز الصورة.');
    }
  }

  async remove(filename: string): Promise<void> {
    const filePath = this.getPath(filename);
    if (filePath) await unlink(filePath).catch(() => undefined);
  }

  private detectMime(bytes: Buffer): string | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
    return null;
  }
}
