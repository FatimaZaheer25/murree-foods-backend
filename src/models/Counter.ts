import { Schema, model } from "mongoose";

// Lagataar numbers (MF-10001, MF-10002 ...). $inc ek hi qadam mein hota hai, is liye do orders ko kabhi ek number nahi milta
const counterSchema = new Schema<{ _id: string; seq: number }>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = model("Counter", counterSchema);

export const nextSequence = async (name: string) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  ).orFail();
  return counter.seq;
};
