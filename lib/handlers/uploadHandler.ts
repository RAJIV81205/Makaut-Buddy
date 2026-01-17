import { Context } from "telegraf";
import https from "https";
import cloudinaryService from "../services/cloudinary.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";

class UploadHandler {

  private async getTelegramFileStream(ctx: Context, fileId: string) {
    const fileLink = await ctx.telegram.getFileLink(fileId);

    return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      https.get(fileLink.href, (res) => resolve(res))
        .on("error", reject);
    });
  }

  private async updateProgressMessage(
    ctx: Context,
    messageId: number,
    progress: number,
    stage: string
  ) {
    try {
      const clampedProgress = Math.min(100, Math.max(0, progress));
      const filled = Math.floor(clampedProgress / 5);
      const empty = 20 - filled;
      const progressBar = "█".repeat(filled) + "░".repeat(empty);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        messageId,
        undefined,
        `⏳ ${stage}\n\n${progressBar} ${clampedProgress}%`
      );
    } catch (err) {
      // Ignore edit errors (message might be too similar)
    }
  }

  private async saveToBothBranches(
    Model: any,
    branches: string[],
    semester: string,
    subject: string,
    fileData: { name: string; link: string },
    additionalFields?: Record<string, any>
  ) {
    const savePromises = branches.map(async (branch) => {
      const query: any = { branch, semester, subject, ...additionalFields };
      const doc = (await Model.findOne(query)) || new Model({ ...query, files: [] });
      
      // Check if file already exists
      const fileExists = doc.files.some((f: any) => f.name === fileData.name && f.link === fileData.link);
      if (!fileExists) {
        doc.files.push(fileData);
        await doc.save();
      }
    });

    await Promise.all(savePromises);
  }

  async uploadNote(
    ctx: Context,
    branch: string,
    semester: string,
    subject: string,
    fileId: string,
    fileName: string
  ) {
    let progressMessage: any = null;
    try {
      // Get file info to calculate progress
      const fileInfo = await ctx.telegram.getFile(fileId);
      const totalBytes = fileInfo.file_size;

      // Send initial progress message
      progressMessage = await ctx.reply("⏳ Downloading file...\n\n░░░░░░░░░░░░░░░░░░░░ 0%");

      const stream = await this.getTelegramFileStream(ctx, fileId);

      // Update progress during upload (download and upload happen together in streaming)
      const uploadProgress = (bytesRead: number, total?: number) => {
        if (totalBytes) {
          const progress = Math.min(95, Math.floor((bytesRead / totalBytes) * 95));
          const stage = bytesRead < totalBytes * 0.5 ? "Downloading & Uploading..." : "Uploading to cloud...";
          this.updateProgressMessage(ctx, progressMessage.message_id, progress, stage);
        }
      };

      const fileLink = await cloudinaryService.uploadFromStream(
        stream,
        `${branch}_${semester}_${subject}_${fileName}`,
        `notes/${branch}/${semester}`,
        uploadProgress,
        totalBytes
      );

      await this.updateProgressMessage(ctx, progressMessage.message_id, 100, "Saving to database...");

      const fileData = {
        name: fileName,
        link: fileLink,
      };

      // Check if CSE or IT - save to both branches as shared
      if (branch === "CSE" || branch === "IT") {
        await this.saveToBothBranches(Note, ["CSE", "IT"], semester, subject, fileData);
        await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
        ctx.reply(
          `✅ Note uploaded successfully (Shared: CSE & IT)\n\n📚 CSE & IT\n📖 Sem ${semester}\n📝 ${subject}`
        );
      } else {
        const note =
          (await Note.findOne({ branch, semester, subject })) ||
          new Note({ branch, semester, subject, files: [] });

        note.files.push(fileData);
        await note.save();

        await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
        ctx.reply(
          `✅ Note uploaded successfully\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}`
        );
      }
    } catch (err) {
      console.error(err);
      if (progressMessage) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
        } catch {}
      }
      ctx.reply("❌ Upload failed. Please try again.");
    }
  }

  async uploadPyq(
    ctx: Context,
    branch: string,
    semester: string,
    subject: string,
    year: string,
    fileId: string,
    fileName: string
  ) {
    let progressMessage: any = null;
    try {
      // Get file info to calculate progress
      const fileInfo = await ctx.telegram.getFile(fileId);
      const totalBytes = fileInfo.file_size;

      // Send initial progress message
      progressMessage = await ctx.reply("⏳ Downloading file...\n\n░░░░░░░░░░░░░░░░░░░░ 0%");

      const stream = await this.getTelegramFileStream(ctx, fileId);

      // Update progress during upload (download and upload happen together in streaming)
      const uploadProgress = (bytesRead: number, total?: number) => {
        if (totalBytes && totalBytes > 0) {
          const progress = Math.min(95, Math.floor((bytesRead / totalBytes) * 95));
          const stage = bytesRead < totalBytes * 0.5 ? "Downloading & Uploading..." : "Uploading to cloud...";
          this.updateProgressMessage(ctx, progressMessage.message_id, progress, stage);
        } else {
          // If file size is unknown, show indeterminate progress
          this.updateProgressMessage(ctx, progressMessage.message_id, 50, "Processing...");
        }
      };

      const fileLink = await cloudinaryService.uploadFromStream(
        stream,
        `${branch}_${semester}_${subject}_${year}_${fileName}`,
        `pyqs/${branch}/${semester}`,
        uploadProgress,
        totalBytes
      );

      await this.updateProgressMessage(ctx, progressMessage.message_id, 100, "Saving to database...");

      const fileData = {
        name: fileName,
        link: fileLink,
      };

      // Check if CSE or IT - save to both branches as shared
      if (branch === "CSE" || branch === "IT") {
        await this.saveToBothBranches(Pyq, ["CSE", "IT"], semester, subject, fileData, { year });
        await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
        ctx.reply(
          `✅ PYQ uploaded successfully (Shared: CSE & IT)\n\n📚 CSE & IT\n📖 Sem ${semester}\n📝 ${subject}\n📅 ${year}`
        );
      } else {
        const pyq =
          (await Pyq.findOne({ branch, semester, subject, year })) ||
          new Pyq({ branch, semester, subject, year, files: [] });

        pyq.files.push(fileData);
        await pyq.save();

        await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
        ctx.reply(
          `✅ PYQ uploaded successfully\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}\n📅 ${year}`
        );
      }
    } catch (err) {
      console.error(err);
      if (progressMessage) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessage.message_id);
        } catch {}
      }
      ctx.reply("❌ Upload failed. Please try again.");
    }
  }
}

export default new UploadHandler();
