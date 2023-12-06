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
    const user = await FilesController.getUserBasedOnToken(req);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    // check the req body properties for creating the file
    const typesOfDocs = ['folder', 'file', 'image'];
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
    if (!name) return res.status(400).send({ error: 'Missing name' });
    if (!type || !typesOfDocs.includes(type)) return res.status(400).send({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).send({ error: 'Missing data' });

    const files = dbClient.db.collection('files');

    // check if the parentId is present
    if (parentId) {
      const parent = await files.findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).send({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });
    }

    // create file
    const newFile = {
      userId: user._id.toString(),
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId || 0,
    };

    if (type === 'folder') {
      const result = await files.insertOne(newFile);
      newFile.id = result.insertedId;
      delete newFile._id;
      res.setHeader('Content-Type', 'application/json');
      return res.status(201).json({ ...newFile });
    }

    // store locally and add local path
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileName = uuidv4();
    const buff = Buffer.from(data, 'base64');
    const localPath = `${folderPath}/${fileName}`;

    // create directory if not exists
    await fs.mkdir(folderPath, { recursive: true }, (err) => {
      if (err) return res.status(400).send({ error: err.message });
      return true;
    });

    await fs.writeFile(localPath, buff, (err) => {
      if (err) return res.status(400).send({ error: err.message });
      return true;
    });

    const result = await files.insertOne(newFile);

    newFile.id = result.insertedId;
    delete newFile._id;
    delete newFile.localPath;

    if (newFile.type === 'image') fileQueue.add({ userId: newFile.userId, fileId: newFile.id });

    return res.status(201).send({ ...newFile });
  }

  static async getShow(req, res) {
    const { id } = req.params;

    const user = await this.getUserBasedOnToken(req);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    // get the file id
    const files = dbClient.db.collection('files');
    const file = await files.findOne({ _id: ObjectId(id), userId: user._id });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }
    file.id = file._id;
    delete file._id;
    delete file.localPath;
    return res.status(200).send(file);
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

  // helper functions
  static async getUserBasedOnToken(req) {
    // retrives user using the token given
    const token = req.header('X-Token') || null;
    if (!token) return null;

    const authToken = await redisClient.get(`auth_${token}`);
    if (!authToken) return null;

    const user = await dbClient.db.collection('users').findOne({
      _id: ObjectId(authToken),
    });
    if (!user) return null;
    return user;
  }
}

export default FilesController;
