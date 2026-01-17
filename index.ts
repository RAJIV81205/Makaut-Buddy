import dotenv from "dotenv";
dotenv.config();

import { Telegraf, session } from "telegraf";
import { Redis } from "@telegraf/session/redis";
import connectDB from "./lib/db.js";

// Session interface
interface SessionData {
  branch?: string;
  semester?: string;
  subject?: string;
  pyq_branch?: string;
  pyq_sem?: string;
}

// MODELS
import Note from "./lib/models/Note.js";
import Pyq from "./lib/models/Pyq.js";
import Syllabus from "./lib/models/Syllabus.js";

// BOT
const bot = new Telegraf(process.env.BOT_TOKEN!);

// SESSION with Redis
const store = Redis<SessionData>({ url: process.env.REDIS_URL! });
bot.use(session({
  store,
  defaultSession: () => ({})
}));


// MONGO CONNECT
connectDB();

const ADMINS = process.env.ADMINS?.split(",") || [];

/* -----------------------------
          START MENU
------------------------------*/
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome to Makaut Buddy!\n\nChoose what you want:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📚 Notes", callback_data: "notes" }],
          [{ text: "📝 PYQs", callback_data: "pyqs" }],
          [{ text: "📘 Syllabus", callback_data: "syllabus" }],
          [{ text: "🧮 CGPA Calculator", callback_data: "cgpa" }],
          [{ text: "🔍 Search", callback_data: "search" }],
        ],
      },
    }
  );
});

/* -----------------------------
       NOTES FLOW
------------------------------*/

// Notes → Branch
bot.action("notes", (ctx) => {
  ctx.reply("Choose Branch:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "CSE", callback_data: "notes_branch_CSE" },
        { text: "IT", callback_data: "notes_branch_IT" }],
        [{ text: "ECE", callback_data: "notes_branch_ECE" },
        { text: "ME", callback_data: "notes_branch_ME" }],
        [{ text: "EE", callback_data: "notes_branch_EE" },
        { text: "CE", callback_data: "notes_branch_CE" }],
        [{ text: "BCA", callback_data: "notes_branch_BCA" },
        { text: "⬅ Back", callback_data: "start" }],
      ],
    },
  });
});

// Branch → Semester
bot.action(/notes_branch_(.*)/, (ctx) => {
  const branch = ctx.match[1];
  ctx.session.branch = branch;

  ctx.reply(`Branch: ${branch}\nChoose Semester:`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1", callback_data: "notes_sem_1" },
          { text: "2", callback_data: "notes_sem_2" },
          { text: "3", callback_data: "notes_sem_3" },
          { text: "4", callback_data: "notes_sem_4" },
        ],
        [
          { text: "5", callback_data: "notes_sem_5" },
          { text: "6", callback_data: "notes_sem_6" },
          { text: "7", callback_data: "notes_sem_7" },
          { text: "8", callback_data: "notes_sem_8" },
        ],
      ],
    },
  });
});

// Semester → Subjects
bot.action(/notes_sem_(.*)/, async (ctx) => {
  const sem = ctx.match[1];
  ctx.session.semester = sem;

  const subjects = await Note.find({
    branch: ctx.session.branch,
    semester: sem,
  }).distinct("subject");

  if (!subjects.length)
    return ctx.reply("❌ No subjects available.");

  ctx.reply("Choose Subject:", {
    reply_markup: {
      inline_keyboard: subjects.map((s) => [
        { text: s, callback_data: `notes_sub_${s}` },
      ]),
    },
  });
});

// Subject → Send PDFs
bot.action(/notes_sub_(.*)/, async (ctx) => {
  const subject = ctx.match[1];

  const data = await Note.findOne({
    branch: ctx.session.branch,
    semester: ctx.session.semester,
    subject,
  });

  if (!data) return ctx.reply("❌ No notes found.");

  for (let file of data.files) {
    if (file.link) {
      await ctx.replyWithDocument(file.link);
    }
  }
});

/* -----------------------------
          PYQ FLOW
------------------------------*/

bot.action("pyqs", (ctx) => {
  ctx.reply("Choose Branch:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "CSE", callback_data: "pyq_branch_CSE" }],
        [{ text: "IT", callback_data: "pyq_branch_IT" }],
        [{ text: "ECE", callback_data: "pyq_branch_ECE" }],
        [{ text: "ME", callback_data: "pyq_branch_ME" }],
        [{ text: "⬅ Back", callback_data: "start" }],
      ],
    },
  });
});

bot.action(/pyq_branch_(.*)/, (ctx) => {
  const branch = ctx.match[1];
  ctx.session.pyq_branch = branch;

  ctx.reply("Choose Semester:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1", callback_data: "pyq_sem_1" },
          { text: "2", callback_data: "pyq_sem_2" },
          { text: "3", callback_data: "pyq_sem_3" },
          { text: "4", callback_data: "pyq_sem_4" },
        ],
        [
          { text: "5", callback_data: "pyq_sem_5" },
          { text: "6", callback_data: "pyq_sem_6" },
          { text: "7", callback_data: "pyq_sem_7" },
          { text: "8", callback_data: "pyq_sem_8" },
        ],
      ],
    },
  });
});

bot.action(/pyq_sem_(.*)/, async (ctx) => {
  const sem = ctx.match[1];
  ctx.session.pyq_sem = sem;

  const subjects = await Pyq.find({
    branch: ctx.session.pyq_branch,
    semester: sem,
  }).distinct("subject");

  if (!subjects.length) return ctx.reply("❌ No PYQs yet.");

  ctx.reply("Choose Subject:", {
    reply_markup: {
      inline_keyboard: subjects.map((s) => [
        { text: s, callback_data: `pyq_sub_${s}` },
      ]),
    },
  });
});

bot.action(/pyq_sub_(.*)/, async (ctx) => {
  const subject = ctx.match[1];

  const data = await Pyq.find({
    branch: ctx.session.pyq_branch,
    semester: ctx.session.pyq_sem,
    subject,
  });

  if (!data.length) return ctx.reply("❌ No PYQs found.");

  for (let item of data)
    for (let file of item.files)
      if (file.link) {
        await ctx.replyWithDocument(file.link);
      }
});

/* -----------------------------
       SYLLABUS FLOW
------------------------------*/

bot.action("syllabus", (ctx) => {
  ctx.reply("Choose Branch:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "CSE", callback_data: "syl_CSE" }],
        [{ text: "IT", callback_data: "syl_IT" }],
        [{ text: "ECE", callback_data: "syl_ECE" }],
        [{ text: "ME", callback_data: "syl_ME" }],
        [{ text: "BCA", callback_data: "syl_BCA" }],
      ],
    },
  });
});

bot.action(/syl_(.*)/, async (ctx) => {
  const branch = ctx.match[1];

  const syl = await Syllabus.findOne({ branch });
  if (!syl || !syl.link) return ctx.reply("❌ Syllabus not uploaded.");

  ctx.replyWithDocument(syl.link);
});

/* -----------------------------
       FALLBACK MESSAGE
------------------------------*/
bot.on("message", (ctx) => {
  ctx.reply("Please use the buttons 🙂");
});

/* -----------------------------
        LAUNCH BOT
------------------------------*/
bot.launch();
console.log("Makaut Buddy is LIVE 🚀");
