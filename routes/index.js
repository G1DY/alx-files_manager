/* eslint-disable comma-dangle */
/* eslint-disable quotes */
/* eslint-disable import/extensions */
// eslint-disable-next-line no-unused-vars
import { Express } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';
import { basicAutheticate, xTokenAutheticate } from '../middlewares/auth';
import { APIError, errorResponse } from '../middlewares/error';

const injectRoutes = (api) => {
  api.get('/status', AppController.getStatus);
  api.get('/stats', AppController.getStats);

  api.post('/users', UsersController.postNew);
  api.get('/users/me', xTokenAutheticate, UsersController.getMe);

  api.get('/connect', basicAutheticate, AuthController.getConnect);
  api.get('/disconnect', AuthController.getDisconnect);

  api.post('/files', xTokenAutheticate, FilesController.postUpload);
  api.get('/files/:id', xTokenAutheticate, FilesController.getShow);
  api.get('/files', xTokenAutheticate, FilesController.getIndex);
  api.put('/files/:id/publish', xTokenAutheticate, FilesController.putPublish);
  api.put(
    '/files/:id/unpublish',
    xTokenAutheticate,
    FilesController.putUnpublish
  );
  api.get('/files:id/data', FilesController.getFile);

  api.all('*', (req, res, next) => {
    errorResponse(
      new APIError(404, `Cannot ${req.method} ${req.url}`),
      req,
      res,
      next
    );
  });
  api.use(errorResponse);
};

export default injectRoutes;
