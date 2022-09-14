import { AppDataSource } from "./data-source";
import { Product } from "./entity/Products";
import * as express from "express";
import { Request, Response } from "express";
import * as cors from "cors";
import * as amqp from "amqplib/callback_api";

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

        channel.assertQueue("product_created", { durable: false });
        channel.assertQueue("product_updated", { durable: false });
        channel.assertQueue("product_deleted", { durable: false });

        const app = express();

        app.use(
          cors({
            origin: "*",
          })
        );

        app.use(express.json());

        channel.consume(
          "product_created",
          async (msg) => {
            const eventProduct: Product = JSON.parse(msg.content.toString());
            const product = new Product();
            product.mainId = eventProduct.id;
            product.title = eventProduct.title;
            product.image = eventProduct.image;
            product.likes = eventProduct.likes;
            await productRepository.save(product);
            console.log("product created");
          },
          { noAck: true }
        );

        channel.consume(
          "product_updated",
          async (msg) => {
            const eventProduct: Product = JSON.parse(msg.content.toString());
            const product = await productRepository
              .createQueryBuilder("product")
              .where("product.mainId = :id", { id: eventProduct.id })
              .getOne();
            productRepository.merge(product, {
              title: eventProduct.title,
              image: eventProduct.image,
              likes: eventProduct.likes,
            });
            await productRepository.save(product);
            console.log("product updated");
          },
          { noAck: true }
        );

        channel.consume(
          "product_deleted",
          async (msg) => {
            const admin_id = parseInt(msg.content.toString());
            console.log(admin_id);
            console.log("called");
            await productRepository
              .createQueryBuilder("product")
              .delete()
              .from(Product)
              .where("mainId = :id", { id: admin_id })
              .execute();
            // //   deleteOne({ admin_id });
            console.log("product deleted");
          },
          { noAck: true }
        );

        app.get("/api/products", async (req: Request, res: Response) => {
          const products = await productRepository.find();
          return res.send(products);
        });

        console.log("Listening to port: 8001");
        app.listen(8001);
        process.on("beforeExit", () => {
          console.log("closing");
          connection.close();
        });
      });
    });
  })
  .catch((error) => console.log(error));
