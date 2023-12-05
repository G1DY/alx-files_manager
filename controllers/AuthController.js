import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class Authorization {
  static async getConnect(req, res) {
    const authToken = req.header('Authorization') || null;
    if (!authToken) res.status(401).json({ error: 'Unauthorized' });

    const authTokenDecoded = Buffer.from(authToken.split(' ')[1], 'base64').toString('utf8');
    const [email, password] = authTokenDecoded.split(':');
    if (!email || !password) res.status(401).json({ error: 'Unauthorized' });

    const hashPwd = createHash('sha1').update(password).digest('hex');
    const users = dbClient.db.collection('users');
    const user = await users.findOne({ email, password: hashPwd });
    if (user) {
      const token = uuidv4();
      const key = `auth_${token}`;
      await redisClient.set(key, user._id.toString(), 86400);
      res.status(200).send({ token });
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }

  static async getDisconnect(req, res) {
    let authToken = req.header('X-Token') || null;
    if (!authToken) res.status(401).json({ error: 'Unauthorized' });
    authToken = `auth_${authToken}`;

    const user = await redisClient.get(authToken);
    if (user) {
      await redisClient.del(authToken);
      res.status(204).send();
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

export default Authorization;
