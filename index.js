const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { log } = require("node:console");
const { userInfo } = require("node:os");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// MongoDB URI
const uri = process.env.DB_URI;

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    // add collections here
    const db = client.db("garments-orders");
    const usersCollection = db.collection("users");
    const productCollection = db.collection("products");
    const ordersCollection = db.collection("orders");
    const trackingsCollections = db.collection("trackings");

    // app api here
    // users apis
    app.post("/users", async (req, res) => {
      const { name, email, photoURL, role } = req.body;
      const timeStamp = new Date();

      let userData = {
        name,
        email,
        photoURL,
        createdAt: timeStamp,
        updatedAt: timeStamp,
      };

      if (role === "Buyer") {
        userData.role = "buyer";
        userData.status = "active";
      } else if (role === "Manager") {
        userData.status = "pending";
      }

      // const userInfoWithTimeStamps = {
      //   ...userInfo,
      //   createdAt: timeStamp,
      //   updatedAt: timeStamp,
      //   status: "pending",
      // };
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });
    app.patch("/users/suspend/:id", async (req, res) => {
      const id = req.params.id;
      const updateInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateInfo,
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.patch("/users/approveRole/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "manager",
          status: "approved",
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.patch("/users/updateRole/:id", async (req, res) => {
      const id = req.params.id;
      const updateInfo = req.body;
      const query = { _id: new ObjectId(id) };
      console.log(id, userInfo);
      const updateDoc = {
        $set: {
          role: updateInfo.r,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        query.name = { $regex: searchText, $options: "i" };
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/users/myProfile", async (req, res) => {
      const email = req.query.email;

      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // products apis
    app.get("/products", async (req, res) => {
      const searchText = req.query.searchText;
      console.log(searchText);
      const query = {};
      if (searchText) {
        query.productTitle = { $regex: searchText, $options: "i" };
      }
      const result = await productCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/products/home", async (req, res) => {
      const products = await productCollection
        .find({ showOnHome: true })
        .toArray();
      console.log(products);

      res.send(products);
    });
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.post("/products", async (req, res) => {
      const productInfo = req.body;

      const result = await productCollection.insertOne(productInfo);
      res.send(result);
    });
    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;

      const updateData = req.body;
      console.log(updateData);

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateData,
      };
      const result = await productCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/products/home-toggle/:id", async (req, res) => {
      const id = req.params.id;
      const { showOnHome } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { showOnHome: showOnHome },
      };

      const result = await productCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    // orders apis

    app.get("/orders", async (req, res) => {
      const { status, email } = req.query;

      //const query = status ? { status } : {};
      const query = {};
      if (status) {
        query.status = status;
      }

      if (email) {
        query.email = email;
      }

      const orders = await ordersCollection.find(query).toArray();
      res.send(orders);
    });

    app.patch("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: status,
        },
      };

      // Extra field: Date & time store
      if (status === "approved") {
        updateDoc.$set.approvedAt = new Date();
      }

      const result = await ordersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const order = await ordersCollection.findOne(query);
      if (!order) return res.status(404).send({ message: "Order not found" });

      if (order.status !== "pending") {
        return res
          .status(400)
          .send({ message: "Only pending orders can be canceled" });
      }

      const result = await ordersCollection.updateOne(query, {
        $set: {
          status: "canceled",
          canceledAt: new Date(),
        },
      });

      res.send(result);
    });

    app.post("/orders", async (req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.status = "pending";
      console.log("info", userInfo);

      const existing = await ordersCollection.findOne({
        title: userInfo.productId,
      });

      if (existing) {
        console.log(existing);

        return res.status(409).send({
          success: false,
          message: "Product already exists",
        });
      }

      const result = await ordersCollection.insertOne(userInfo);
      // Auto tracking for COD
      const trackingData = {
        orderId: result.insertedId,
        status: "order placed",
        note: "COD order created",
        dateTime: new Date(),
      };

      await trackingsCollections.insertOne(trackingData);
      res.send(result);
    });

    // payment related api stripe
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.orderPrice) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.productTitle}`,
              },
            },
            quantity: paymentInfo.orderQuantity,
          },
        ],
        mode: "payment",
        metadata: {
          productId: paymentInfo.productId,
          email: paymentInfo.email,
          orderQuantity: paymentInfo.orderQuantity,
          orderPrice: paymentInfo.orderPrice,
        },
        customer_email: paymentInfo.email,
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        // stripe metadata
        const { productId, email, orderQuantity, orderPrice } =
          session.metadata;

        const product = await productCollection.findOne({
          _id: new ObjectId(productId),
        });
        // 1. Create Order Object
        const orderData = {
          productId,
          email,
          product,
          orderQuantity: parseInt(orderQuantity),
          orderPrice: parseFloat(orderPrice),
          paymentMethod: "op",
          paymentStatus: "paid",
          status: "pending",
          createdAt: new Date(),
        };

        const existing = await ordersCollection.findOne({
          productId: productId,
        });

        if (existing) {
          console.log(existing);
          return res.status(409).send({
            success: false,
            message: "You have already ordered this product",
          });
        }

        console.log("my order data", orderData);

        // 2. Save to Orders Collection
        const orderResult = await ordersCollection.insertOne(orderData);

        // 3. Create Tracking automatically (Payment Success)
        const trackingData = {
          orderId: orderResult.orderId,
          status: "payment success", // First tracking step
          note: "Stripe payment completed",
          dateTime: new Date(),
        };

        await trackingsCollections.insertOne(trackingData);

        // 3. (Optional) Update product collection
        await productCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: { paymentStatus: "paid" } }
        );

        res.send({
          success: true,
          message: "Payment success & order saved",
          orderId: orderResult.insertedId,
        });
      } else {
        res
          .status(400)
          .send({ success: false, message: "Payment not completed" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Optionally close connection later
    // await client.close();
  }
}
run().catch(console.dir);

// Simple route
app.get("/", (req, res) => {
  res.send("Hello Express with CommonJS!");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
