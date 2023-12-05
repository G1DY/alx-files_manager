import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const { email } = req.body;
    const { password } = req.body;
    if (!email) return res.status(400).send({ error: 'Missing email' });
    if (!password) return res.status(400).send({ error: 'Missing password' });

    const users = dbClient.db.collection('users');

    const user = await users.findOne({ email });
    if (user) return res.status(400).send({ error: 'Already exist' });

    const hashPwd = createHash('sha1').update(password).digest('hex');
    const newUser = await users.insertOne({ email, password: hashPwd });
    const json = {
      id: newUser.insertedId,
      email,
    };
    return res.status(201).send(json);
  }

  static async getMe(req, res) {
    const authToken = req.header('X-Token') || null;
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const token = `auth_${authToken}`;
    const user = await redisClient.get(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const users = dbClient.db.collection('users');
    const userDetail = await users.findOne({ _id: ObjectId(user) });
    if (userDetail) {
      return res.status(200).json({ id: user, email: userDetail.email });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default UsersController;
