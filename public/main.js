const orderForm = document.getElementById("orderForm");
const drinkCards = document.getElementById("drinkCards");
const cartTotalAmount = document.getElementById("cartTotalAmount");
const finalTotalAmount = document.getElementById("finalTotalAmount");
const nextStepBtn = document.getElementById("nextStepBtn");
const backStepBtn = document.getElementById("backStepBtn");
const stepOne = document.getElementById("stepOne");
const stepTwo = document.getElementById("stepTwo");
const stepPillOne = document.getElementById("stepPillOne");
const stepPillTwo = document.getElementById("stepPillTwo");
const statusText = document.getElementById("statusText");

let drinks = [];
let cart = {};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(value) || 0);
}

function getTotalAmount() {
  return drinks.reduce((sum, drink) => {
    const quantity = cart[drink.id] || 0;
    return sum + drink.roomPrice * quantity;
  }, 0);
}

function getSelectedItems() {
  return drinks
    .filter((drink) => (cart[drink.id] || 0) > 0)
    .map((drink) => ({
      drinkId: drink.id,
      quantity: cart[drink.id],
    }));
}

function updateTotals() {
  const total = getTotalAmount();
  cartTotalAmount.textContent = formatCurrency(total);
  finalTotalAmount.textContent = formatCurrency(total);
}

function changeQuantity(drinkId, change) {
  const drink = drinks.find((item) => item.id === drinkId);

  if (!drink) {
    return;
  }

  const current = cart[drinkId] || 0;
  const maxStock = Number(drink.stock || 0);

  if (change > 0 && maxStock <= current) {
    statusText.textContent = `${drink.name} sudah sold out atau capai stock maksimum.`;
    statusText.className = "status-text error";
    return;
  }

  const next = Math.max(0, current + change);
  cart[drinkId] = next;
  renderDrinks();
  updateTotals();
  statusText.textContent = "";
  statusText.className = "status-text";
}

function renderDrinks() {
  drinkCards.innerHTML = drinks
    .map((drink) => {
      const quantity = cart[drink.id] || 0;
      const stock = Number(drink.stock || 0);
      const isSoldOut = stock <= 0;

      return `
        <article class="menu-item ${quantity > 0 ? "selected" : ""} ${isSoldOut ? "sold-out" : ""}">
          <div class="drink-card-top">
            <div>
              <strong>${drink.name}</strong>
              <p>${formatCurrency(drink.roomPrice)}</p>
              <p class="stock-text">${isSoldOut ? "Sold Out" : `Stock: ${stock}`}</p>
            </div>
            <span class="drink-badge">${quantity}</span>
          </div>

          <div class="action-row" style="justify-content:flex-start; margin-top: 12px;">
            <button
              type="button"
              class="danger-btn"
              data-minus="${drink.id}"
              ${quantity === 0 ? "disabled" : ""}
            >
              -
            </button>
            <strong style="min-width:40px; text-align:center;">${quantity}</strong>
            <button
              type="button"
              class="success-btn"
              data-plus="${drink.id}"
              ${isSoldOut ? "disabled" : ""}
            >
              +
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadMenu() {
  const response = await fetch("/api/menu");
  const data = await response.json();
  drinks = data.drinks || [];
  renderDrinks();
  updateTotals();
}

document.addEventListener("click", (event) => {
  const plusBtn = event.target.closest("[data-plus]");
  const minusBtn = event.target.closest("[data-minus]");

  if (plusBtn) {
    changeQuantity(plusBtn.dataset.plus, 1);
    return;
  }

  if (minusBtn) {
    changeQuantity(minusBtn.dataset.minus, -1);
  }
});

nextStepBtn.addEventListener("click", () => {
  if (!getSelectedItems().length) {
    statusText.textContent = "Pilih sekurang-kurangnya satu minuman.";
    statusText.className = "status-text error";
    return;
  }

  stepOne.style.display = "none";
  stepTwo.style.display = "block";
  stepPillOne.classList.remove("active");
  stepPillTwo.classList.add("active");
  statusText.textContent = "";
  statusText.className = "status-text";
});

backStepBtn.addEventListener("click", () => {
  stepTwo.style.display = "none";
  stepOne.style.display = "block";
  stepPillTwo.classList.remove("active");
  stepPillOne.classList.add("active");
  statusText.textContent = "";
  statusText.className = "status-text";
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const roomNumber = orderForm.roomNumber.value.trim();
  const items = getSelectedItems();

  if (!items.length) {
    statusText.textContent = "Pilih sekurang-kurangnya satu minuman.";
    statusText.className = "status-text error";
    return;
  }

  if (!roomNumber) {
    statusText.textContent = "Sila isi no. bilik.";
    statusText.className = "status-text error";
    return;
  }

  statusText.textContent = "Submitting order...";
  statusText.className = "status-text";

  const payload = {
    customerName: "Customer",
    roomNumber,
    items,
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to submit order.");
    }

    cart = {};
    orderForm.reset();
    stepTwo.style.display = "none";
    stepOne.style.display = "block";
    stepPillTwo.classList.remove("active");
    stepPillOne.classList.add("active");

    await loadMenu();

    statusText.textContent = `Order berjaya dihantar. ${data.summary.totalItems} item, jumlah ${formatCurrency(data.summary.totalAmount)}.`;
    statusText.className = "status-text success";
  } catch (error) {
    statusText.textContent = error.message;
    statusText.className = "status-text error";
  }
});

loadMenu().catch(() => {
  statusText.textContent = "Unable to load menu.";
  statusText.className = "status-text error";
});
