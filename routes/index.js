/* eslint-disable quotes */
/* eslint-disable import/extensions */
import { Express } from "express";
import AppController from "../controllers/AppController";
import UsersController from "../controllers/UsersController";
// import { APIError, errorResponse } from "../middlewares/error";

const injectRoutes = (api) => {
  api.get("/status", AppController.getStatus);
  api.get("/stats", AppController.getStats);

  api.post("/users", UsersController.postNew);
};

export default injectRoutes;
