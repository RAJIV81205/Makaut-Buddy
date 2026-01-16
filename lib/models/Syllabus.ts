import mongoose from "mongoose";
import { BRANCHES , SEMESTERS } from "./enums";


const syllabusSchema = new mongoose.Schema({
  branch: {
    type: String,
    enum: BRANCHES,
    required: true,
  },
  semester: {
    type: Number,
    enum: SEMESTERS,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
});

export default mongoose.model("Syllabus", syllabusSchema);
