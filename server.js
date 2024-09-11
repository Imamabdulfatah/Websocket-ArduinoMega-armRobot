const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const { SerialPort } = require("serialport"); // Correct import
const { ReadlineParser } = require("@serialport/parser-readline");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(bodyParser.json());
app.use(cors());

// MySQL database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "", // Replace with your MySQL root password
  database: "cobawebsocket", // Replace with your database name
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to MySQL database");
});

// Setup Serial Port
const port = new SerialPort({
  path: "COM7",
  baudRate: 9600,
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

parser.on("data", (result) => {
  console.log("Data from Arduino ->", result);
  io.emit("data", { data: result });
});
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// API endpoint to handle data from Arduino
app.post("/arduinoApi", (req, res) => {
  const data = req.body.data;
  console.log("Received data:", data);

  if (port.isOpen) {
    port.write(data, (err) => {
      if (err) {
        console.error("Error sending data to Arduino:", err);
        // Send error response and return to prevent further code execution
        return res.status(500).send("Error writing to serial port");
      }
      console.log("Data sent to Arduino:", data);

      // Insert data into MySQL database only if the serial write is successful
      const query = "INSERT INTO sensor (data) VALUES (?)";
      db.query(query, [data], (err, result) => {
        if (err) {
          console.error("Error inserting data:", err);
          return res.status(500).send("Database error");
        }
        console.log("Data inserted into database:", result);
        // Send success response after successful database insertion
        res.send({ status: "success", result });
      });
    });
  } else {
    console.error("Serial port is not open");
    res.status(500).send("Serial port is not open");
  }
});

// WebSocket connection to send data to the client
io.on("connection", (socket) => {
  console.log("Client connected");

  // Listen for data updates
  socket.on("get_data", () => {
    const query = "SELECT * FROM sensor ORDER BY id DESC LIMIT 1";
    db.query(query, (err, results) => {
      if (err) {
        console.error("Error fetching data:", err);
        return;
      }
      socket.emit("data", { data: results[0]?.data });
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
