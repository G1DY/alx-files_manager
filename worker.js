import Queue from 'bull';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import imageThumbnail from 'image-thumbnail';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue', {
  redis: { host: '127.0.0.1', port: 6379 },
});

const generateThumbnails = async (path, options) => {
  try {
    const thumbnail = await imageThumbnail(path, options);
    const pathNail = `${path}_${options.width}`;

    await fs.writeFileSync(pathNail, thumbnail);
  } catch (err) {
    console.log(err);
  }
};

fileQueue.process(async (job) => {
  const { fileId } = job.data;
  if (!fileId) throw Error('Missing fileId');

  const { userId } = job.data;
  if (!userId) throw Error('Missing userId');

  const fileDoc = await dbClient.db.colllection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
  if (!fileDoc) throw Error('File not found');

  generateThumbnails(fileDoc.localPath, { width: 500 });
  generateThumbnails(fileDoc.localPath, { width: 250 });
  generateThumbnails(fileDoc.localPath, { width: 100 });
});
