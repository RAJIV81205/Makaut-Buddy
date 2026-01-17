import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

type ProgressCallback = (progress: number, stage: 'downloading' | 'uploading') => void;

class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    });
  }

  async uploadFromStream(
    stream: NodeJS.ReadableStream,
    fileName: string,
    folder?: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let downloadedSize = 0;

      // Track download progress
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        downloadedSize += chunk.length;
        
        // Estimate progress (we don't know total size from Telegram stream)
        // So we'll show progress based on chunks received
        if (onProgress && chunks.length % 10 === 0) {
          // Update every 10 chunks to avoid too many updates
          const downloadProgress = Math.min(50, (chunks.length * 2)); // Cap at 50% for download phase
          onProgress(downloadProgress, 'downloading');
        }
      });

      stream.on("end", async () => {
        try {
          totalSize = chunks.length;
          const buffer = Buffer.concat(chunks);
          
          if (onProgress) {
            onProgress(50, 'uploading');
          }
          
          // Use upload_stream for better progress tracking
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              folder: folder || "makaut-buddy",
              public_id: fileName.replace(/\.[^/.]+$/, ""), // Remove file extension
              format: "pdf",
              use_filename: false,
              overwrite: true,
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else if (result) {
                if (onProgress) {
                  onProgress(100, 'uploading');
                }
                resolve(result.secure_url);
              } else {
                reject(new Error("Upload failed: No result returned"));
              }
            }
          );

          // Pipe buffer to upload stream
          const bufferStream = Readable.from(buffer);
          
          // Track upload progress by monitoring buffer chunks
          let uploadedBytes = 0;
          const chunkSize = Math.ceil(buffer.length / 20); // Divide into ~20 updates
          
          bufferStream.on('data', (chunk: Buffer) => {
            uploadedBytes += chunk.length;
            if (onProgress) {
              const uploadProgress = 50 + Math.floor((uploadedBytes / buffer.length) * 50);
              onProgress(Math.min(99, uploadProgress), 'uploading');
            }
          });

          bufferStream.pipe(uploadStream);
        } catch (err) {
          reject(err);
        }
      });

      stream.on("error", reject);
    });
  }
}

export default new CloudinaryService();
