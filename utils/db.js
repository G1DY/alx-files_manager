/* eslint-disable quotes */
import { MongoClient } from "mongodb";
import envLoader from "./env_loader";

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Handle the error, log it, or do something else.
});

class DBClient {
  constructor() {
    envLoader();
    const host = process.env.DB_HOST || "localhost";
    const port = process.env.DB_PORT || "27017";
    const database = process.env.DB_DATABASE || "files_manager";
    const dbURL = `mongodb://${host}:${port}/${database}`;

    this.client = new MongoClient(dbURL);
    this.client.connect();
  }

  isAlive() {
    return this.client.topology.isConnected();
  }

  async nbUsers() {
    try {
      return await this.client.db().collection("users").countDocuments();
    } catch (error) {
      console.error("Error in nbUsers:", error);
      throw error; // Re-throw the error to propagate it further if needed.
    }
  }

  async nbFiles() {
    try {
      return await this.client.db().collection("files").countDocuments();
    } catch (error) {
      console.error("Error in nbFiles:", error);
      throw error; // Re-throw the error to propagate it further if needed.
    }
  }

  async usersCollection() {
    try {
      return await this.client.db().collection("users");
    } catch (error) {
      console.error("Error in usersCollection:", error);
      throw error; // Re-throw the error to propagate it further if needed.
    }
  }

  async filesCollection() {
    try {
      return await this.client.db().collection("files");
    } catch (error) {
      console.error("Error in filesCollection:", error);
      throw error; // Re-throw the error to propagate it further if needed.
    }
  }
}

const dbClient = new DBClient();

export default dbClient;
