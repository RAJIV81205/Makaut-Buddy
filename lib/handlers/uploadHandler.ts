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

  /**
   * Check if the other branch (CSE/IT) already has the same PYQ file
   * Returns the file link if found, null otherwise
   */
  private async findExistingPyqFile(
    branch: string,
    semester: string,
    subject: string,
    year: string,
    fileName: string
  ): Promise<string | null> {
    // Only check for CSE and IT branches
    if (branch !== "CSE" && branch !== "IT") {
      return null;
    }

    // Get the other branch
    const otherBranch = branch === "CSE" ? "IT" : "CSE";

    try {
      // Find PYQ in the other branch with same semester, subject, and year
      const existingPyq = await Pyq.findOne({
        branch: otherBranch,
        semester,
        subject: subject.toUpperCase(),
        year,
      });

      if (existingPyq && existingPyq.files && existingPyq.files.length > 0) {
        const files = existingPyq.files;
        
        // Check if any file with the same name exists
        const matchingFile = files.find(
          (file: any) => file.name === fileName || file.name.toLowerCase() === fileName.toLowerCase()
        );

        if (matchingFile && matchingFile.link) {
          return matchingFile.link;
        }

        // If no exact name match, but files exist for the same PYQ, 
        // we can still reuse the first file (assuming they're the same content)
        // This is optional - you can remove this if you want exact name matching only
        const firstFile = files[0];
        if (firstFile && firstFile.link) {
          return firstFile.link;
        }
      }
    } catch (error) {
      console.error("Error checking for existing PYQ file:", error);
    }

    return null;
  }

  private createProgressBar(percentage: number): string {
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private async updateProgressMessage(
    ctx: Context,
    messageId: number | undefined,
    progress: number,
    stage: 'downloading' | 'uploading',
    fileName: string
  ): Promise<number> {
    const stageEmoji = stage === 'downloading' ? '⬇️' : '⬆️';
    const stageText = stage === 'downloading' ? 'Downloading' : 'Uploading';
    const progressBar = this.createProgressBar(progress);
    
    const message = `${stageEmoji} ${stageText}...\n\n📄 ${fileName}\n\n${progressBar} ${progress}%`;

    try {
      if (messageId) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          messageId,
          undefined,
          message
        );
        return messageId;
      } else {
        const sent = await ctx.reply(message);
        return sent.message_id;
      }
    } catch (error: any) {
      // If message not modified or other error, try sending new message
      if (!messageId || error?.response?.description?.includes("message is not modified")) {
        const sent = await ctx.reply(message);
        return sent.message_id;
      }
      return messageId || 0;
    }
  }

  async uploadNote(
    ctx: Context,
    branch: string,
    semester: string,
    subject: string,
    fileId: string,
    fileName: string
  ) {
    let progressMessageId: number | undefined;
    
    try {
      // Send initial progress message
      const initialMessage = await ctx.reply("⏳ Starting upload...");
      progressMessageId = initialMessage.message_id;

      const stream = await this.getTelegramFileStream(ctx, fileId);

      // Upload with progress tracking
      const fileLink = await cloudinaryService.uploadFromStream(
        stream,
        `${branch}_${semester}_${subject}_${fileName}`,
        `notes/${branch}/${semester}`,
        async (progress, stage) => {
          progressMessageId = await this.updateProgressMessage(
            ctx,
            progressMessageId,
            progress,
            stage,
            fileName
          );
        }
      );

      // Update to saving message
      await this.updateProgressMessage(ctx, progressMessageId, 100, 'uploading', fileName);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        progressMessageId,
        undefined,
        "💾 Saving to database..."
      );

      const note =
        (await Note.findOne({ branch, semester, subject })) ||
        new Note({ branch, semester, subject, files: [] });

      note.files.push({
        name: fileName,
        link: fileLink,
      });

      await note.save();

      // Delete progress message and send success
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessageId);
      } catch (e) {
        // Ignore if message already deleted
      }

      ctx.reply(
        `✅ Note uploaded successfully\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}`
      );
    } catch (err) {
      console.error(err);
      
      // Delete progress message if it exists
      if (progressMessageId) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessageId);
        } catch (e) {
          // Ignore
        }
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
    let progressMessageId: number | undefined;
    let fileLink: string;
    let reusedFile = false;
    
    try {
      // Send initial progress message
      const initialMessage = await ctx.reply("⏳ Checking for existing files...");
      progressMessageId = initialMessage.message_id;

      // Check if the other branch (CSE/IT) already has this file
      const existingFileLink = await this.findExistingPyqFile(
        branch,
        semester,
        subject,
        year,
        fileName
      );

      if (existingFileLink) {
        // Reuse existing file - no need to upload
        fileLink = existingFileLink;
        reusedFile = true;

        // Update progress message to show file reuse
        const otherBranch = branch === "CSE" ? "IT" : "CSE";
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          progressMessageId,
          undefined,
          `♻️ Reusing existing file from ${otherBranch}\n\n📄 ${fileName}\n\n💾 Saving to database...`
        );
      } else {
        // File doesn't exist, proceed with upload
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          progressMessageId,
          undefined,
          "⏳ Starting upload..."
        );

        const stream = await this.getTelegramFileStream(ctx, fileId);

        // Upload with progress tracking
        fileLink = await cloudinaryService.uploadFromStream(
          stream,
          `${branch}_${semester}_${subject}_${year}_${fileName}`,
          `pyqs/${branch}/${semester}`,
          async (progress, stage) => {
            progressMessageId = await this.updateProgressMessage(
              ctx,
              progressMessageId,
              progress,
              stage,
              fileName
            );
          }
        );

        // Update to saving message
        await this.updateProgressMessage(ctx, progressMessageId, 100, 'uploading', fileName);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          progressMessageId,
          undefined,
          "💾 Saving to database..."
        );
      }

      // Create or update PYQ record
      const pyq =
        (await Pyq.findOne({ branch, semester, subject: subject.toUpperCase(), year })) ||
        new Pyq({ branch, semester, subject: subject.toUpperCase(), year, files: [] });

      // Check if file with same name already exists in this record
      const fileExists = pyq.files.some(
        (file: any) => file.name === fileName || file.name.toLowerCase() === fileName.toLowerCase()
      );

      if (!fileExists) {
        pyq.files.push({
          name: fileName,
          link: fileLink,
        });

        await pyq.save();
      }

      // Delete progress message and send success
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessageId);
      } catch (e) {
        // Ignore if message already deleted
      }

      const successMessage = reusedFile
        ? `✅ PYQ saved successfully (reused existing file)\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}\n📅 ${year}`
        : `✅ PYQ uploaded successfully\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}\n📅 ${year}`;

      ctx.reply(successMessage);
    } catch (err) {
      console.error(err);
      
      // Delete progress message if it exists
      if (progressMessageId) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, progressMessageId);
        } catch (e) {
          // Ignore
        }
      }
      
      ctx.reply("❌ Upload failed. Please try again.");
    }
  }
}

export default new UploadHandler();
