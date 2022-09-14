import { AppDataSource } from "./data-source";
import { Product } from "./entity/product";
import * as express from "express";
import { Request, Response } from "express";
import * as cors from "cors";
// import * as amqp from "amqplib/callback_api";
const amqp = require("amqplib/callback_api");

AppDataSource.initialize()
  .then(async () => {
    const productRepository = AppDataSource.getRepository(Product);

    amqp.connect("amqp://localhost", (error0, connection) => {
      if (error0) {
        throw error0;
      }

      connection.createChannel((error1, channel) => {
        if (error1) {
          throw error1;
        }
        channel.assertQueue("product_created", {
          durable: false,
        });
        channel.assertQueue("product_updated", {
          durable: false,
        });
        channel.assertQueue("product_deleted", {
          durable: false,
        });

        const app = express();

        app.use(
          cors({
            origin: "*",
          })
        );

        app.use(express.json());

        app.get("/api/products", async (req: Request, res: Response) => {
          const products = await productRepository.find();
          res.json(products);
        });

        app.post("/api/products", async (req: Request, res: Response) => {
          const product = await productRepository.create(req.body);
          const result = await productRepository.save(product);
          channel.sendToQueue(
            "product_created",
            Buffer.from(JSON.stringify(result))
          );
          return res.send(result);
        });

        app.get("/api/products/:id", async (req: Request, res: Response) => {
          const product = await productRepository
            .createQueryBuilder("products")
            .where("id = :id", { id: req.params.id })
            .getOne();
          return res.send(product);
        });

        app.put("/api/products/:id", async (req: Request, res: Response) => {
          const product = await productRepository
            .createQueryBuilder("products")
            .where("id = :id", { id: req.params.id })
            .getOne();
          productRepository.merge(product, req.body);
          const result = await productRepository.save(product);
          channel.sendToQueue(
            "product_updated",
            Buffer.from(JSON.stringify(result))
          );
          return res.send(result);
        });

        app.delete("/api/products/:id", async (req: Request, res: Response) => {
          const result = await productRepository.delete(req.params.id);
          channel.sendToQueue("product_deleted", Buffer.from(req.params.id));
          return res.send(result);
        });

        app.post(
          "/api/products/:id/like",
          async (req: Request, res: Response) => {
            const product = await productRepository.findOne(req.params.id);
            product.likes++;
            const result = await productRepository.save(product);
            return res.send(result);
          }
        );

        console.log("Listening to port: 8000");
        app.listen(8000);
        process.on("beforeExit", () => {
          console.log("closing");
          connection.close();
        });
      });
    });
  })
  .catch((error) => console.log(error));
