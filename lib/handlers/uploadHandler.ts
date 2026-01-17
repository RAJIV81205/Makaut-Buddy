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

  async uploadNote(
    ctx: Context,
    branch: string,
    semester: string,
    subject: string,
    fileId: string,
    fileName: string
  ) {
    try {
      const stream = await this.getTelegramFileStream(ctx, fileId);

      const fileLink = await cloudinaryService.uploadFromStream(
        stream,
        `${branch}_${semester}_${subject}_${fileName}`,
        `notes/${branch}/${semester}`
      );

      const note =
        (await Note.findOne({ branch, semester, subject })) ||
        new Note({ branch, semester, subject, files: [] });

      note.files.push({
        name: fileName,
        link: fileLink,
      });

      await note.save();

      ctx.reply(
        `✅ Note uploaded successfully\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}`
      );
    } catch (err) {
      console.error(err);
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
    try {
      const stream = await this.getTelegramFileStream(ctx, fileId);

      const fileLink = await cloudinaryService.uploadFromStream(
        stream,
        `${branch}_${semester}_${subject}_${year}_${fileName}`,
        `pyqs/${branch}/${semester}`
      );

      const pyq =
        (await Pyq.findOne({ branch, semester, subject, year })) ||
        new Pyq({ branch, semester, subject, year, files: [] });

      pyq.files.push({
        name: fileName,
        link: fileLink,
      });

      await pyq.save();

      ctx.reply(
        `✅ PYQ uploaded successfully\n\n📚 ${branch}\n📖 Sem ${semester}\n📝 ${subject}\n📅 ${year}`
      );
    } catch (err) {
      console.error(err);
      ctx.reply("❌ Upload failed. Please try again.");
    }
  }
}

export default new UploadHandler();
