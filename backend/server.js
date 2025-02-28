/*CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role VARCHAR(10) CHECK (role IN ('user', 'admin')) NOT NULL
);

CREATE TABLE menu (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price INT NOT NULL,
  category VARCHAR(50) NOT NULL
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  total_price INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  menu_id INT REFERENCES menu(id) ON DELETE CASCADE,
  quantity INT NOT NULL
);*/

const express = require("express");
const cors = require("cors");
const { neon } = require('@neondatabase/serverless');
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

// Database Connection
const DATABASE_URL = 'postgresql://neondb_owner:npg_L4k3MOAhfGzg@ep-lively-firefly-a8fr7hsb-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';
const sql = neon(DATABASE_URL);

// Secret Key for JWT
const SECRET_KEY = "your_secret_key";

// Middleware for Authentication
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access Denied. No token provided" });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

// Middleware for Admin Access
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied. Admins only" });
    }
    next();
};

// User Login
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await sql`SELECT * FROM users WHERE email = ${email} AND password = ${password}`;
    
    if (user.length === 0) return res.status(401).json({ success: false, message: "Invalid email or password!" });

    const token = jwt.sign({ id: user[0].id, email: user[0].email, role: user[0].role }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ success: true, message: "Login successful!", user: user[0], token });
});

// User Sign-Up
app.post("/api/auth/signup", async (req, res) => {
    const { email, password } = req.body;
    try {
        await sql`INSERT INTO users (email, password, role) VALUES (${email}, ${password}, 'user')`;
        res.status(201).json({ message: "Sign-up successful!" });
    } catch (error) {
        res.status(400).json({ message: "User already exists!" });
    }
});

// Get Menu Items
app.get("/api/menu", verifyToken, async (req, res) => {
  try {
    let menu= await sql`SELECT id, name, price, category FROM menu`;

    if (menu.length === 0) {
      return res.status(404).json({ message: "No menu items found." });
    }

    // Group menu items by category
    const groupedMenu = {};

    for (let dish of menu) {
      let category = dish.category;
    
      if (!groupedMenu[category]) {
        groupedMenu[category] = [];
      }
    
      groupedMenu[category].push(dish);
    }
    return res.status(200).json({ data: groupedMenu });

  } catch (error) {
    console.error("Error fetching menu:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});


// Submit Order
app.post("/api/orders", verifyToken, async (req, res) => {
    const { items, totalPrice } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: "Cannot place an empty order" });
    try {
        const order = await sql`INSERT INTO orders (user_id, total_price) VALUES (${req.user.id}, ${totalPrice}) RETURNING id`;
        for (const item of items) {
            await sql`INSERT INTO order_items (order_id, menu_id, quantity) VALUES (${order[0].id}, ${item.id}, ${item.quantity})`;
        }
        res.status(201).json({ message: "Order placed successfully!", orderId: order[0].id });
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ message: "An error occurred while placing the order." });
    }
});

// Create Menu Item (Admin)
app.post("/api/admin/menu", verifyToken, verifyAdmin, async (req, res) => {
  const { name, price, category } = req.body;
  try {
      const newDish = await sql`INSERT INTO menu (name, price, category) VALUES (${name}, ${price}, ${category}) RETURNING id`;
      res.status(201).json({ success: true, item: newDish[0], message: "Dish added successfully!" });
  } catch (error) {
      console.error("Error adding dish:", error);
      res.status(500).json({ success: false, message: "An error occurred while adding the dish." });
  }
});

// Edit Menu Item (Admin)
app.put("/api/admin/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { name, price, category } = req.body;
  const { id } = req.params;

  if (!name || !price || !category) {
      return res.status(400).json({ success: false, message: "All fields must be provided." });
  }

  try {
    const dish = await sql`SELECT * FROM menu WHERE id = ${id}`;
    if (dish.length === 0) {
        return res.status(404).json({ success: false, message: "Dish not found!" });
    }

    // Update the dish
    await sql`UPDATE menu SET name = ${name}, price = ${price}, category = ${category} WHERE id = ${id}`;
    res.json({ success: true, message: "Dish updated successfully!" });
  } catch (error) {
    console.error("Error updating dish:", error);
    res.status(500).json({ success: false, message: "An error occurred while updating the dish." });
  }
});

// Delete Menu Item (Admin)
app.delete("/api/admin/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await sql`DELETE FROM menu WHERE id = ${id}`;
        res.json({ success: true, message: "Dish deleted successfully!" });
    } catch (error) {
        console.error("Error deleting dish:", error);
        res.status(500).json({ message: "An error occurred while deleting the dish." });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
