const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

const DRINKS = [
  { id: "anggur", name: "Anggur", roomPrice: 3.0, walkInPrice: 2.5 },
  {
    id: "aiskrim-soda",
    name: "Aiskrim Soda",
    roomPrice: 3.0,
    walkInPrice: 2.5,
  },
  { id: "sarsi", name: "Sarsi", roomPrice: 3.0, walkInPrice: 2.5 },
  { id: "oren", name: "Oren", roomPrice: 3.0, walkInPrice: 2.5 },
  { id: "buah-buahan", name: "Buah Buahan", roomPrice: 3.0, walkInPrice: 2.5 },
];

const DEFAULT_STOCK = {
  anggur: 0,
  "aiskrim-soda": 0,
  sarsi: 0,
  oren: 0,
  "buah-buahan": 0,
};

let state = {
  nextId: 1,
  orders: [],
  stock: { ...DEFAULT_STOCK },
  dailyRecords: [],
};

let writeQueue = Promise.resolve();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(
  res,
  statusCode,
  body,
  contentType = "text/plain; charset=utf-8",
) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sanitizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getDrinkById(drinkId) {
  return DRINKS.find((drink) => drink.id === drinkId);
}

function getOrderStats(orders) {
  const paidOrders = orders.filter((order) => order.status === "paid");
  const debtOrders = orders.filter((order) => order.status === "debt");
  const pendingOrders = orders.filter((order) => order.status === "pending");

  return {
    pendingCount: pendingOrders.length,
    profit: {
      totalPaidCustomers: paidOrders.length,
      totalItemsSold: paidOrders.reduce(
        (sum, order) => sum + (Number(order.quantity) || 0),
        0,
      ),
      totalProfit: paidOrders.reduce(
        (sum, order) => sum + (Number(order.totalAmount) || 0),
        0,
      ),
    },
    debt: {
      totalDebtCustomers: debtOrders.length,
      totalOutstandingDebt: debtOrders.reduce(
        (sum, order) => sum + (Number(order.totalAmount) || 0),
        0,
      ),
      totalUnpaidItems: debtOrders.reduce(
        (sum, order) => sum + (Number(order.quantity) || 0),
        0,
      ),
    },
  };
}

function getDailySummary() {
  const paidOrders = state.orders.filter((order) => order.status === "paid");
  const debtOrders = state.orders.filter((order) => order.status === "debt");

  return {
    date: new Date().toISOString().slice(0, 10),
    totalSales: paidOrders.reduce(
      (sum, order) => sum + (Number(order.quantity) || 0),
      0,
    ),
    totalProfit: Number(
      paidOrders
        .reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0)
        .toFixed(2),
    ),
    totalDebt: Number(
      debtOrders
        .reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0)
        .toFixed(2),
    ),
  };
}

async function ensureStorage() {
  await fsp.mkdir(DATA_DIR, { recursive: true });

  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, JSON.stringify(state, null, 2));
  }

  const raw = await fsp.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);

  state = {
    nextId: Number.isInteger(parsed.nextId) ? parsed.nextId : 1,
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    stock:
      parsed.stock && typeof parsed.stock === "object"
        ? { ...DEFAULT_STOCK, ...parsed.stock }
        : { ...DEFAULT_STOCK },
    dailyRecords: Array.isArray(parsed.dailyRecords) ? parsed.dailyRecords : [],
  };
}

function persistState() {
  writeQueue = writeQueue.then(async () => {
    const tempFile = `${DATA_FILE}.tmp`;
    await fsp.writeFile(tempFile, JSON.stringify(state, null, 2));
    await fsp.rename(tempFile, DATA_FILE);
  });

  return writeQueue;
}

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

async function serveStaticFile(reqPath, res) {
  const normalizedPath = reqPath === "/" ? "/index.html" : reqPath;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    const finalPath = stat.isDirectory()
      ? path.join(filePath, "index.html")
      : filePath;

    const ext = path.extname(finalPath).toLowerCase();
    const contentTypeMap = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico": "image/x-icon",
    };

    const stream = fs.createReadStream(finalPath);
    res.writeHead(200, {
      "Content-Type": contentTypeMap[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    stream.pipe(res);
    stream.on("error", () => sendText(res, 500, "Unable to read file."));
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleCreateOrder(req, res) {
  const body = await parseRequestBody(req);
  const customerName = sanitizeText(body.customerName);
  const roomNumber = sanitizeText(body.roomNumber);
  const rawItems = Array.isArray(body.items)
    ? body.items
    : [{ drinkId: body.drinkId, quantity: body.quantity }];

  if (!customerName || !roomNumber || rawItems.length === 0) {
    sendJson(res, 400, {
      error:
        "Please provide a valid name, room number, and at least one cart item.",
    });
    return;
  }

  const createdAt = new Date().toISOString();
  const ordersToCreate = [];

  for (const item of rawItems) {
    const drinkId = sanitizeText(item.drinkId);
    const quantity = Number(item.quantity);
    const drink = getDrinkById(drinkId);

    if (
      !drink ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      sendJson(res, 400, {
        error: "Each cart item must include a valid drink flavor and quantity.",
      });
      return;
    }

    ordersToCreate.push({
      id: state.nextId++,
      customerName,
      roomNumber,
      drinkId: drink.id,
      drinkName: drink.name,
      orderType: "room",
      unitPrice: drink.roomPrice,
      quantity,
      totalAmount: Number((drink.roomPrice * quantity).toFixed(2)),
      status: "pending",
      createdAt,
    });
  }

  state.orders.unshift(...ordersToCreate);
  await persistState();

  sendJson(res, 201, {
    message: "Cart submitted successfully.",
    orders: ordersToCreate,
    summary: {
      totalItems: ordersToCreate.reduce(
        (sum, order) => sum + (Number(order.quantity) || 0),
        0,
      ),
      totalAmount: Number(
        ordersToCreate
          .reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0)
          .toFixed(2),
      ),
    },
  });
}

async function handleCreateWalkInOrder(req, res) {
  const body = await parseRequestBody(req);
  const customerName = sanitizeText(body.customerName) || "Walk-in";
  const drinkId = sanitizeText(body.drinkId);
  const quantity = Number(body.quantity);
  const drink = getDrinkById(drinkId);

  if (!drink || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    sendJson(res, 400, {
      error: "Please provide a valid walk-in drink and quantity.",
    });
    return;
  }

  const currentStock = Number(state.stock[drink.id] || 0);

  if (currentStock < quantity) {
    sendJson(res, 400, {
      error: `Not enough stock for ${drink.name}.`,
    });
    return;
  }

  state.stock[drink.id] = currentStock - quantity;

  const now = new Date().toISOString();
  const order = {
    id: state.nextId++,
    customerName,
    roomNumber: "-",
    drinkId: drink.id,
    drinkName: drink.name,
    orderType: "walk-in",
    unitPrice: drink.walkInPrice,
    quantity,
    totalAmount: Number((drink.walkInPrice * quantity).toFixed(2)),
    status: "paid",
    createdAt: now,
    updatedAt: now,
  };

  state.orders.unshift(order);
  await persistState();

  sendJson(res, 201, {
    message: "Walk-in sale added successfully.",
    order,
  });
}

async function handleUpdateOrder(req, res, orderId) {
  const body = await parseRequestBody(req);
  const nextStatus = sanitizeText(body.status);

  if (!["paid", "debt", "cancelled"].includes(nextStatus)) {
    sendJson(res, 400, { error: "Status must be paid, debt or cancelled." });
    return;
  }

  const order = state.orders.find((entry) => entry.id === orderId);

  if (!order) {
    sendJson(res, 404, { error: "Order not found." });
    return;
  }

  if (order.status === "pending" && nextStatus !== "cancelled") {
    const currentStock = Number(state.stock[order.drinkId] || 0);
    const quantity = Number(order.quantity) || 0;

    if (currentStock < quantity) {
      sendJson(res, 400, {
        error: `Not enough stock for ${order.drinkName}.`,
      });
      return;
    }

    state.stock[order.drinkId] = currentStock - quantity;
  }

  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  await persistState();

  sendJson(res, 200, {
    message: "Order updated.",
    order,
  });
}

async function handleUpdateStock(req, res) {
  const body = await parseRequestBody(req);
  const nextStock = body.stock;

  if (!nextStock || typeof nextStock !== "object") {
    sendJson(res, 400, { error: "Stock data is required." });
    return;
  }

  for (const drink of DRINKS) {
    const value = Number(nextStock[drink.id]);

    if (!Number.isInteger(value) || value < 0) {
      sendJson(res, 400, { error: `Invalid stock for ${drink.name}.` });
      return;
    }
  }

  for (const drink of DRINKS) {
    state.stock[drink.id] = Number(nextStock[drink.id]);
  }

  await persistState();
  sendJson(res, 200, { message: "Stock updated.", stock: state.stock });
}

async function handleSaveDailyRecord(req, res) {
  const summary = getDailySummary();

  state.dailyRecords.unshift(summary);
  await persistState();

  sendJson(res, 201, {
    message: "Daily record saved.",
    record: summary,
    dailyRecords: state.dailyRecords,
  });
}

async function handleResetSales(req, res) {
  state.orders = [];
  await persistState();
  sendJson(res, 200, { message: "Sales and orders reset." });
}

async function handleResetDailyRecords(req, res) {
  state.dailyRecords = [];
  await persistState();
  sendJson(res, 200, { message: "Daily records reset." });
}

async function handleResetStock(req, res) {
  state.stock = { ...DEFAULT_STOCK };
  await persistState();
  sendJson(res, 200, { message: "Stock reset.", stock: state.stock });
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/menu") {
    sendJson(res, 200, { drinks: DRINKS });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    sendJson(res, 200, {
      drinks: DRINKS,
      orders: state.orders,
      stats: getOrderStats(state.orders),
      stock: state.stock,
      dailyRecords: state.dailyRecords,
      dailySummary: getDailySummary(),
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    await handleCreateOrder(req, res);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/walk-in-orders") {
    await handleCreateWalkInOrder(req, res);
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/stock") {
    await handleUpdateStock(req, res);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/daily-records") {
    await handleSaveDailyRecord(req, res);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/reset-sales") {
    await handleResetSales(req, res);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/reset-daily-records") {
    await handleResetDailyRecords(req, res);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/reset-stock") {
    await handleResetStock(req, res);
    return true;
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);

  if (req.method === "PATCH" && orderMatch) {
    await handleUpdateOrder(req, res, Number(orderMatch[1]));
    return true;
  }

  return false;
}

async function startServer() {
  await ensureStorage();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi(req, res, url);

        if (!handled) {
          sendJson(res, 404, { error: "API endpoint not found." });
        }

        return;
      }

      if (url.pathname === "/admin") {
        await serveStaticFile("/admin.html", res);
        return;
      }

      await serveStaticFile(url.pathname, res);
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "Internal server error." });
    }
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.listen(PORT, () => {
    console.log(
      `Drink ordering website is running at http://localhost:${PORT}`,
    );
    console.log(
      `Admin dashboard is available at http://localhost:${PORT}/admin`,
    );
  });
}

startServer().catch((error) => {
  console.error("Unable to start server:", error);
  process.exit(1);
});
