// HireByMinutes — External Object Storage Service
// Supports Cloudflare R2, AWS S3, Supabase Storage, Backblaze B2, MinIO, and Local Filesystem
// Prevents file loss on Render Free ephemeral filesystems

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

class StorageService {
  constructor() {
    this.s3Client = null;
    this.initClient();
  }

  initClient() {
    const accessKeyId = process.env.STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.STORAGE_REGION || process.env.AWS_REGION || 'auto';
    const endpoint = process.env.STORAGE_ENDPOINT; // e.g. https://<accountid>.r2.cloudflarestorage.com

    if (accessKeyId && secretAccessKey) {
      const config = {
        region,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      };

      if (endpoint) {
        config.endpoint = endpoint;
      }

      this.s3Client = new S3Client(config);
    }
  }

  getConfig() {
    return {
      provider: process.env.STORAGE_PROVIDER || (this.s3Client ? 's3' : 'local'),
      bucket: process.env.STORAGE_BUCKET || 'hirebyminutes-uploads',
      publicUrl: process.env.STORAGE_PUBLIC_URL || '', // e.g. https://pub-xxx.r2.dev or CDN domain
      isConfigured: Boolean(this.s3Client)
    };
  }

  // Upload file buffer or stream to storage provider
  async upload({ buffer, originalName, mimeType = 'application/octet-stream', folder = 'attachments' }) {
    const ext = path.extname(originalName).toLowerCase();
    const cleanBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${Date.now()}-${uuidv4().slice(0, 8)}-${cleanBase}${ext}`;
    const objectKey = `${folder}/${filename}`;

    const config = this.getConfig();

    // 1. External S3/R2/Cloud Storage (Production on Render Free)
    if (this.s3Client && config.bucket) {
      try {
        const command = new PutObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: mimeType
        });

        await this.s3Client.send(command);

        // Determine public URL
        let fileUrl = '';
        if (config.publicUrl) {
          fileUrl = `${config.publicUrl.replace(/\/$/, '')}/${objectKey}`;
        } else if (process.env.STORAGE_ENDPOINT) {
          fileUrl = `${process.env.STORAGE_ENDPOINT.replace(/\/$/, '')}/${config.bucket}/${objectKey}`;
        } else {
          fileUrl = `https://${config.bucket}.s3.${process.env.STORAGE_REGION || 'us-east-1'}.amazonaws.com/${objectKey}`;
        }

        return {
          key: objectKey,
          url: fileUrl,
          filename,
          size: buffer.length,
          mimeType,
          provider: config.provider
        };
      } catch (err) {
        console.error('[StorageService] S3/R2 upload error, falling back to local:', err.message);
      }
    }

    // 2. Local Filesystem (Local Development / Testing fallback)
    const localUploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(localUploadsDir)) {
      fs.mkdirSync(localUploadsDir, { recursive: true });
    }

    const localFilePath = path.join(localUploadsDir, filename);
    fs.writeFileSync(localFilePath, buffer);

    return {
      key: `uploads/${filename}`,
      url: `/uploads/${filename}`,
      filename,
      size: buffer.length,
      mimeType,
      provider: 'local'
    };
  }

  // Delete file from storage
  async delete(objectKey) {
    const config = this.getConfig();
    if (this.s3Client && config.bucket) {
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: objectKey
        }));
        return true;
      } catch (err) {
        console.error('[StorageService] S3 delete error:', err.message);
        return false;
      }
    }

    // Local delete
    try {
      const localFilePath = path.join(__dirname, '..', objectKey);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new StorageService();
