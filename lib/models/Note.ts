import mongoose from "mongoose";
import { BRANCHES , SEMESTERS } from "./enums";

const noteSchema = new mongoose.Schema({
  branch: {
    type: String,
    enum: BRANCHES,
    required: true,
  },
  semester: {
    type: String,
    enum: SEMESTERS,
    required: true,
  },
  subject: {
    type: String,
    required: true,
    uppercase: true,
  },
  files: [
    {
      name: String,
      link: String,
    },
  ],
});

module.exports = mongoose.model("Note", noteSchema);
