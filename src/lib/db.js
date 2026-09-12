import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arena';

// Next.js hot-reloads modules in dev, so the connection is cached on globalThis
// to avoid opening a new pool on every reload.
const globalCache = globalThis.__arenaMongoose ?? { conn: null, promise: null };
globalThis.__arenaMongoose = globalCache;

export const connectDB = async () => {
  if (globalCache.conn) return globalCache.conn;

  if (!globalCache.promise) {
    mongoose.set('strictQuery', true);
    globalCache.promise = mongoose
      .connect(MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 })
      .then((m) => {
        console.log('[db] connected to MongoDB');
        return m;
      });
  }

  try {
    globalCache.conn = await globalCache.promise;
  } catch (err) {
    globalCache.promise = null;
    throw err;
  }

  return globalCache.conn;
};

export const disconnectDB = async () => {
  if (!globalCache.conn) return;
  await mongoose.disconnect();
  globalCache.conn = null;
  globalCache.promise = null;
};
