import { Schema } from 'mongoose';

export const CounterSchema = new Schema({
  _id: { type: String },
  sequence: { type: Number, default: 0 },
}, { versionKey: false });
