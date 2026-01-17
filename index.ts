import dotenv from "dotenv";
dotenv.config();

import { Telegraf, session } from "telegraf";
import { Redis } from "@telegraf/session/redis";
import connectDB from "./lib/db.js";
import { isAdmin, checkAdmin } from "./lib/middleware/adminAuth.js";
import uploadHandler from "./lib/handlers/uploadHandler.js";
import { BRANCHES, SEMESTERS, SUBJECTS } from "./lib/models/enums.js";

// MODELS
import Note from "./lib/models/Note.js";
import Pyq from "./lib/models/Pyq.js";
import Syllabus from "./lib/models/Syllabus.js";

interface SessionData {
  branch?: string;
  semester?: string;
  subject?: string;
  pyq_branch?: string;
  pyq_sem?: string;
  uploadType?: "note" | "pyq";
  uploadBranch?: string;
  uploadSemester?: string;
  uploadSubject?: string;
  uploadYear?: string;
}

const bot = new Telegraf(process.env.BOT_TOKEN!);

// REDIS SESSION
const store = Redis<SessionData>({ url: process.env.REDIS_URL! });

bot.use(
  session({
    store,
    defaultSession: () => ({}),
  })
);

// DB
connectDB();

// Helper function to safely edit messages (handles "message not modified" error)
async function safeEditMessageText(
  ctx: any,
  text: string,
  extra?: any
): Promise<void> {
  try {
    await ctx.editMessageText(text, extra);
  } catch (error: any) {
    // Ignore "message is not modified" error - it means the message is already correct
    if (
      error?.response?.description?.includes("message is not modified") ||
      error?.description?.includes("message is not modified")
    ) {
      // Silently ignore - message is already correct
      return;
    }
    // Re-throw other errors
    throw error;
  }
}

/* ================= START ================= */

bot.start((ctx) => {
  const isUserAdmin = checkAdmin(ctx.from?.id?.toString() || "");

  const keyboard = [
    [{ text: "📚 Notes", callback_data: "notes" }],
    [{ text: "📝 PYQs", callback_data: "pyqs" }],
    [{ text: "📘 Syllabus", callback_data: "syllabus" }],
    [{ text: "🧮 CGPA Calculator", callback_data: "cgpa" }],
  ];

  if (isUserAdmin) {
    keyboard.push([{ text: "🔧 Admin Panel", callback_data: "admin_panel" }]);
  }

  ctx.reply("👋 Welcome to Makaut Buddy!\n\nChoose what you want:", {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* ================= ADMIN PANEL ================= */

bot.action("admin_panel", isAdmin, async (ctx) => {
  await ctx.answerCbQuery();

  await safeEditMessageText(ctx, "🔧 Admin Panel\n\nChoose what you want to upload:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📚 Upload Note", callback_data: "admin_upload_note" }],
        [{ text: "📝 Upload PYQ", callback_data: "admin_upload_pyq" }],
        [{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }],
      ],
    },
  });
});

bot.action("back_to_main", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  return bot.telegram.sendMessage(ctx.chat!.id, "/start");
});

/* ================= ADMIN NOTE FLOW ================= */

bot.action("admin_upload_note", isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.uploadType = "note";

  const branchButtons = BRANCHES.map((b) => [
    { text: b, callback_data: `admin_note_branch_${b}` },
  ]);

  await safeEditMessageText(ctx, "📚 Upload Note - Select Branch:", {
    reply_markup: {
      inline_keyboard: [...branchButtons, [{ text: "🔙 Back", callback_data: "admin_panel" }]],
    },
  });
});

bot.action(/admin_note_branch_(.+)/, isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.uploadBranch = ctx.match[1];

  const semesterButtons = SEMESTERS.map((s) => [
    { text: `Semester ${s}`, callback_data: `admin_note_sem_${s}` },
  ]);

  await safeEditMessageText(ctx, `📚 Branch: ${ctx.match[1]}\nSelect Semester:`, {
    reply_markup: {
      inline_keyboard: [...semesterButtons, [{ text: "🔙 Back", callback_data: "admin_upload_note" }]],
    },
  });
});

bot.action(/admin_note_sem_(.+)/, isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.uploadSemester = ctx.match[1];

  const semesterKey = `SEM${ctx.match[1]}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];

  if (subjects.length === 0) {
    ctx.reply("❌ No subjects found for this semester.");
    return;
  }

  await safeEditMessageText(ctx, "Select Subject:", {
    reply_markup: {
      inline_keyboard: [
        ...subjects.map((s: string, index: number) => [
          { 
            text: s.replace(/_/g, " "), 
            callback_data: `admin_note_subject_${ctx.match[1]}_${index}` 
          },
        ]),
        [{ text: "🔙 Back", callback_data: `admin_note_branch_${ctx.session.uploadBranch || ""}` }],
      ],
    },
  });
});

bot.action(/admin_note_subject_(.+)_(\d+)/, isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.match[1] || !ctx.match[2] || !ctx.session.uploadSemester) {
    ctx.reply("❌ Invalid subject selection.");
    return;
  }
  
  const semesterKey = `SEM${ctx.session.uploadSemester}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];
  const subjectIndex = parseInt(ctx.match[2], 10);
  
  if (subjectIndex < 0 || subjectIndex >= subjects.length) {
    ctx.reply("❌ Subject not found.");
    return;
  }
  
  ctx.session.uploadSubject = subjects[subjectIndex];
  await safeEditMessageText(ctx, "📎 Please send the PDF file.");
});

/* ================= ADMIN PYQ FLOW ================= */

bot.action("admin_upload_pyq", isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.uploadType = "pyq";

  const branchButtons = BRANCHES.map((b) => [
    { text: b, callback_data: `admin_pyq_branch_${b}` },
  ]);

  await safeEditMessageText(ctx, "📝 Upload PYQ - Select Branch:", {
    reply_markup: {
      inline_keyboard: [...branchButtons, [{ text: "🔙 Back", callback_data: "admin_panel" }]],
    },
  });
});

bot.action(/admin_pyq_branch_(.+)/, isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.uploadBranch = ctx.match[1];

  const semesterButtons = SEMESTERS.map((s) => [
    { text: `Semester ${s}`, callback_data: `admin_pyq_sem_${s}` },
  ]);

  await safeEditMessageText(ctx, `📝 Branch: ${ctx.match[1]}\nSelect Semester:`, {
    reply_markup: {
      inline_keyboard: [...semesterButtons, [{ text: "🔙 Back", callback_data: "admin_upload_pyq" }]],
    },
  });
});

bot.action(/admin_pyq_sem_(.+)/, isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.uploadSemester = ctx.match[1];

  const semesterKey = `SEM${ctx.match[1]}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];

  if (subjects.length === 0) {
    ctx.reply("❌ No subjects found for this semester.");
    return;
  }

  await safeEditMessageText(ctx, "Select Subject:", {
    reply_markup: {
      inline_keyboard: [
        ...subjects.map((s: string, index: number) => [
          { 
            text: s.replace(/_/g, " "), 
            callback_data: `admin_pyq_subject_${ctx.match[1]}_${index}` 
          },
        ]),
        [{ text: "🔙 Back", callback_data: `admin_pyq_branch_${ctx.session.uploadBranch || ""}` }],
      ],
    },
  });
});

bot.action(/admin_pyq_subject_(.+)_(\d+)/, isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.match[1] || !ctx.match[2] || !ctx.session.uploadSemester) {
    ctx.reply("❌ Invalid subject selection.");
    return;
  }
  
  const semesterKey = `SEM${ctx.session.uploadSemester}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];
  const subjectIndex = parseInt(ctx.match[2], 10);
  
  if (subjectIndex < 0 || subjectIndex >= subjects.length) {
    ctx.reply("❌ Subject not found.");
    return;
  }
  
  ctx.session.uploadSubject = subjects[subjectIndex];
  ctx.reply("📅 Enter year (e.g. 2023)");
});

/* ================= YEAR + FILE HANDLING ================= */

bot.on("text", async (ctx, next) => {
  if (
    checkAdmin(ctx.from?.id?.toString() || "") &&
    ctx.session.uploadType === "pyq" &&
    ctx.session.uploadSubject &&
    !ctx.session.uploadYear
  ) {
    ctx.session.uploadYear = ctx.message.text.trim();
    ctx.reply("📎 Please upload the PDF.");
    return;
  }

  return next();
});

bot.on("document", async (ctx) => {
  if (!checkAdmin(ctx.from?.id?.toString() || "")) return;

  if (!ctx.session.uploadType) {
    ctx.reply("❌ Start upload from admin panel.");
    return;
  }

  const doc = ctx.message.document;

  if (doc.mime_type !== "application/pdf") {
    ctx.reply("❌ Only PDF allowed.");
    return;
  }

  ctx.reply("⏳ Uploading...");

  if (ctx.session.uploadType === "note") {
    await uploadHandler.uploadNote(
      ctx,
      ctx.session.uploadBranch!,
      ctx.session.uploadSemester!,
      ctx.session.uploadSubject!,
      doc.file_id,
      doc.file_name || "file.pdf"
    );
  }

  if (ctx.session.uploadType === "pyq") {
    await uploadHandler.uploadPyq(
      ctx,
      ctx.session.uploadBranch!,
      ctx.session.uploadSemester!,
      ctx.session.uploadSubject!,
      ctx.session.uploadYear!,
      doc.file_id,
      doc.file_name || "file.pdf"
    );
  }

  ctx.session = {};
});

/* ================= USER FLOWS (unchanged) ================= */

// NOTES, PYQ VIEW, SYLLABUS FLOWS REMAIN EXACTLY SAME AS YOUR CODE

bot.launch();
console.log("Makaut Buddy is LIVE 🚀");
