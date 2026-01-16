import mongoose from "mongoose";
import { BRANCHES , SEMESTERS } from "./enums";

const pyqSchema = new mongoose.Schema({
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
  year: {
    type: String,
    required: true,
  },
  files: [
    {
      name: String,
      link: String,
    },
  ],
});

export default mongoose.model("Pyq", pyqSchema);

