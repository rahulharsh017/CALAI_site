const express = require("express");
const firebase = require("firebase/app");
const cors = require("cors");
const app = express();
const axios = require("axios");
require("dotenv").config();
require("firebase/auth");
require("firebase/database");
require("firebase/firestore");
// Middleware for parsing JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use cors middleware to handle CORS
app.use(cors());
let userEmail;
const port = process.env.PORT || 5000;

// Initialize Firebase
const firebaseConfig = {
  // Your Firebase config object
  apiKey: "AIzaSyDPze9CSiP1l4AfUNFHHJBiGTiPUs_i5qI",
  authDomain: "calaisite.firebaseapp.com",
  projectId: "calaisite",
  storageBucket: "calaisite.appspot.com",
  messagingSenderId: "137219193547",
  appId: "1:137219193547:web:6961a289776640ea47794e",
  measurementId: "G-M0B2Q3JX9V",
  databaseURL: "https://calaisite-default-rtdb.firebaseio.com/",
};
firebase.initializeApp(firebaseConfig);
// const auth = firebase.auth();
const database = firebase.database();
const db = firebase.firestore();

//PAYPAL CREDENTIALS
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_SECRET_KEY;
const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

//GENERATE TOKEN
const generateToken = async () => {
  try {
    const tokenResponse = await axios.post(
      "https://api.sandbox.paypal.com/v1/oauth2/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // console.log(tokenResponse.data.access_token);
    return tokenResponse.data.access_token;
  } catch (error) {
    console.error("Error getting access token:", error.message);
  }
};

//CREATING ORDER
app.post("/create-order", async (req, res) => {
  const url = "https://api-m.sandbox.paypal.com/v2/checkout/orders";
  const { amount } = req.body;
  // console.log(amount);
  const data = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: amount,
        },
      },
    ],
    application_context: {
      brand_name: "CalAI",
      locale: "en-US",
      return_url: "https://calai-site.vercel.app/capture/success.html", // This is the returnUrl
      cancel_url: "https://calai-site.vercel.app/capture/cancel.html", // Your cancel URL
    },
  };
  const accessToken = await generateToken();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log("Order Created:", response.data);
    const { links } = response.data;
    const paypalRedirect = links.find((link) => link.rel === "approve");
    console.log(response.data.id);
    if (paypalRedirect) {
      res.json({ orderId: response.id, approvalUrl: paypalRedirect.href });
    } else {
      res.status(500).json({ error: "Failed to get PayPal redirect URL" });
    }
  } catch (error) {
    // console.log(error.message);
  }
});

//CAPTURING ORDER
app.post("/capture-order", async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID is required" });
  }

  const url = `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`;
  const data = {
    note_to_payer: "Thank you for your purchase!",
  };

  const accessToken = await generateToken(); // Assuming this function generates the access token
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log("Order Captured:", response.data);

    // Store only the necessary order data in Firestore
    const orderRef = db
      .collection("after_transaction")
      .doc(userEmail)
      .collection("successfulPayments")
      .doc(orderId);
    await orderRef.set(response.data);
    console.log("Order Captured Successfully");

    res.json({
      message: "Order captured successfully",
      transactionId: response.data.id,
    });
  } catch (error) {
    console.error("Error capturing order:", error.message);
    console.error("Error response:", error.response.data); // Log detailed error response

    // Handle payment failure
    const failureData = {
      orderId: orderId,
      error: error.message, // Or use error.response.data to capture detailed error information
      timestamp: new Date(),
      resp: response.data,
    };

    // Ensure that the user is authenticated and get their email

    if (userEmail) {
      // Store the failure data in Firestore under the user's email
      const failureRef = db
        .collection("after_transaction")
        .doc(userEmail)
        .collection("failed_payments")
        .doc();
      await failureRef.set(failureData);
    }

    res
      .status(error.response.status || 500)
      .json({ error: "Failed to capture order", details: error.response.data });
  }
});

//CANCELING ORDER
app.post("/order-cancel", async (req, res) => {
  const { token } = req.body;
  const cancelData = {
    tokenId: token,
    timestamp: new Date(),
    message: "Order Canceled",
  };
  try {
    const cancelRef = db
      .collection("after_transaction")
      .doc(userEmail)
      .collection("canceledPayments")
      .doc(token);
    await cancelRef.set(cancelData);
    console.log("payment canceled");
  } catch (error) {
    console.log("Error in canceling order", error);
  }
});

//GETTING COURSE DETAILS
app.post("/getCourseDetails", async (req, res) => {
  const { certificationId } = req.body;

  try {
    // Retrieve course details from Firestore based on certification ID
    const courseRef = db.collection("courses").doc(certificationId);
    const doc = await courseRef.get();

    if (!doc.exists) {
      console.log("No such document!");
      res.status(404).json({ error: "Course not found" });
    } else {
      console.log(doc.data());
      const courseData = doc.data();
      res.json({
        certName: courseData.course_name,
        courseFee: courseData.course_fees,
        registrationFee: courseData.registration_fees,
      });
    }
  } catch (error) {
    console.error("Error getting document:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//DISCOUNT VALIDATION
app.post("/validate-coupon", async (req, res) => {
  const { scholarshipCode } = req.body;

  try {
    const courseRef = db.collection("coupons").doc(scholarshipCode);
    const doc = await courseRef.get();
    if (!doc.exists) {
      console.log("Invalid Coupon!");
      res.status(404).json({ error: "Invalid Coupon" });
    } else {
      console.log(doc.data());
      const coupon = doc.data();
      res.json({
        discount: coupon.discount,
        expiresIn: coupon.expire,
      });
    }
  } catch (error) {
    console.log(error.messgae);
  }
});

//REGISTRATION ROUTE
app.post("/register", async (req, res) => {
  try {
    const {
      name,
      email,
      contact,
      country,
      courseFee,
      registrationFee,
      certification,
    } = req.body;

    // Ensure that the user is authenticated and get their email
    // const userEmail = firebase.auth().currentUser;
    userEmail = email;
    // Create a reference to the Firestore collection for the user's data
    const userCollectionRef = db
      .collection("before_transaction")
      .doc(email)
      .collection("registrationData");

    // Generate a unique ID for the registration data document
    const registrationDataRef = userCollectionRef.doc();

    // Set data in the Firestore document
    await registrationDataRef.set({
      name: name,
      email: email,
      contact: contact,
      country: country,
      courseFee: courseFee,
      registrationFee: registrationFee,
      certification: certification,
    });

    // Log a success message
    console.log("Registration successful for user:", email);

    // Send a success response to the client
    res.status(200).send("Registration successful");
  } catch (error) {
    console.error("Error registering:", error);
    res.status(500).send("Failed to register");
  }
});

//SERVER CHECK
app.get("/", async (req, res) => {
  res.send("Hello!! World");
});
// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
