import dotenv from "dotenv";
dotenv.config();

import express from "express";

import { Telegraf, session } from "telegraf";
import { Redis } from "@telegraf/session/redis";
import connectDB from "./lib/db.js";
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
  cgpaGrades?: Record<string, number>;
}

const PORT = 3002

const app = express();
app.use(express.json());

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


  const keyboard = [
    [{ text: "📚 Notes", callback_data: "notes" }],
    [{ text: "📝 PYQs", callback_data: "pyqs" }],
    [{ text: "📘 Syllabus", callback_data: "syllabus" }],
    [{ text: "🧮 CGPA Calculator", callback_data: "cgpa" }],
  ];

  ctx.reply("👋 Welcome to Makaut Buddy!\n\nChoose what you want:", {
    reply_markup: { inline_keyboard: keyboard },
  });
});


/* ================= USER FLOWS ================= */

/* ================= NOTES FLOW ================= */

bot.action("notes", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.branch = undefined;
  ctx.session.semester = undefined;
  ctx.session.subject = undefined;

  const branchButtons = BRANCHES.map((b) => [
    { text: b, callback_data: `note_branch_${b}` },
  ]);

  await safeEditMessageText(ctx, "📚 Notes\n\nSelect Branch:", {
    reply_markup: {
      inline_keyboard: [...branchButtons, [{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }]],
    },
  });
});

bot.action(/note_branch_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.branch = ctx.match[1];

  const semesterButtons = SEMESTERS.map((s) => [
    { text: `Semester ${s}`, callback_data: `note_sem_${s}` },
  ]);

  await safeEditMessageText(ctx, `📚 Branch: ${ctx.match[1]}\nSelect Semester:`, {
    reply_markup: {
      inline_keyboard: [...semesterButtons, [{ text: "🔙 Back", callback_data: "notes" }]],
    },
  });
});

bot.action(/note_sem_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.semester = ctx.match[1];

  const semesterKey = `SEM${ctx.match[1]}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];

  if (subjects.length === 0) {
    await ctx.reply("❌ No subjects found for this semester.");
    return;
  }

  await safeEditMessageText(ctx, "Select Subject:", {
    reply_markup: {
      inline_keyboard: [
        ...subjects.map((s: string, index: number) => [
          {
            text: s.replace(/_/g, " "),
            callback_data: `note_subject_${ctx.match[1]}_${index}`,
          },
        ]),
        [{ text: "🔙 Back", callback_data: `note_branch_${ctx.session.branch || ""}` }],
      ],
    },
  });
});

bot.action(/note_subject_(.+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.match[1] || !ctx.match[2] || !ctx.session.branch || !ctx.session.semester) {
    await ctx.reply("❌ Invalid selection.");
    return;
  }

  const semesterKey = `SEM${ctx.session.semester}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];
  const subjectIndex = parseInt(ctx.match[2], 10);

  if (subjectIndex < 0 || subjectIndex >= subjects.length) {
    await ctx.reply("❌ Subject not found.");
    return;
  }

  const subject = subjects[subjectIndex];
  if (!subject || !ctx.session.branch || !ctx.session.semester) {
    await ctx.reply("❌ Invalid selection.");
    return;
  }

  const note = await Note.findOne({
    branch: ctx.session.branch,
    semester: ctx.session.semester,
    subject: subject.toUpperCase(),
  });

  if (!note || !note.files || note.files.length === 0) {
    await safeEditMessageText(
      ctx,
      `❌ No notes available for:\n\n📚 ${ctx.session.branch}\n📖 Sem ${ctx.session.semester}\n📝 ${subject.replace(/_/g, " ")}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Back", callback_data: `note_sem_${ctx.session.semester}` }]],
        },
      }
    );
    return;
  }

  let message = `📚 Notes Available\n\n📚 Branch: ${ctx.session.branch}\n📖 Semester: ${ctx.session.semester}\n📝 Subject: ${subject.replace(/_/g, " ")}\n\n📄 Files:\n\n`;

  note.files.forEach((file: any, index: number) => {
    message += `${index + 1}. ${file.name}\n🔗 ${file.link}\n\n`;
  });

  await safeEditMessageText(ctx, message, {
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Back", callback_data: `note_sem_${ctx.session.semester}` }]],
    },
  });
});

/* ================= PYQ FLOW ================= */

bot.action("pyqs", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.pyq_branch = undefined;
  ctx.session.pyq_sem = undefined;
  ctx.session.subject = undefined;

  const branchButtons = BRANCHES.map((b) => [
    { text: b, callback_data: `pyq_branch_${b}` },
  ]);

  await safeEditMessageText(ctx, "📝 PYQs\n\nSelect Branch:", {
    reply_markup: {
      inline_keyboard: [...branchButtons, [{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }]],
    },
  });
});

bot.action(/pyq_branch_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.pyq_branch = ctx.match[1];

  const semesterButtons = SEMESTERS.map((s) => [
    { text: `Semester ${s}`, callback_data: `pyq_sem_${s}` },
  ]);

  await safeEditMessageText(ctx, `📝 Branch: ${ctx.match[1]}\nSelect Semester:`, {
    reply_markup: {
      inline_keyboard: [...semesterButtons, [{ text: "🔙 Back", callback_data: "pyqs" }]],
    },
  });
});

bot.action(/pyq_sem_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.pyq_sem = ctx.match[1];

  const semesterKey = `SEM${ctx.match[1]}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];

  if (subjects.length === 0) {
    await ctx.reply("❌ No subjects found for this semester.");
    return;
  }

  await safeEditMessageText(ctx, "Select Subject:", {
    reply_markup: {
      inline_keyboard: [
        ...subjects.map((s: string, index: number) => [
          {
            text: s.replace(/_/g, " "),
            callback_data: `pyq_subject_${ctx.match[1]}_${index}`,
          },
        ]),
        [{ text: "🔙 Back", callback_data: `pyq_branch_${ctx.session.pyq_branch || ""}` }],
      ],
    },
  });
});

bot.action(/pyq_subject_(.+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.match[1] || !ctx.match[2] || !ctx.session.pyq_branch || !ctx.session.pyq_sem) {
    await ctx.reply("❌ Invalid selection.");
    return;
  }

  const semesterKey = `SEM${ctx.session.pyq_sem}` as keyof typeof SUBJECTS;
  const subjects: string[] = SUBJECTS[semesterKey] || [];
  const subjectIndex = parseInt(ctx.match[2], 10);

  if (subjectIndex < 0 || subjectIndex >= subjects.length) {
    await ctx.reply("❌ Subject not found.");
    return;
  }

  const subject = subjects[subjectIndex];
  if (!subject || !ctx.session.pyq_branch || !ctx.session.pyq_sem) {
    await ctx.reply("❌ Invalid selection.");
    return;
  }

  const pyqs = await Pyq.find({
    branch: ctx.session.pyq_branch,
    semester: ctx.session.pyq_sem,
    subject: subject.toUpperCase(),
  }).sort({ year: -1 });

  if (!pyqs || pyqs.length === 0) {
    await safeEditMessageText(
      ctx,
      `❌ No PYQs available for:\n\n📚 ${ctx.session.pyq_branch}\n📖 Sem ${ctx.session.pyq_sem}\n📝 ${subject.replace(/_/g, " ")}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Back", callback_data: `pyq_sem_${ctx.session.pyq_sem}` }]],
        },
      }
    );
    return;
  }

  // Group by year
  const yearButtons = pyqs.map((pyq: any) => [
    { text: `📅 ${pyq.year}`, callback_data: `pyq_year_${pyq._id}` },
  ]);

  await safeEditMessageText(
    ctx,
    `📝 PYQs Available\n\n📚 Branch: ${ctx.session.pyq_branch}\n📖 Semester: ${ctx.session.pyq_sem}\n📝 Subject: ${subject.replace(/_/g, " ")}\n\nSelect Year:`,
    {
      reply_markup: {
        inline_keyboard: [
          ...yearButtons,
          [{ text: "🔙 Back", callback_data: `pyq_sem_${ctx.session.pyq_sem}` }],
        ],
      },
    }
  );
});

bot.action(/pyq_year_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const pyqId = ctx.match[1];
  const pyq = await Pyq.findById(pyqId);

  if (!pyq || !pyq.files || pyq.files.length === 0) {
    await ctx.reply("❌ No files found for this PYQ.");
    return;
  }

  const subjectDisplay = pyq.subject ? pyq.subject.replace(/_/g, " ") : "Unknown";
  let message = `📝 PYQ Files\n\n📚 Branch: ${pyq.branch}\n📖 Semester: ${pyq.semester}\n📝 Subject: ${subjectDisplay}\n📅 Year: ${pyq.year}\n\n📄 Files:\n\n`;

  pyq.files.forEach((file: any, index: number) => {
    message += `${index + 1}. ${file.name}\n🔗 ${file.link}\n\n`;
  });

  const semesterKey = `SEM${pyq.semester}` as keyof typeof SUBJECTS;
  const subjects = SUBJECTS[semesterKey] || [];
  const subjectIndex = pyq.subject ? subjects.indexOf(pyq.subject) : -1;
  const backCallback = subjectIndex >= 0 ? `pyq_subject_${pyq.semester}_${subjectIndex}` : `pyq_sem_${pyq.semester}`;

  await safeEditMessageText(ctx, message, {
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Back", callback_data: backCallback }]],
    },
  });
});

/* ================= SYLLABUS FLOW ================= */

bot.action("syllabus", async (ctx) => {
  await ctx.answerCbQuery();

  const branchButtons = BRANCHES.map((b) => [
    { text: b, callback_data: `syllabus_branch_${b}` },
  ]);

  await safeEditMessageText(ctx, "📘 Syllabus\n\nSelect Branch:", {
    reply_markup: {
      inline_keyboard: [...branchButtons, [{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }]],
    },
  });
});

bot.action(/syllabus_branch_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const branch = ctx.match[1];

  const semesterButtons = SEMESTERS.map((s) => [
    { text: `Semester ${s}`, callback_data: `syllabus_sem_${branch}_${s}` },
  ]);

  await safeEditMessageText(ctx, `📘 Branch: ${branch}\nSelect Semester:`, {
    reply_markup: {
      inline_keyboard: [...semesterButtons, [{ text: "🔙 Back", callback_data: "syllabus" }]],
    },
  });
});

bot.action(/syllabus_sem_(.+)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.match[1] || !ctx.match[2]) {
    await ctx.reply("❌ Invalid selection.");
    return;
  }
  const branch = ctx.match[1];
  const semesterStr = ctx.match[2];
  const semester = parseInt(semesterStr, 10);

  if (isNaN(semester)) {
    await ctx.reply("❌ Invalid semester.");
    return;
  }

  const syllabus = await Syllabus.findOne({
    branch: branch,
    semester: semester as any,
  });

  if (!syllabus) {
    await safeEditMessageText(
      ctx,
      `❌ Syllabus not available for:\n\n📚 ${branch}\n📖 Semester ${semester}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Back", callback_data: `syllabus_branch_${branch}` }]],
        },
      }
    );
    return;
  }

  await safeEditMessageText(
    ctx,
    `📘 Syllabus\n\n📚 Branch: ${branch}\n📖 Semester: ${semesterStr}\n\n🔗 Link: ${syllabus.link}`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Back", callback_data: `syllabus_branch_${branch}` }]],
      },
    }
  );
});

/* ================= CGPA CALCULATOR ================= */

bot.action("cgpa", async (ctx) => {
  await ctx.answerCbQuery();

  const message = `🧮 CGPA Calculator\n\nHow to use:\n1. Send your grades in format:\n   <code>SEM1: 9.5, SEM2: 8.7, SEM3: 9.0</code>\n\n2. Or send grades one by one:\n   <code>SEM1 9.5</code>\n   <code>SEM2 8.7</code>\n\n3. Send <code>/calculate</code> to get your CGPA\n\nExample:\n<code>SEM1: 9.5, SEM2: 8.7, SEM3: 9.0, SEM4: 8.5</code>`;

  await safeEditMessageText(ctx, message, {
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }]],
    },
    parse_mode: "HTML",
  });

  // Initialize CGPA session
  if (!ctx.session.cgpaGrades) {
    ctx.session.cgpaGrades = {};
  }
});

bot.launch();
app.get("/", (req, res) => res.send("Makaut Buddy is running..."));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
console.log("Makaut Buddy is LIVE 🚀");
