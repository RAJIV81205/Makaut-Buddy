import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

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
    folder?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          
          // Use upload method directly with buffer - ensures signed upload when API secret is configured
          const result = await cloudinary.uploader.upload(
            `data:application/pdf;base64,${buffer.toString('base64')}`,
            {
              resource_type: "raw",
              folder: folder || "makaut-buddy",
              public_id: fileName.replace(/\.[^/.]+$/, ""), // Remove file extension
              format: "pdf",
              use_filename: false,
              overwrite: true,
            }
          );

          resolve(result.secure_url);
        } catch (err) {
          reject(err);
        }
      });

      stream.on("error", reject);
    });
  }
}

export default new CloudinaryService();
