import { ObjectId } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const fileQueue = new Queue('fileQueue', {
      redis: {
        host: '127.0.0.1',
        port: 6379,
      },
    });
    // check user by token
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const authToken = await redisClient.get(`auth_${token}`);
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(authToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // // check the req body properties for creating the file
    const typesOfDocs = ['folder', 'file', 'image'];
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !typesOfDocs.includes(type)) return res.status(400).json({ error: 'Missing type' });
    if (!data && ['file', 'image'].includes(type)) return res.status(400).json({ error: 'Missing data' });

    // // check if the parentId is present
    const files = dbClient.db.collection('files');
    if (parentId) {
      const parentFile = await files.findOne({ _id: ObjectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    // // create file
    const newFile = {
      userId: user._id,
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId || 0,
    };

    if (type === 'folder') {
      const result = await files.insertOne(newFile);
      return res.status(201).json({ id: result.insertedId, ...newFile });
    }

    // store locally and add local path
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileName = uuidv4();
    const buff = Buffer.from(newFile, 'base64');
    const localPath = `${folderPath}/${fileName}`;

    await fs.mkdir(folderPath, { recursive: true }, (error) => {
      if (error) return res.status(400).send({ error: error.message });
      return true;
    });

    await fs.writeFile(localPath, buff, (error) => {
      if (error) return res.status(400).send({ error: error.message });
      return true;
    });

    newFile.localPath = localPath;

    await files.insertOne(newFile);

    if (newFile.type === 'image') fileQueue.add({ userId: newFile.userId, fileId: newFile._id });

    return res.status(201).json({ id: newFile._id, ...newFile });
  }

  static async getShow(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const authToken = await redisClient.get(`auth_${token}`);
    if (!authToken) return res.status(401).send({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(authToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // get the file id
    const fileId = req.params.id || '';
    const fileDoc = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: user._id });
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(fileDoc);
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const authToken = await redisClient.get(`auth_${token}`);
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const user = dbClient.db.collection('users').findOne({ _id: ObjectId(authToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // get the query params and find the all files with pagination
    const { parentId, page } = req.query;
    const parent = parentId || 0;
    const limit = 20;
    const skip = page ? page * limit : 0;

    const aggregationMatch = { $and: [{ parent }] };
    let aggregateData = [{ $match: aggregationMatch }, { $skip: skip }, { $limit: limit }];
    if (parent === 0) aggregateData = [{ $skip: skip }, { $limit: limit }];

    const files = dbClient.db.collection('files');

    const fileDocs = await files.aggregate(aggregateData);
    const filesArray = [];
    await fileDocs.forEach((item) => filesArray.push(item));

    return res.json(filesArray);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const authToken = await redisClient.get(`auth_${token}`);
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const user = dbClient.db.collection('users').findOne({ _id: ObjectId(authToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const files = dbClient.db.collection('files');
    const fileId = req.params.id || '';
    let fileDoc = await files.findOne({ _id: ObjectId(fileId), userId: user._id });
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });

    await files.update({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });
    fileDoc = files.findOne({ _id: ObjectId(fileId), userId: user._id });

    return res.status(200).json(fileDoc);
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const authToken = await redisClient.get(`auth_${token}`);
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const user = dbClient.db.collection('users').findOne({ _id: ObjectId(authToken) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const files = dbClient.db.collection('files');
    const fileId = req.params.id || '';
    let fileDoc = await files.findOne({ _id: ObjectId(fileId), userId: user._id });
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });

    await files.update({ _id: ObjectId(fileId), userId: user._id }, { $set: { isPublic: false } });
    fileDoc = files.findOne({ _id: ObjectId(fileId), userId: user._id });

    return res.status(200).json(fileDoc);
  }

  static async getFile(req, res) {
    const fileId = req.params.id || '';
    const size = req.query.size || 0;

    const files = dbClient.db.collection('files');

    const fileDoc = await files.findOne({ _id: ObjectId(fileId) });
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });

    const { isPublic, userId, type } = fileDoc;

    let user = null;
    let owner = false;

    const token = req.header('X-Token') || null;
    if (token) {
      const authToken = await redisClient.get(`auth_${token}`);
      if (authToken) {
        user = await dbClient.db.collection('users').findOne({ _id: ObjectId(authToken) });
        if (user) owner = user._id.toString() === userId.toString();
      }
    }

    if (!isPublic && !owner) return res.status(404).json({ error: 'Not found' });
    if (['folder'].includes(type)) return res.status(400).json({ error: 'A folder doesn\'t have content' });

    const filePath = size === 0 ? fileDoc.localPath : `${fileDoc.localPath}_${size}`;

    try {
      const dataFile = fs.readFileSync(filePath);
      const mimeType = mime.contentType(fileDoc.name);
      res.setHeader('Content-Type', mimeType);
      return res.json(dataFile);
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
