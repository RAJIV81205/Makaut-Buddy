import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config()

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI must be defined");
}


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("MongoDB connected");
  } catch (err) {
    console.error(err);
  }
};

module.exports = connectDB;
