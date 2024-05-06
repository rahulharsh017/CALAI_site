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

const port = process.env.PORT || 5000;

// Initialize Firebase
const firebaseConfig = {
  // Your Firebase config object
  apiKey: "AIzaSyAfZ7eAaBn4wZ03r2eaDGSHifN2ZxPxsnc",
  authDomain: "calai-proje.firebaseapp.com",
  projectId: "calai-proje",
  storageBucket: "calai-proje.appspot.com",
  messagingSenderId: "106563301878",
  appId: "1:106563301878:web:47f9dd7f6b1c8f346a57d7",
  measurementId: "G-LE2YKNGV6L",
  databaseURL: "https://calai-proje-default-rtdb.firebaseio.com/",
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
      brand_name: "PRACTICE INC",
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

    const orderData = {
      orderId: response.data.id,
      status: response.data.status,
      links: response.data.links,
    };

    // Store only the necessary order data in Firestore
    const orderRef = db.collection("orders").doc(orderId);
    await orderRef.set(orderData);

    res.json({ message: "Order captured successfully" });
  } catch (error) {
    console.error("Error capturing order:", error.message);
    console.error("Error response:", error.response.data); // Log detailed error response
    res
      .status(error.response.status || 500)
      .json({ error: "Failed to capture order" });
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
      phone,
      linkedIn,
      designation,
      workExperience,
      employment,
      qualification,
      program,
    } = req.body;

    // Create a reference to the Firestore document
    const userRef = db.collection("registers").doc(email);

    // Set data in the Firestore document
    await userRef.set({
      name: name,
      email: email,
      phone: phone,
      workExperience: workExperience,
      designation: designation,
      employmentStatus: employment,
      qualification: qualification,
      // course: program,
    });

    // Log a success message
    console.log("Registration successful:", userRef.id);

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
