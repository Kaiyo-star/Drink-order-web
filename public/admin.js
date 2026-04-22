const pendingOrders = document.getElementById("pendingOrders");
const paidOrders = document.getElementById("paidOrders");
const debtOrders = document.getElementById("debtOrders");

const walkInCustomerName = document.getElementById("walkInCustomerName");
const walkInDrinkId = document.getElementById("walkInDrinkId");
const walkInQuantity = document.getElementById("walkInQuantity");
const walkInTotalAmount = document.getElementById("walkInTotalAmount");
const addWalkInBtn = document.getElementById("addWalkInBtn");

const adminStatusText = document.getElementById("adminStatusText");
const dailyRecordsList = document.getElementById("dailyRecordsList");

function formatCurrency(value) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(value) || 0);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function setAdminStatus(message, type = "") {
  adminStatusText.textContent = message;
  adminStatusText.className = `status-text ${type}`.trim();
}

function stockPayload() {
  return {
    stock: {
      anggur: Number(document.getElementById("stock-anggur").value || 0),
      "aiskrim-soda": Number(
        document.getElementById("stock-aiskrim-soda").value || 0,
      ),
      sarsi: Number(document.getElementById("stock-sarsi").value || 0),
      oren: Number(document.getElementById("stock-oren").value || 0),
      "buah-buahan": Number(
        document.getElementById("stock-buah-buahan").value || 0,
      ),
    },
  };
}

async function postAction(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function fillStockInput(id, value) {
  const input = document.getElementById(id);

  if (document.activeElement === input) {
    return;
  }

  input.value = value ?? 0;
}

function updateWalkInTotal(drinks) {
  const selectedDrink = drinks.find(
    (drink) => drink.id === walkInDrinkId.value,
  );
  const quantity = Number(walkInQuantity.value) || 0;
  const total = selectedDrink ? selectedDrink.walkInPrice * quantity : 0;
  walkInTotalAmount.textContent = formatCurrency(total);
}

function renderOrder(order, type) {
  let actionButtons = "";

  if (type === "pending") {
    actionButtons = `
      <div class="action-row">
        <button class="success-btn" data-action="paid" data-order-id="${order.id}">Right</button>
        <button class="danger-btn" data-action="debt" data-order-id="${order.id}">False</button>
        <button class="secondary-btn" data-action="cancelled" data-order-id="${order.id}">Cancel</button>
      </div>
    `;
  }

  if (type === "debt") {
    actionButtons = `
      <div class="action-row">
        <button class="success-btn" data-action="paid" data-order-id="${order.id}">
          Mark as Paid
        </button>
        <button class="secondary-btn" data-action="cancelled" data-order-id="${order.id}">
          Cancel
        </button>
      </div>
    `;
  }

  return `
    <article class="order-card">
      <div class="order-top">
        <div>
          <h3 class="order-title">${order.customerName || "-"}</h3>
          <p class="order-meta">
            Room ${order.roomNumber || "-"}<br />
            ${order.drinkName || "-"} x ${order.quantity ?? 0}<br />
            Total: ${formatCurrency(order.totalAmount)}
          </p>
        </div>
        <span class="pill ${order.status}">${(order.status || "-").toUpperCase()}</span>
      </div>
      ${actionButtons}
    </article>
  `;
}

async function updateOrderStatus(orderId, status) {
  const response = await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to update order.");
  }

  await loadDashboard();
}

async function loadDashboard() {
  const response = await fetch("/api/orders");
  const data = await response.json();

  const orders = data.orders || [];
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const pending = activeOrders.filter((order) => order.status === "pending");
  const paid = activeOrders.filter((order) => order.status === "paid");
  const debt = activeOrders.filter((order) => order.status === "debt");

  const stats = data.stats || {
    pendingCount: 0,
    profit: {
      totalPaidCustomers: 0,
      totalItemsSold: 0,
      totalProfit: 0,
    },
    debt: {
      totalDebtCustomers: 0,
      totalOutstandingDebt: 0,
      totalUnpaidItems: 0,
    },
  };

  walkInDrinkId.innerHTML = (data.drinks || [])
    .map((drink) => `<option value="${drink.id}">${drink.name}</option>`)
    .join("");

  updateWalkInTotal(data.drinks || []);

  fillStockInput("stock-anggur", data.stock?.anggur);
  fillStockInput("stock-aiskrim-soda", data.stock?.["aiskrim-soda"]);
  fillStockInput("stock-sarsi", data.stock?.sarsi);
  fillStockInput("stock-oren", data.stock?.oren);
  fillStockInput("stock-buah-buahan", data.stock?.["buah-buahan"]);

  setText("dailySales", String(data.dailySummary?.totalSales ?? 0));
  setText("dailyProfit", formatCurrency(data.dailySummary?.totalProfit ?? 0));
  setText("dailyDebt", formatCurrency(data.dailySummary?.totalDebt ?? 0));

  dailyRecordsList.innerHTML = (data.dailyRecords || []).length
    ? data.dailyRecords
        .map(
          (record) => `
            <article class="order-card">
              <h3 class="order-title">${record.date || "-"}</h3>
              <p class="order-meta">
                Jumlah jualan: ${record.totalSales ?? 0}<br />
                Total untung: ${formatCurrency(record.totalProfit)}<br />
                Total penghutang: ${formatCurrency(record.totalDebt)}
              </p>
            </article>
          `,
        )
        .join("")
    : emptyState("Belum ada data harian disimpan.");

  setText("customerLink", window.location.origin);
  setText("pendingCount", String(stats.pendingCount ?? 0));
  setText("profitAmount", formatCurrency(stats.profit?.totalProfit ?? 0));
  setText("debtAmount", formatCurrency(stats.debt?.totalOutstandingDebt ?? 0));
  setText("paidCustomers", String(stats.profit?.totalPaidCustomers ?? 0));
  setText("itemsSold", String(stats.profit?.totalItemsSold ?? 0));
  setText("totalProfit", formatCurrency(stats.profit?.totalProfit ?? 0));
  setText("debtCustomers", String(stats.debt?.totalDebtCustomers ?? 0));
  setText("unpaidItems", String(stats.debt?.totalUnpaidItems ?? 0));
  setText("totalDebt", formatCurrency(stats.debt?.totalOutstandingDebt ?? 0));

  pendingOrders.innerHTML = pending.length
    ? pending.map((order) => renderOrder(order, "pending")).join("")
    : emptyState("No incoming orders yet.");

  paidOrders.innerHTML = paid.length
    ? paid.map((order) => renderOrder(order, "paid")).join("")
    : emptyState("No paid orders yet.");

  debtOrders.innerHTML = debt.length
    ? debt.map((order) => renderOrder(order, "debt")).join("")
    : emptyState("No debt orders yet.");
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  button.disabled = true;

  try {
    await updateOrderStatus(
      Number(button.dataset.orderId),
      button.dataset.action,
    );
  } catch (error) {
    setAdminStatus(error.message || "Unable to update order.", "error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("saveStockBtn").addEventListener("click", async () => {
  try {
    await postAction("/api/stock", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stockPayload()),
    });

    setAdminStatus("Stock berjaya disimpan.", "success");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, "error");
  }
});

document.getElementById("saveDailyBtn").addEventListener("click", async () => {
  try {
    await postAction("/api/daily-records", {
      method: "POST",
    });

    setAdminStatus("Data harian berjaya disimpan.", "success");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, "error");
  }
});

document.getElementById("resetSalesBtn").addEventListener("click", async () => {
  try {
    await postAction("/api/reset-sales", {
      method: "POST",
    });

    setAdminStatus("Jualan dan order semasa telah direset.", "success");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, "error");
  }
});

document.getElementById("resetDailyBtn").addEventListener("click", async () => {
  try {
    await postAction("/api/reset-daily-records", {
      method: "POST",
    });

    setAdminStatus("Semua data harian telah dipadam.", "success");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, "error");
  }
});

document.getElementById("resetStockBtn").addEventListener("click", async () => {
  try {
    await postAction("/api/reset-stock", {
      method: "POST",
    });

    setAdminStatus("Stock telah direset.", "success");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, "error");
  }
});

walkInDrinkId.addEventListener("input", async () => {
  const response = await fetch("/api/orders");
  const data = await response.json();
  updateWalkInTotal(data.drinks || []);
});

walkInQuantity.addEventListener("input", async () => {
  const response = await fetch("/api/orders");
  const data = await response.json();
  updateWalkInTotal(data.drinks || []);
});

addWalkInBtn.addEventListener("click", async () => {
  try {
    const payload = {
      customerName: walkInCustomerName.value.trim() || "Walk-in",
      drinkId: walkInDrinkId.value,
      quantity: Number(walkInQuantity.value),
    };

    await postAction("/api/walk-in-orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setAdminStatus("Walk-in sale berjaya ditambah.", "success");
    walkInCustomerName.value = "";
    walkInQuantity.value = 1;
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, "error");
  }
});

loadDashboard();
setInterval(loadDashboard, 3000);
