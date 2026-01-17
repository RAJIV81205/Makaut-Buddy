import { serve } from "bun";
import dotenv from "dotenv";

import connectDB from "./lib/db.js";
import Note from "./lib/models/Note.js";
import Pyq from "./lib/models/Pyq.js";
import { BRANCHES, SEMESTERS, SUBJECTS } from "./lib/models/enums.js";

dotenv.config();

/* ---------------- DATABASE ---------------- */

connectDB();

/* ---------------- SHARED SAVE LOGIC ---------------- */

async function saveToBothBranches(
  Model: any,
  branches: string[],
  semester: string,
  subject: string,
  fileData: { name: string; link: string },
  extra?: Record<string, any>
) {
  await Promise.all(
    branches.map(async (branch) => {
      const query: any = { branch, semester, subject, ...extra };

      const doc =
        (await Model.findOne(query)) ||
        new Model({ ...query, files: [] });

      if (!doc.files.some((f: any) => f.link === fileData.link)) {
        doc.files.push(fileData);
        await doc.save();
      }
    })
  );
}

/* ---------------- BATCH NOTES ---------------- */

async function batchUploadNotes(
  links: string[],
  branch: string,
  semester: string,
  subject: string
) {
  const results = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const fileName = `${subject}_Note_${i + 1}`;
    
    if (!link) {
      failed++;
      results.push({ fileName, success: false, error: "Invalid link" });
      continue;
    }
    
    try {
      const fileData = { name: fileName, link };

      if (branch === "CSE" || branch === "IT") {
        await saveToBothBranches(
          Note,
          ["CSE", "IT"],
          semester,
          subject,
          fileData
        );
      } else {
        const note =
          (await Note.findOne({ branch, semester, subject })) ||
          new Note({ branch, semester, subject, files: [] });

        if (!note.files.some((f: any) => f.link === link)) {
          note.files.push(fileData);
          await note.save();
        }
      }

      successful++;
      results.push({ fileName, success: true });
    } catch (err: any) {
      failed++;
      console.error(`Error saving ${fileName}:`, err);
      results.push({ fileName, success: false, error: err.message });
    }
  }

  return { results, total: links.length, successful, failed };
}

/* ---------------- BATCH PYQs ---------------- */

async function batchUploadPyqs(
  links: string[],
  branch: string,
  semester: string,
  subject: string,
  year: string
) {
  const results = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const fileName = `${subject}_${year}_PYQ_${i + 1}`;
    
    if (!link) {
      failed++;
      results.push({ fileName, success: false, error: "Invalid link" });
      continue;
    }
    
    try {
      const fileData = { name: fileName, link };

      if (branch === "CSE" || branch === "IT") {
        await saveToBothBranches(
          Pyq,
          ["CSE", "IT"],
          semester,
          subject,
          fileData,
          { year }
        );
      } else {
        const pyq =
          (await Pyq.findOne({ branch, semester, subject, year })) ||
          new Pyq({ branch, semester, subject, year, files: [] });

        if (!pyq.files.some((f: any) => f.link === link)) {
          pyq.files.push(fileData);
          await pyq.save();
        }
      }

      successful++;
      results.push({ fileName, success: true });
    } catch (err: any) {
      failed++;
      console.error(`Error saving ${fileName}:`, err);
      results.push({ fileName, success: false, error: err.message });
    }
  }

  return { results, total: links.length, successful, failed };
}

/* ---------------- CORS ---------------- */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* ---------------- SERVER ---------------- */

serve({
  port: process.env.PORT || 3000,

  async fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const file = Bun.file("./public/index.html");
      return new Response(file);
    }

    if (req.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });

    /* ---------- GET ENUMS ---------- */

    if (url.pathname === "/api/branches")
      return Response.json({ branches: BRANCHES }, { headers: corsHeaders });

    if (url.pathname === "/api/semesters")
      return Response.json({ semesters: SEMESTERS }, { headers: corsHeaders });

    if (url.pathname === "/api/subjects") {
      const sem = url.searchParams.get("semester");
      const subjects = SUBJECTS[`SEM${sem}` as keyof typeof SUBJECTS] || [];
      return Response.json({ subjects }, { headers: corsHeaders });
    }

    /* ---------- UPLOAD NOTES ---------- */

    if (url.pathname === "/api/upload/notes" && req.method === "POST") {
      try {
        const body = await req.json();
        const { branch, semester, subject, links }:any = body;

        if (!links || !Array.isArray(links) || links.length === 0) {
          return Response.json(
            { success: false, error: "No links provided" },
            { status: 400, headers: corsHeaders }
          );
        }

        if (!branch || !semester || !subject) {
          return Response.json(
            { success: false, error: "Missing required fields" },
            { status: 400, headers: corsHeaders }
          );
        }

        console.log(`📚 Saving ${links.length} note links for ${branch} - Sem ${semester} - ${subject}`);

        const result = await batchUploadNotes(links, branch, semester, subject);

        return Response.json(
          { success: true, ...result },
          { headers: corsHeaders }
        );
      } catch (error: any) {
        console.error("Upload error:", error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    /* ---------- UPLOAD PYQS ---------- */

    if (url.pathname === "/api/upload/pyqs" && req.method === "POST") {
      try {
        const body = await req.json();
        const { branch, semester, subject, year, links }:any = body;

        if (!links || !Array.isArray(links) || links.length === 0) {
          return Response.json(
            { success: false, error: "No links provided" },
            { status: 400, headers: corsHeaders }
          );
        }

        if (!branch || !semester || !subject || !year) {
          return Response.json(
            { success: false, error: "Missing required fields" },
            { status: 400, headers: corsHeaders }
          );
        }

        console.log(`📝 Saving ${links.length} PYQ links for ${branch} - Sem ${semester} - ${subject} - ${year}`);

        const result = await batchUploadPyqs(links, branch, semester, subject, year);

        return Response.json(
          { success: true, ...result },
          { headers: corsHeaders }
        );
      } catch (error: any) {
        console.error("Upload error:", error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("🚀 Server running on http://localhost:3000");
