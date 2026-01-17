import { serve } from "bun";
import dotenv from "dotenv";
import streamifier from "streamifier";
import { v2 as cloudinary } from "cloudinary";

import connectDB from "./lib/db.js";
import Note from "./lib/models/Note.js";
import Pyq from "./lib/models/Pyq.js";
import { BRANCHES, SEMESTERS, SUBJECTS } from "./lib/models/enums.js";

dotenv.config();

/* ---------------- CLOUDINARY CONFIG ---------------- */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

/* ---------------- DATABASE ---------------- */

connectDB();

/* ---------------- CLOUDINARY UPLOAD ---------------- */

async function uploadFileToCloudinary(
  file: File,
  fileName: string,
  folder: string
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder,
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result!.secure_url);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

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
  files: File[],
  branch: string,
  semester: string,
  subject: string
) {
  const results = [];

  for (const file of files) {
    try {
      const link = await uploadFileToCloudinary(
        file,
        `${branch}_${semester}_${subject}_${file.name}`,
        `notes/${branch}/${semester}`
      );

      const fileData = { name: file.name, link };

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

      results.push({ file: file.name, success: true });
    } catch (err: any) {
      results.push({ file: file.name, success: false, error: err.message });
    }
  }

  return results;
}

/* ---------------- BATCH PYQs ---------------- */

async function batchUploadPyqs(
  files: File[],
  branch: string,
  semester: string,
  subject: string,
  year: string
) {
  const results = [];

  for (const file of files) {
    try {
      const link = await uploadFileToCloudinary(
        file,
        `${branch}_${semester}_${subject}_${year}_${file.name}`,
        `pyqs/${branch}/${semester}`
      );

      const fileData = { name: `${subject}_${year}`, link };

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

      results.push({ file: file.name, success: true });
    } catch (err: any) {
      results.push({ file: file.name, success: false, error: err.message });
    }
  }

  return results;
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
      const form = await req.formData();
      const files = form.getAll("files") as File[];

      const results = await batchUploadNotes(
        files,
        form.get("branch") as string,
        form.get("semester") as string,
        form.get("subject") as string
      );

      return Response.json({ success: true, results }, { headers: corsHeaders });
    }

    /* ---------- UPLOAD PYQS ---------- */

    if (url.pathname === "/api/upload/pyqs" && req.method === "POST") {
      const form = await req.formData();
      const files = form.getAll("files") as File[];

      const results = await batchUploadPyqs(
        files,
        form.get("branch") as string,
        form.get("semester") as string,
        form.get("subject") as string,
        form.get("year") as string
      );

      return Response.json({ success: true, results }, { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("🚀 Server running on http://localhost:3000");
