import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smas';
  await mongoose.connect(uri, {
    // Small instance: a modest pool avoids exhausting Atlas free-tier
    // connection limits while still allowing parallel queries.
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });
  console.log('MongoDB connected');
}

export default mongoose;
