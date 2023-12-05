import { Express } from "express";
import AppController from "../controllers/AppController";
import { APIError, errorResponse } from "../middlewares/error";

const injectRoutes = (api) => {
  api.get("/status", AppController.getStatus);
  api.get("/stats", AppController.getStats);
};

export default injectRoutes;
