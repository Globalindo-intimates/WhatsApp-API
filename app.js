const qrcode = require("qrcode");
const express = require("express");
const socketIo = require("socket.io");
const { body, validationResult } = require("express-validator");
const http = require("http");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { numberFormatter } = require("./helpers/number_helper");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + "/assets/img/"));
app.use(cors());

console.log("directory assets: " + __dirname);

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

const client = new Client({
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
  authStrategy: new LocalAuth({
    clientId: "Adrian",
  }),
});

client.initialize();
var webReady = 0;
var counter = 0;

let loadingTime;

// Socket Io
io.on("connection", function (socket) {
  loadingTime = setInterval(() => {
    counter++;
    socket.emit("loading", `Connecting, please wait....(${counter})`);
    console.log(`Connecting, please wait....(${counter})`);
  }, 1000);

  client.on("qr", (qr) => {
    webReady++;
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", "QR ready, please scan it");
      console.log("Not logged in, please scan barcode....");
    });
  });

  client.on("authenticated", () => {
    clearInterval(loadingTime);
    socket.emit("message", "QR Code scanned");
    console.log("QR Code scanned!");
  });

  client.on("ready", () => {
    webReady = 0;
    socket.emit("message", "WhatsApp is ready!");
    let ready = "133187-ready-check.gif";
    socket.emit("ready", ready);
    console.log("Whatsapp ready!");
  });
});

const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};

//Send message
app.post(
  "/send-message",
  [body("number").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    if (webReady == 0) {
      const errors = validationResult(req).formatWith(({ msg }) => {
        return msg;
      });

      if (!errors.isEmpty()) {
        return res.status(422).json({
          status: false,
          message: errors.mapped(),
        });
      }
      const number = numberFormatter(req.body.number);
      const message = req.body.message;

      const isRegisteredNumber = await checkRegisteredNumber(number);

      if (!isRegisteredNumber) {
        return res.status(422).json({
          status: false,
          message: { message: "Number is not registered on WhatsApp" },
        });
      }

      client
        .sendMessage(number, message)
        .then((response) => {
          res.status(200).json({
            status: true,
            response: response,
          });
        })
        .catch((err) => {
          res.status(500).json({
            status: false,
            response: err,
          });
        });
    } else {
      return res.status(404).json({
        status: false,
        message: { message: "WhatsApp is offline, please contact Admin" },
      });
    }
  }
);

server.listen(8080, function () {
  console.log("App running on port 8080");
});
